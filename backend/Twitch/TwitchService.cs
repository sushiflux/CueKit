using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using Deck.Server.Hubs;
using Deck.Server.Services;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Twitch;

/// <summary>
/// Oeffentlicher Twitch-Stand fuer alle gekoppelten Geraete (Live-Zuschauer, Follower, Subs ...). Enthaelt bewusst keine
/// Zugangsdaten und keine Nutzer-ID - nur das, was ohnehin auf dem Twitch-Kanal oeffentlich sichtbar ist plus den Anmeldenamen.
/// </summary>
public record TwitchSnapshot(
    bool Configured,
    bool Connected,
    string? Login,
    bool Live,
    int Viewers,
    DateTimeOffset? StartedAt,
    string? Title,
    string? Game,
    int? Followers,
    int? Subs,
    bool SubsAvailable,
    string? Error,
    // Anzeige-Einstellungen fuers obere OLED (Einstellungen > Twitch): jede Angabe laesst sich einzeln ausblenden.
    bool ShowViewers,
    bool ShowSubs,
    bool ShowCategory,
    bool ShowTitle,
    DateTimeOffset UpdatedAt);

/// <summary>Laufende Anmeldung (Device-Code): der Nutzer oeffnet <see cref="VerificationUri"/> und gibt <see cref="UserCode"/> ein.</summary>
public record TwitchDeviceFlow(string UserCode, string VerificationUri, DateTimeOffset ExpiresAt);

/// <summary>Status fuer den Besitzer (Einstellungen): Snapshot + laufende Anmeldung + Hinweis auf die gespeicherte Client-ID (nie vollstaendig).</summary>
public record TwitchStatus(TwitchSnapshot Snapshot, TwitchDeviceFlow? Flow, string? ClientIdHint);

public class TwitchException(string message, int status = 0, Exception? inner = null) : Exception(message, inner)
{
    public int Status { get; } = status;
}

/// <summary>
/// Twitch-Anbindung: Anmeldung ueber den Device-Code-Ablauf (Anwendungstyp "Public" - es gibt KEIN Client-Secret in der App;
/// jeder Nutzer meldet sich mit seinem eigenen Twitch-Konto an), Live-Zahlen per Helix-API sowie Aktionen (Clip, Marker).
/// Zugangs- und Auffrischungs-Token liegen verschluesselt in der Datenbank (DataProtection), werden nie geloggt und nie an
/// Clients gesendet. Die Server-Adressen sind ueber Deck:Twitch:AuthUrl / Deck:Twitch:ApiUrl ueberschreibbar (Tests).
/// </summary>
public sealed class TwitchService(SettingsService settings, IHttpClientFactory httpFactory, IConfiguration config, IHubContext<DeckHub> hub, ILogger<TwitchService> log) : BackgroundService
{
    /// <summary>Minimal noetige Berechtigungen: Follower lesen, Subs lesen, Clips erstellen, Marker setzen.</summary>
    public const string Scopes = "moderator:read:followers channel:read:subscriptions clips:edit channel:manage:broadcast";

    private static readonly TimeSpan StreamInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan CountsInterval = TimeSpan.FromSeconds(90);

    private string AuthUrl => (config["Deck:Twitch:AuthUrl"] ?? "https://id.twitch.tv").TrimEnd('/');
    private string ApiUrl => (config["Deck:Twitch:ApiUrl"] ?? "https://api.twitch.tv/helix").TrimEnd('/');

    private readonly SemaphoreSlim _tokenGate = new(1, 1);
    private readonly object _stateLock = new();
    private TwitchSnapshot? _snapshot;
    private TwitchDeviceFlow? _flow;
    private CancellationTokenSource? _flowCts;
    private DateTimeOffset _lastStream = DateTimeOffset.MinValue;
    private DateTimeOffset _lastCounts = DateTimeOffset.MinValue;
    private volatile bool _pollNow;

    public string? ClientId => settings.Get(SettingKeys.TwitchClientId) is { Length: > 0 } id ? id : null;
    public TwitchDeviceFlow? Flow { get { lock (_stateLock) return _flow; } }

    public string? ClientIdHint => ClientId is { Length: > 6 } id ? id[..4] + "…" : (ClientId is null ? null : "…");

    public TwitchSnapshot Snapshot
    {
        get
        {
            lock (_stateLock) return _snapshot ??= Build(null);
        }
    }

