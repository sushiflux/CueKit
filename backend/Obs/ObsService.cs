using System.Text.Json.Nodes;
using Deck.Server.Services;

namespace Deck.Server.Obs;

/// <summary>
/// Haelt die Verbindung zu OBS dauerhaft aufrecht (automatischer Reconnect, z.B. wenn OBS erst
/// nach dem Dienst gestartet wird) und fuehrt einen aktuellen <see cref="ObsSnapshot"/>.
/// </summary>
public sealed class ObsService(SettingsService settings, ILogger<ObsService> log) : BackgroundService
{
    private static readonly HashSet<string> StructuralEvents =
    [
        "SceneListChanged", "SceneCreated", "SceneRemoved", "SceneNameChanged",
        "SceneItemCreated", "SceneItemRemoved", "SceneItemListReindexed",
        "InputCreated", "InputRemoved", "InputNameChanged",
        "CurrentSceneCollectionChanged", "SceneCollectionListChanged", "ProfileListChanged",
        "SceneTransitionCreated", "SceneTransitionRemoved", "SceneTransitionNameChanged",
    ];

    private readonly object _lock = new();
    private ObsSnapshot _state = ObsSnapshot.Empty;
    private ObsWebSocketClient? _client;
    private CancellationTokenSource? _sessionCts;
    private int _reloadScheduled;

    public ObsSnapshot State { get { lock (_lock) return _state; } }

    /// <summary>Feuert bei jeder Zustandsaenderung (Aufrufer sollte selbst entprellen).</summary>
    public event Action<ObsSnapshot>? StateChanged;

    /// <summary>Rohe OBS-Events (fuer die Automations-Engine): eventType, eventData.</summary>
    public event Action<string, JsonNode?>? ObsEvent;

    /// <summary>Beendet die aktuelle Sitzung, damit der Verbindungsloop mit neuen Einstellungen neu verbindet.</summary>
    public void Reconnect() => _sessionCts?.Cancel();

    public async Task<JsonNode?> RequestAsync(string requestType, object? data = null, CancellationToken ct = default)
    {
        var client = _client;
        if (client is null || !client.IsOpen)
            // Den konkreten Grund nennen (z.B. falsches Passwort), nicht nur "nicht verbunden".
            throw new InvalidOperationException(State.Error is { Length: > 0 } reason
                ? $"OBS ist nicht verbunden – {reason}"
                : "OBS ist nicht verbunden. Läuft OBS und ist der WebSocket-Server unter Werkzeuge > WebSocket-Server-Einstellungen aktiviert?");
        return await client.RequestAsync(requestType, data, ct);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        settings.Changed += key =>
        {
            if (key is SettingKeys.ObsHost or SettingKeys.ObsPort or SettingKeys.ObsPassword) Reconnect();
        };

        var delay = TimeSpan.FromSeconds(1);
        while (!stoppingToken.IsCancellationRequested)
        {
            _sessionCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            var session = _sessionCts.Token;

            // Eine kaputte Adresse darf nie den Dienst beenden - nur als Fehler anzeigen und auf
            // neue Einstellungen warten.
            if (!TryBuildUri(settings.ObsHost, settings.ObsPort, out var uri))
            {
                Update(_ => ObsSnapshot.Empty with { Error = $"Ungültige OBS-Adresse „{settings.ObsHost}:{settings.ObsPort}“. Bitte unter Einstellungen > OBS-Verbindung nur IP/Rechnername eintragen, den Port ins Feld „Port“." });
                try { await Task.Delay(Timeout.Infinite, session); } catch (OperationCanceledException) { }
                if (stoppingToken.IsCancellationRequested) break;
                continue;
            }
            Update(s => s with { Status = ObsConnectionStatus.Connecting });

            var client = new ObsWebSocketClient();
            var closed = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            client.Closed += reason => closed.TrySetResult(reason);
            client.EventReceived += OnEvent;

            string? error = null;
            try
            {
                await client.ConnectAsync(uri, settings.ObsPassword, session);
                _client = client;
                await LoadFullStateAsync(session);
                log.LogInformation("Mit OBS verbunden ({Uri}).", uri);
                delay = TimeSpan.FromSeconds(1);

                // Bleibt verbunden, bis OBS trennt oder ein Reconnect angefordert wird.
                var cancelled = Task.Delay(Timeout.Infinite, session);
                var finished = await Task.WhenAny(closed.Task, cancelled);
                if (finished == closed.Task) error = closed.Task.Result;
            }
            catch (OperationCanceledException) when (session.IsCancellationRequested) { }
            catch (UnauthorizedAccessException ex) { error = ex.Message; }
            catch (Exception ex)
            {
                error = ex is System.Net.WebSockets.WebSocketException or OperationCanceledException or TimeoutException
                    ? $"OBS nicht erreichbar unter {uri.Host}:{uri.Port}. Läuft OBS und ist der WebSocket-Server aktiviert (Werkzeuge > WebSocket-Server-Einstellungen)?"
                    : ex.Message;
            }
            finally
            {
                _client = null;
                client.EventReceived -= OnEvent;
                await client.DisposeAsync();
            }

            if (stoppingToken.IsCancellationRequested) break;
            var reconnectRequested = session.IsCancellationRequested;
            Update(_ => ObsSnapshot.Empty with { Error = error });
            if (reconnectRequested) continue;

            if (error is not null) log.LogDebug("OBS: {Error}", error);
            try { await Task.Delay(delay, stoppingToken); } catch (OperationCanceledException) { break; }
            delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 10));
        }
    }

    /// <summary>
    /// Laeuft der Dienst im Container, meint "127.0.0.1"/"localhost" den Container selbst - OBS
    /// laeuft aber auf dem Windows-Host. Dann automatisch auf host.docker.internal umleiten.
    /// </summary>
    private static bool TryBuildUri(string host, int port, out Uri uri)
    {
        var inContainer = Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true";
        host = host.Trim('[', ']');
        if (inContainer && host is "127.0.0.1" or "localhost" or "::1") host = "host.docker.internal";
        // IPv6-Adressen brauchen in einer URL eckige Klammern: ws://[fe80::1]:4455
        var hostPart = System.Net.IPAddress.TryParse(host, out var ip) && ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 ? $"[{host}]" : host;
        var ok = Uri.TryCreate($"ws://{hostPart}:{port}", UriKind.Absolute, out var parsed) && port is > 0 and <= 65535;
        uri = parsed!;
        return ok;
    }

    private async Task LoadFullStateAsync(CancellationToken ct)
    {
        var version = await RequestAsync("GetVersion", ct: ct);
        var sceneList = await RequestAsync("GetSceneList", ct: ct);

        // OBS liefert Szenen "von unten nach oben" (sceneIndex 0 = unterste) - fuer die Anzeige
        // drehen, damit die Reihenfolge der OBS-Szenenliste entspricht.
        var sceneNames = sceneList?["scenes"]?.AsArray()
            .Select(s => s!["sceneName"]!.GetValue<string>()).Reverse().ToList() ?? [];

        var scenes = new List<ObsScene>();
        foreach (var name in sceneNames)
            scenes.Add(new ObsScene(name, await LoadSceneItemsAsync(name, ct)));

        var inputList = await RequestAsync("GetInputList", ct: ct);
        var inputs = new List<ObsInput>();
        var audio = new List<ObsAudioInput>();
        var media = new List<ObsMediaInput>();
        foreach (var input in inputList?["inputs"]?.AsArray() ?? [])
        {
            var name = input!["inputName"]!.GetValue<string>();
            var kind = input["unversionedInputKind"]?.GetValue<string>() ?? input["inputKind"]?.GetValue<string>() ?? "";
            inputs.Add(new ObsInput(name, kind));
            try
            {
                var mute = await RequestAsync("GetInputMute", new { inputName = name }, ct);
                var volume = await RequestAsync("GetInputVolume", new { inputName = name }, ct);
                audio.Add(new ObsAudioInput(name, mute?["inputMuted"]?.GetValue<bool>() ?? false, Db(volume?["inputVolumeDb"])));
            }
            catch (ObsRequestException) { /* Quelle ohne Audio */ }
            if (IsMediaKind(kind))
            {
                try
                {
                    var status = await RequestAsync("GetMediaInputStatus", new { inputName = name }, ct);
                    media.Add(new ObsMediaInput(name, status?["mediaState"]?.GetValue<string>() == "OBS_MEDIA_STATE_PLAYING"));
                }
                catch (ObsRequestException) { media.Add(new ObsMediaInput(name, false)); }
            }
        }

        var transitions = await TryRequest("GetSceneTransitionList", ct);
        var collections = await TryRequest("GetSceneCollectionList", ct);
        var profiles = await TryRequest("GetProfileList", ct);

        var stream = await RequestAsync("GetStreamStatus", ct: ct);
        var record = await RequestAsync("GetRecordStatus", ct: ct);
        var replay = await TryRequestBool("GetReplayBufferStatus", "outputActive", ct);
        var vcam = await TryRequestBool("GetVirtualCamStatus", "outputActive", ct);
        var studio = await TryRequestBool("GetStudioModeEnabled", "studioModeEnabled", ct);

        var now = DateTimeOffset.UtcNow;
        var streaming = stream?["outputActive"]?.GetValue<bool>() ?? false;
        var recording = record?["outputActive"]?.GetValue<bool>() ?? false;

        Update(_ => new ObsSnapshot(
            ObsConnectionStatus.Connected,
            null,
            version?["obsVersion"]?.GetValue<string>(),
            sceneList?["currentProgramSceneName"]?.GetValue<string>(),
            now,
            sceneList?["currentPreviewSceneName"]?.GetValue<string>(),
            studio,
            scenes,
            audio,
            inputs,
            media,
            transitions?["transitions"]?.AsArray().Select(t => t!["transitionName"]!.GetValue<string>()).ToList() ?? [],
            transitions?["currentSceneTransitionName"]?.GetValue<string>(),
            collections?["sceneCollections"]?.AsArray().Select(n => n!.GetValue<string>()).ToList() ?? [],
            collections?["currentSceneCollectionName"]?.GetValue<string>(),
            profiles?["profiles"]?.AsArray().Select(n => n!.GetValue<string>()).ToList() ?? [],
            profiles?["currentProfileName"]?.GetValue<string>(),
            streaming,
            streaming ? now.AddMilliseconds(-(stream?["outputDuration"]?.GetValue<double>() ?? 0)) : null,
            recording,
            record?["outputPaused"]?.GetValue<bool>() ?? false,
            recording ? now.AddMilliseconds(-(record?["outputDuration"]?.GetValue<double>() ?? 0)) : null,
            replay,
            vcam));
    }

    public static bool IsMediaKind(string kind) => kind is "ffmpeg_source" or "vlc_source";

    /// <summary>OBS meldet einen ganz heruntergezogenen Regler teils als -inf bzw. sehr kleinen Wert.</summary>
    private static double Db(JsonNode? node)
    {
        var db = node is JsonValue v && v.TryGetValue<double>(out var d) ? d : -100;
        return double.IsFinite(db) ? Math.Clamp(db, -100, 26) : -100;
    }

    private async Task<JsonNode?> TryRequest(string requestType, CancellationToken ct)
    {
        try { return await RequestAsync(requestType, ct: ct); }
        catch (ObsRequestException) { return null; }
    }
    private async Task<IReadOnlyList<ObsSceneItem>> LoadSceneItemsAsync(string sceneName, CancellationToken ct)
    {
        var items = await RequestAsync("GetSceneItemList", new { sceneName }, ct);
        return items?["sceneItems"]?.AsArray()
            .Select(i => new ObsSceneItem(
                i!["sceneItemId"]!.GetValue<int>(),
                i["sourceName"]!.GetValue<string>(),
                i["sceneItemEnabled"]?.GetValue<bool>() ?? true,
                i["isGroup"]?.GetValue<bool>() ?? false))
            .Reverse() // wie in OBS: oberste Quelle zuerst
            .ToList() ?? [];
    }

    private async Task<bool> TryRequestBool(string requestType, string field, CancellationToken ct)
    {
        try { return (await RequestAsync(requestType, ct: ct))?[field]?.GetValue<bool>() ?? false; }
        catch (ObsRequestException) { return false; } // z.B. Replay-Buffer nicht konfiguriert
    }

    private void OnEvent(string type, JsonNode? data)
    {
        var now = DateTimeOffset.UtcNow;
        switch (type)
        {
            case "CurrentProgramSceneChanged":
                Update(s => s with { ProgramScene = Str(data, "sceneName"), ProgramSceneSince = now });
                break;
            case "CurrentPreviewSceneChanged":
                Update(s => s with { PreviewScene = Str(data, "sceneName") });
                break;
            case "StudioModeStateChanged":
                Update(s => s with { StudioMode = Bool(data, "studioModeEnabled") });
                break;
            case "SceneItemEnableStateChanged":
            {
                var scene = Str(data, "sceneName");
                var id = data?["sceneItemId"]?.GetValue<int>();
                var enabled = Bool(data, "sceneItemEnabled");
                Update(s => s with
                {
                    Scenes = s.Scenes.Select(sc => sc.Name != scene ? sc : sc with
                    {
                        Items = sc.Items.Select(i => i.Id == id ? i with { Enabled = enabled } : i).ToList(),
                    }).ToList(),
                });
                break;
            }
            case "InputMuteStateChanged":
            {
                var name = Str(data, "inputName");
                var muted = Bool(data, "inputMuted");
                Update(s => s with { AudioInputs = s.AudioInputs.Select(a => a.Name == name ? a with { Muted = muted } : a).ToList() });
                break;
            }
            case "StreamStateChanged":
            {
                var active = Bool(data, "outputActive");
                Update(s => s with { Streaming = active, StreamStartedAt = active ? s.StreamStartedAt ?? now : null });
                break;
            }
            case "RecordStateChanged":
            {
                var active = Bool(data, "outputActive");
                var state = Str(data, "outputState");
                Update(s => s with
                {
                    Recording = active,
                    RecordPaused = state == "OBS_WEBSOCKET_OUTPUT_PAUSED" || (s.RecordPaused && state != "OBS_WEBSOCKET_OUTPUT_RESUMED" && active),
                    RecordStartedAt = active ? s.RecordStartedAt ?? now : null,
                });
                break;
            }
            case "InputVolumeChanged":
            {
                var name = Str(data, "inputName");
                var db = Db(data?["inputVolumeDb"]);
                Update(s => s with { AudioInputs = s.AudioInputs.Select(a => a.Name == name ? a with { VolumeDb = db } : a).ToList() });
                break;
            }
            case "MediaInputPlaybackStarted" or "MediaInputPlaybackEnded":
            {
                var name = Str(data, "inputName");
                var playing = type == "MediaInputPlaybackStarted";
                Update(s => s with { MediaInputs = s.MediaInputs.Select(m => m.Name == name ? m with { Playing = playing } : m).ToList() });
                break;
            }
            case "MediaInputActionTriggered":
            {
                var name = Str(data, "inputName");
                bool? playing = Str(data, "mediaAction") switch
                {
                    "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY" or "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" => true,
                    "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" or "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP" => false,
                    _ => null,
                };
                if (playing is { } p)
                    Update(s => s with { MediaInputs = s.MediaInputs.Select(m => m.Name == name ? m with { Playing = p } : m).ToList() });
                break;
            }
            case "CurrentSceneTransitionChanged":
                Update(s => s with { CurrentTransition = Str(data, "transitionName") });
                break;
            case "CurrentProfileChanged":
                Update(s => s with { CurrentProfile = Str(data, "profileName") });
                break;
            case "ReplayBufferStateChanged":
                Update(s => s with { ReplayBuffer = Bool(data, "outputActive") });
                break;
            case "VirtualcamStateChanged":
                Update(s => s with { VirtualCam = Bool(data, "outputActive") });
                break;
            default:
                if (StructuralEvents.Contains(type)) ScheduleReload();
                break;
        }

        ObsEvent?.Invoke(type, data);
    }

    /// <summary>Strukturaenderungen (Szenen/Quellen angelegt, umbenannt...) kommen oft in Salven -
    /// einmal gesammelt nachladen statt pro Event.</summary>
    private void ScheduleReload()
    {
        if (Interlocked.Exchange(ref _reloadScheduled, 1) == 1) return;
        _ = Task.Run(async () =>
        {
            await Task.Delay(250);
            Interlocked.Exchange(ref _reloadScheduled, 0);
            try
            {
                var program = State.ProgramScene;
                var since = State.ProgramSceneSince;
                await LoadFullStateAsync(_sessionCts?.Token ?? CancellationToken.None);
                // Szenen-Timer nicht zuruecksetzen, nur weil eine Quelle umbenannt wurde.
                if (State.ProgramScene == program) Update(s => s with { ProgramSceneSince = since });
            }
            catch (Exception ex) { log.LogDebug(ex, "OBS-Zustand konnte nicht neu geladen werden."); }
        });
    }

    private void Update(Func<ObsSnapshot, ObsSnapshot> change)
    {
        ObsSnapshot next;
        lock (_lock) { next = _state = change(_state); }
        StateChanged?.Invoke(next);
    }

    private static string? Str(JsonNode? d, string key) => d?[key]?.GetValue<string>();
    private static bool Bool(JsonNode? d, string key) => d?[key]?.GetValue<bool>() ?? false;
}