    private TwitchSnapshot Build(TwitchSnapshot? previous)
    {
        var connected = !string.IsNullOrEmpty(settings.Get(SettingKeys.TwitchRefreshToken)) && !string.IsNullOrEmpty(settings.Get(SettingKeys.TwitchUserId));
        return (previous ?? new TwitchSnapshot(false, false, null, false, 0, null, null, null, null, null, true, null, true, true, true, true, DateTimeOffset.UtcNow)) with
        {
            Configured = ClientId is not null,
            Connected = connected,
            Login = connected ? settings.Get(SettingKeys.TwitchLogin) : null,
            ShowViewers = settings.Get(SettingKeys.TwitchShowViewers) != "false",
            ShowSubs = settings.Get(SettingKeys.TwitchShowSubs) != "false",
            ShowCategory = settings.Get(SettingKeys.TwitchShowCategory) != "false",
            ShowTitle = settings.Get(SettingKeys.TwitchShowTitle) != "false",
        };
    }

    // ---------------- Einstellungen / Anmeldung ----------------

    public async Task SetClientIdAsync(string clientId, CancellationToken ct)
    {
        clientId = clientId.Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(clientId, "^[a-z0-9]{20,40}$"))
            throw new TwitchException("Die Client-ID sieht nicht richtig aus: Sie besteht aus 20 bis 40 Kleinbuchstaben und Ziffern (aus der Twitch-Entwicklerkonsole, Anwendung vom Typ „Öffentlich“).");
        if (ClientId != clientId)
        {
            await DisconnectAsync(ct); // andere App -> alte Anmeldung gilt nicht mehr
            await settings.SetAsync(SettingKeys.TwitchClientId, clientId, ct);
        }
        Publish(s => Build(s));
    }

    /// <summary>Stellt ein, welche Twitch-Angaben im oberen OLED erscheinen (Zuschauer, Subs, Kategorie, Titel).</summary>
    public async Task SetDisplayAsync(bool viewers, bool subs, bool category, bool title, CancellationToken ct)
    {
        await settings.SetManyAsync(new Dictionary<string, string>
        {
            [SettingKeys.TwitchShowViewers] = viewers ? "true" : "false",
            [SettingKeys.TwitchShowSubs] = subs ? "true" : "false",
            [SettingKeys.TwitchShowCategory] = category ? "true" : "false",
            [SettingKeys.TwitchShowTitle] = title ? "true" : "false",
        }, ct);
        Publish(s => Build(s));
    }

    public async Task<TwitchDeviceFlow> StartConnectAsync(CancellationToken ct)
    {
        var clientId = ClientId ?? throw new TwitchException("Erst die Twitch-Client-ID eintragen (Einstellungen > Twitch).", 409);
        CancelFlow();

        using var http = httpFactory.CreateClient("twitch");
        using var response = await http.PostAsync($"{AuthUrl}/oauth2/device",
            new FormUrlEncodedContent(new Dictionary<string, string> { ["client_id"] = clientId, ["scopes"] = Scopes }), ct);
        var doc = await ReadJsonAsync(response, ct);
        if (!response.IsSuccessStatusCode)
            throw new TwitchException($"Twitch lehnt die Anmeldung ab: {ErrorMessage(doc, response.StatusCode)} Stimmt die Client-ID, und ist die Anwendung vom Typ „Öffentlich“?", (int)response.StatusCode);

        var root = doc.RootElement;
        var deviceCode = root.GetProperty("device_code").GetString()!;
        var interval = root.TryGetProperty("interval", out var iv) ? Math.Max(1, iv.GetInt32()) : 5;
        var expires = DateTimeOffset.UtcNow.AddSeconds(root.GetProperty("expires_in").GetInt32());
        var flow = new TwitchDeviceFlow(root.GetProperty("user_code").GetString()!, root.GetProperty("verification_uri").GetString()!, expires);

        var cts = new CancellationTokenSource();
        lock (_stateLock) { _flow = flow; _flowCts = cts; }
        Publish(s => (s ?? Build(null)) with { Error = null });
        _ = Task.Run(() => PollDeviceAsync(clientId, deviceCode, interval, expires, cts.Token), CancellationToken.None);
        return flow;
    }

    private async Task PollDeviceAsync(string clientId, string deviceCode, int interval, DateTimeOffset expires, CancellationToken ct)
    {
        try
        {
            using var http = httpFactory.CreateClient("twitch");
            while (!ct.IsCancellationRequested && DateTimeOffset.UtcNow < expires)
            {
                await Task.Delay(TimeSpan.FromSeconds(interval), ct);
                using var response = await http.PostAsync($"{AuthUrl}/oauth2/token", new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = clientId,
                    ["scopes"] = Scopes,
                    ["device_code"] = deviceCode,
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code",
                }), ct);
                var doc = await ReadJsonAsync(response, ct);
                if (response.IsSuccessStatusCode)
                {
                    await StoreTokensAsync(doc.RootElement, ct);
                    await LoadIdentityAsync(ct);
                    ClearFlow();
                    _lastStream = _lastCounts = DateTimeOffset.MinValue;
                    _pollNow = true;
                    Publish(s => Build(s) with { Error = null });
                    return;
                }

                var message = ErrorMessage(doc, response.StatusCode);
                if (message.Contains("authorization_pending", StringComparison.OrdinalIgnoreCase)) continue;
                if (message.Contains("slow_down", StringComparison.OrdinalIgnoreCase)) { interval += 5; continue; }
                ClearFlow();
                Publish(s => Build(s) with { Error = message.Contains("access_denied", StringComparison.OrdinalIgnoreCase) ? "Die Anmeldung wurde auf Twitch abgelehnt." : $"Anmeldung fehlgeschlagen: {message}" });
                return;
            }
            if (!ct.IsCancellationRequested)
            {
                ClearFlow();
                Publish(s => Build(s) with { Error = "Der Anmelde-Code ist abgelaufen. Bitte „Mit Twitch verbinden“ erneut wählen." });
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Twitch-Anmeldung fehlgeschlagen.");
            ClearFlow();
            Publish(s => Build(s) with { Error = $"Anmeldung fehlgeschlagen: {ex.Message}" });
        }
    }

    public async Task DisconnectAsync(CancellationToken ct)
    {
        CancelFlow();
        var clientId = ClientId;
        var access = settings.Get(SettingKeys.TwitchAccessToken) is { Length: > 0 } enc ? settings.Unprotect(enc) : null;
        if (clientId is not null && access is not null)
        {
            try // Token bei Twitch widerrufen - best effort, ein Fehler hier darf das Trennen nicht verhindern
            {
                using var http = httpFactory.CreateClient("twitch");
                using var _ = await http.PostAsync($"{AuthUrl}/oauth2/revoke", new FormUrlEncodedContent(new Dictionary<string, string> { ["client_id"] = clientId, ["token"] = access }), ct);
            }
            catch (Exception ex) { log.LogDebug(ex, "Twitch-Token konnte nicht widerrufen werden."); }
        }
        await settings.SetManyAsync(new Dictionary<string, string>
        {
            [SettingKeys.TwitchAccessToken] = "",
            [SettingKeys.TwitchRefreshToken] = "",
            [SettingKeys.TwitchTokenExpiresAt] = "",
            [SettingKeys.TwitchUserId] = "",
            [SettingKeys.TwitchLogin] = "",
        }, ct);
        lock (_stateLock) _snapshot = null;
        Publish(s => Build(null));
    }

    // ---------------- Aktionen ----------------

    /// <summary>Erstellt einen Clip der letzten Sekunden des laufenden Streams.</summary>
    public async Task CreateClipAsync(CancellationToken ct)
    {
        var userId = RequireConnected();
        using var doc = await ApiAsync(HttpMethod.Post, $"/clips?broadcaster_id={Uri.EscapeDataString(userId)}", null, ct,
            offlineMessage: "Der Kanal ist gerade nicht live – Clips gehen nur während eines Streams.");
    }

    /// <summary>Setzt einen Stream-Marker (Lesezeichen im VOD) mit optionaler Beschreibung (max. 140 Zeichen).</summary>
    public async Task CreateMarkerAsync(string? description, CancellationToken ct)
    {
        var userId = RequireConnected();
        var body = JsonSerializer.Serialize(new { user_id = userId, description = (description ?? "").Trim() is { Length: > 0 } d ? (d.Length > 140 ? d[..140] : d) : null },
            new JsonSerializerOptions { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull });
        using var doc = await ApiAsync(HttpMethod.Post, "/streams/markers", new StringContent(body, System.Text.Encoding.UTF8, "application/json"), ct,
            offlineMessage: "Der Kanal ist gerade nicht live – Marker gehen nur während eines Streams.");
    }

    /// <summary>Aendert die Kategorie (Spiel) des Kanals. Sucht den Namen bei Twitch; bei mehreren Treffern gewinnt die genaue Schreibweise.</summary>
    public async Task SetCategoryAsync(string? name, CancellationToken ct)
    {
        var userId = RequireConnected();
        name = name?.Trim();
        if (string.IsNullOrEmpty(name)) throw new TwitchException("Kein Kategoriename angegeben.");
        string gameId;
        using (var search = await ApiAsync(HttpMethod.Get, $"/search/categories?query={Uri.EscapeDataString(name)}&first=10", null, ct))
        {
            var hits = search.RootElement.GetProperty("data").EnumerateArray().ToList();
            var hit = hits.FirstOrDefault(h => string.Equals(h.GetProperty("name").GetString(), name, StringComparison.OrdinalIgnoreCase));
            if (hit.ValueKind == JsonValueKind.Undefined && hits.Count > 0) hit = hits[0];
            if (hit.ValueKind == JsonValueKind.Undefined) throw new TwitchException($"Die Kategorie „{name}“ wurde bei Twitch nicht gefunden.", 404);
            gameId = hit.GetProperty("id").GetString()!;
        }
        using var _ = await ApiAsync(new HttpMethod("PATCH"), $"/channels?broadcaster_id={Uri.EscapeDataString(userId)}",
            new StringContent(JsonSerializer.Serialize(new { game_id = gameId }), System.Text.Encoding.UTF8, "application/json"), ct);
        _pollNow = true; // neue Kategorie sofort im OLED
    }

    /// <summary>Aendert den Stream-Titel (Twitch erlaubt maximal 140 Zeichen).</summary>
    public async Task SetTitleAsync(string? title, CancellationToken ct)
    {
        var userId = RequireConnected();
        title = title?.Trim();
        if (string.IsNullOrEmpty(title)) throw new TwitchException("Kein Titel angegeben.");
        if (title.Length > 140) title = title[..140];
        using var _ = await ApiAsync(new HttpMethod("PATCH"), $"/channels?broadcaster_id={Uri.EscapeDataString(userId)}",
            new StringContent(JsonSerializer.Serialize(new { title }), System.Text.Encoding.UTF8, "application/json"), ct);
        _pollNow = true;
    }

    private string RequireConnected()
    {
        if (settings.Get(SettingKeys.TwitchUserId) is not { Length: > 0 } userId || string.IsNullOrEmpty(settings.Get(SettingKeys.TwitchRefreshToken)))
            throw new TwitchException("Twitch ist nicht verbunden (Einstellungen > Twitch).", 409);
        return userId;
    }

    // ---------------- Abfrage-Schleife ----------------

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (Snapshot.Connected)
                {
                    var now = DateTimeOffset.UtcNow;
                    if (_pollNow || now - _lastStream >= StreamInterval)
                    {
                        _lastStream = now;
                        await RefreshStreamAsync(stoppingToken);
                    }
                    if (_pollNow || now - _lastCounts >= CountsInterval)
                    {
                        _lastCounts = now;
                        await RefreshCountsAsync(stoppingToken);
                    }
                    _pollNow = false;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                log.LogDebug(ex, "Twitch-Abfrage fehlgeschlagen.");
                Publish(s => (s ?? Build(null)) with { Error = ex is TwitchException ? ex.Message : $"Twitch ist nicht erreichbar: {ex.Message}" });
            }

            try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RefreshStreamAsync(CancellationToken ct)
    {
        var userId = settings.Get(SettingKeys.TwitchUserId)!;
        using var doc = await ApiAsync(HttpMethod.Get, $"/streams?user_id={Uri.EscapeDataString(userId)}", null, ct);
        var data = doc.RootElement.GetProperty("data");
        if (data.GetArrayLength() == 0)
        {
            Publish(s => Build(s) with { Live = false, Viewers = 0, StartedAt = null, Title = null, Game = null, Error = null });
            return;
        }
        var stream = data[0];
        var viewers = stream.TryGetProperty("viewer_count", out var v) ? v.GetInt32() : 0;
        DateTimeOffset? started = stream.TryGetProperty("started_at", out var st) && DateTimeOffset.TryParse(st.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? parsed : null;
        var title = stream.TryGetProperty("title", out var t) ? t.GetString() : null;
        var game = stream.TryGetProperty("game_name", out var g) ? g.GetString() : null;
        Publish(s => Build(s) with { Live = true, Viewers = viewers, StartedAt = started, Title = title, Game = game, Error = null });
    }

    private async Task RefreshCountsAsync(CancellationToken ct)
    {
        var userId = settings.Get(SettingKeys.TwitchUserId)!;
        int? followers = null;
        int? subs = null;
        var subsAvailable = true;
        string? error = null;

        try
        {
            using var f = await ApiAsync(HttpMethod.Get, $"/channels/followers?broadcaster_id={Uri.EscapeDataString(userId)}&first=1", null, ct);
            followers = f.RootElement.TryGetProperty("total", out var total) ? total.GetInt32() : null;
        }
        catch (TwitchException ex) when (ex.Status is 401 or 403) { error = "Follower konnten nicht gelesen werden: Berechtigung fehlt – bitte unter Einstellungen > Twitch neu verbinden."; }

        try
        {
            using var s = await ApiAsync(HttpMethod.Get, $"/subscriptions?broadcaster_id={Uri.EscapeDataString(userId)}&first=1", null, ct);
            subs = s.RootElement.TryGetProperty("total", out var total) ? total.GetInt32() : null;
        }
        catch (TwitchException ex) when (ex.Status == 400 && ex.Message.Contains("subscription", StringComparison.OrdinalIgnoreCase)) { subsAvailable = false; } // kein Affiliate/Partner
        catch (TwitchException ex) when (ex.Status is 401 or 403) { error ??= "Subs konnten nicht gelesen werden: Berechtigung fehlt – bitte unter Einstellungen > Twitch neu verbinden."; }

        Publish(s => Build(s) with { Followers = followers, Subs = subs, SubsAvailable = subsAvailable, Error = error });
    }

    // ---------------- Token / HTTP ----------------

    private async Task StoreTokensAsync(JsonElement token, CancellationToken ct)
    {
        var access = token.GetProperty("access_token").GetString()!;
        var refresh = token.TryGetProperty("refresh_token", out var r) ? r.GetString() : null;
        var expiresIn = token.TryGetProperty("expires_in", out var e) ? e.GetInt32() : 3600;
        var values = new Dictionary<string, string>
        {
            [SettingKeys.TwitchAccessToken] = settings.Protect(access),
            [SettingKeys.TwitchTokenExpiresAt] = DateTimeOffset.UtcNow.AddSeconds(expiresIn).ToString("O", CultureInfo.InvariantCulture),
        };
        if (!string.IsNullOrEmpty(refresh)) values[SettingKeys.TwitchRefreshToken] = settings.Protect(refresh);
        await settings.SetManyAsync(values, ct);
    }

    /// <summary>Holt Anmeldename und Nutzer-ID zum frisch erhaltenen Token (nur serverseitig gespeichert).</summary>
    private async Task LoadIdentityAsync(CancellationToken ct)
    {
        var access = settings.Unprotect(settings.Get(SettingKeys.TwitchAccessToken)!);
        using var http = httpFactory.CreateClient("twitch");
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{AuthUrl}/oauth2/validate");
        request.Headers.Authorization = new AuthenticationHeaderValue("OAuth", access);
        using var response = await http.SendAsync(request, ct);
        var doc = await ReadJsonAsync(response, ct);
        if (!response.IsSuccessStatusCode) throw new TwitchException($"Die Anmeldung konnte nicht bestaetigt werden: {ErrorMessage(doc, response.StatusCode)}", (int)response.StatusCode);
        await settings.SetManyAsync(new Dictionary<string, string>
        {
            [SettingKeys.TwitchUserId] = doc.RootElement.GetProperty("user_id").GetString()!,
            [SettingKeys.TwitchLogin] = doc.RootElement.GetProperty("login").GetString()!,
        }, ct);
    }

    private async Task<string> GetAccessTokenAsync(bool forceRefresh, CancellationToken ct)
    {
        await _tokenGate.WaitAsync(ct);
        try
        {
            var enc = settings.Get(SettingKeys.TwitchAccessToken);
            var expires = DateTimeOffset.TryParse(settings.Get(SettingKeys.TwitchTokenExpiresAt), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var e) ? e : DateTimeOffset.MinValue;
            if (!forceRefresh && !string.IsNullOrEmpty(enc) && expires - DateTimeOffset.UtcNow > TimeSpan.FromMinutes(5)) return settings.Unprotect(enc);

            var refreshEnc = settings.Get(SettingKeys.TwitchRefreshToken);
            var clientId = ClientId;
            if (string.IsNullOrEmpty(refreshEnc) || clientId is null)
                throw new TwitchException("Twitch ist nicht verbunden (Einstellungen > Twitch).", 409);

            using var http = httpFactory.CreateClient("twitch");
            using var response = await http.PostAsync($"{AuthUrl}/oauth2/token", new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = settings.Unprotect(refreshEnc),
                ["client_id"] = clientId,
            }), ct);
            var doc = await ReadJsonAsync(response, ct);
            if (!response.IsSuccessStatusCode)
            {
                if ((int)response.StatusCode is 400 or 401)
                {
                    // Auffrischungs-Token ungueltig (widerrufen/abgelaufen): Anmeldung verwerfen, Nutzer muss neu verbinden.
                    await settings.SetManyAsync(new Dictionary<string, string> { [SettingKeys.TwitchAccessToken] = "", [SettingKeys.TwitchRefreshToken] = "", [SettingKeys.TwitchUserId] = "", [SettingKeys.TwitchLogin] = "" }, ct);
                    Publish(s => Build(s) with { Error = "Die Twitch-Anmeldung ist abgelaufen oder wurde widerrufen – bitte unter Einstellungen > Twitch neu verbinden.", Live = false, Viewers = 0 });
                }
                throw new TwitchException($"Die Twitch-Anmeldung konnte nicht erneuert werden: {ErrorMessage(doc, response.StatusCode)}", (int)response.StatusCode);
            }
            await StoreTokensAsync(doc.RootElement, ct);
            return settings.Unprotect(settings.Get(SettingKeys.TwitchAccessToken)!);
        }
        finally { _tokenGate.Release(); }
    }

    private async Task<JsonDocument> ApiAsync(HttpMethod method, string path, HttpContent? content, CancellationToken ct, string? offlineMessage = null)
    {
        var clientId = ClientId ?? throw new TwitchException("Erst die Twitch-Client-ID eintragen (Einstellungen > Twitch).", 409);
        for (var attempt = 0; ; attempt++)
        {
            var token = await GetAccessTokenAsync(forceRefresh: attempt > 0, ct);
            using var http = httpFactory.CreateClient("twitch");
            using var request = new HttpRequestMessage(method, ApiUrl + path) { Content = content };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Add("Client-Id", clientId);
            using var response = await http.SendAsync(request, ct);
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && attempt == 0)
            {
                content = content is null ? null : await CloneAsync(content, ct); // Inhalt kann nur einmal gesendet werden
                continue;
            }
            var doc = await ReadJsonAsync(response, ct);
            if (response.IsSuccessStatusCode) return doc;

            var message = ErrorMessage(doc, response.StatusCode);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound && offlineMessage is not null) message = offlineMessage;
            else if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized) message = "Die Twitch-Anmeldung wurde nicht akzeptiert – bitte unter Einstellungen > Twitch neu verbinden.";
            else if (response.StatusCode == System.Net.HttpStatusCode.Forbidden && message.Contains("scope", StringComparison.OrdinalIgnoreCase)) message = "Twitch-Berechtigung fehlt – bitte unter Einstellungen > Twitch neu verbinden.";
            throw new TwitchException(message, (int)response.StatusCode);
        }
    }

    private static async Task<HttpContent> CloneAsync(HttpContent content, CancellationToken ct)
    {
        var text = await content.ReadAsStringAsync(ct);
        return new StringContent(text, System.Text.Encoding.UTF8, content.Headers.ContentType?.MediaType ?? "application/json");
    }

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var text = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(text)) return JsonDocument.Parse("{}");
        try { return JsonDocument.Parse(text); }
        catch (JsonException) { return JsonDocument.Parse("{}"); }
    }

    private static string ErrorMessage(JsonDocument doc, System.Net.HttpStatusCode status)
    {
        var root = doc.RootElement;
        if (root.ValueKind == JsonValueKind.Object)
        {
            if (root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(m.GetString())) return m.GetString()!;
            if (root.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString())) return e.GetString()!;
        }
        return $"HTTP {(int)status}";
    }

    // ---------------- Zustand / Ereignisse ----------------

    private void CancelFlow()
    {
        CancellationTokenSource? cts;
        lock (_stateLock) { cts = _flowCts; _flowCts = null; _flow = null; }
        try { cts?.Cancel(); } catch { /* bereits entsorgt */ }
    }

    private void ClearFlow()
    {
        lock (_stateLock) { _flow = null; _flowCts = null; }
    }

    private void Publish(Func<TwitchSnapshot?, TwitchSnapshot> change)
    {
        TwitchSnapshot next;
        bool differs;
        lock (_stateLock)
        {
            var previous = _snapshot;
            next = change(previous) with { UpdatedAt = DateTimeOffset.UtcNow };
            differs = previous is null || previous with { UpdatedAt = default } != next with { UpdatedAt = default };
            _snapshot = next;
        }
        if (differs) _ = hub.Clients.All.SendAsync("twitch", next);
    }
}
