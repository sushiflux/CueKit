using Deck.Server.Automation;
using Deck.Server.Data;
using Deck.Server.Hubs;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Microsoft.EntityFrameworkCore;
using SystemVolume = Deck.Server.Hardware.ISystemVolume;

namespace Deck.Server.Actions;

public class ActionExecutionException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Fuehrt Aktionsschritte nacheinander aus - von Buttons wie von Automationen.</summary>
public class ActionExecutor(ObsService obs, PluginHost plugins, SystemVolume systemVolume, IServiceProvider services, ILogger<ActionExecutor> log)
{
    /// <summary>
    /// Schritte, die OBS steuern, werden bei fehlender OBS-Verbindung uebersprungen statt die ganze
    /// Taste abzubrechen - alle anderen Schritte (Browser oeffnen, Systemlautstaerke, Warten ...)
    /// laufen weiter. Besteht die Taste nur aus OBS-Schritten, hat sie solange keine Funktion und es
    /// gibt eine Fehlermeldung. Rueckgabe: ein Hinweistext, wenn OBS-Schritte uebersprungen wurden,
    /// waehrend uebrige Schritte gelaufen sind - sonst null.
    /// </summary>
    public async Task<string?> ExecuteAsync(IReadOnlyList<ActionStep> steps, string origin, CancellationToken ct = default)
    {
        var skippedObsSteps = 0;
        var ranSteps = 0;
        for (var i = 0; i < steps.Count; i++)
        {
            var step = steps[i];
            if (ActionCatalog.IsClientSide(step.Type) || ActionCatalog.IsDisplayOnly(step.Type)) continue;
            if (RequiresObs(step.Type) && !obs.IsConnected)
            {
                skippedObsSteps++;
                continue;
            }
            ranSteps++;
            try
            {
                await ExecuteStepAsync(step, ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                log.LogWarning("Aktion {Type} ({Origin}) fehlgeschlagen: {Message}", step.Type, origin, ex.Message);
                var name = ActionCatalog.BuiltIn.FirstOrDefault(d => d.Type == step.Type)?.Name
                           ?? plugins.ActionDefinitions.FirstOrDefault(d => d.Type == step.Type)?.Name
                           ?? step.Type;
                var prefix = steps.Count > 1 ? $"Schritt {i + 1} ({name})" : name;
                throw new ActionExecutionException($"{prefix}: {ex.Message}", ex);
            }
        }

        if (skippedObsSteps == 0) return null;
        if (ranSteps == 0)
            throw new ActionExecutionException($"{obs.NotConnectedMessage} Diese Taste steuert nur OBS und hat solange keine Funktion.");
        return $"{obs.NotConnectedMessage} {skippedObsSteps} OBS-{(skippedObsSteps == 1 ? "Schritt wurde" : "Schritte wurden")} übersprungen, die übrigen Schritte sind gelaufen.";
    }

    private static bool RequiresObs(string type) => type.StartsWith("obs.", StringComparison.Ordinal);

    private async Task ExecuteStepAsync(ActionStep step, CancellationToken ct)
    {
        switch (step.Type)
        {
            case "obs.scene.switch":
                await obs.RequestAsync("SetCurrentProgramScene", new { sceneName = Required(step, "scene") }, ct);
                break;

            case "obs.scene.preview":
                await obs.RequestAsync("SetCurrentPreviewScene", new { sceneName = Required(step, "scene") }, ct);
                break;

            case "obs.studio.transition":
                await obs.RequestAsync("TriggerStudioModeTransition", ct: ct);
                break;

            case "obs.studio":
                await obs.RequestAsync("SetStudioModeEnabled", new { studioModeEnabled = Resolve(step.Mode, obs.State.StudioMode) }, ct);
                break;

            case "obs.source.visibility":
            {
                var scene = Required(step, "scene");
                var source = Required(step, "source");
                var idNode = await obs.RequestAsync("GetSceneItemId", new { sceneName = scene, sourceName = source }, ct);
                var id = idNode?["sceneItemId"]?.GetValue<int>() ?? throw new ActionExecutionException($"Quelle '{source}' in Szene '{scene}' nicht gefunden.");
                var current = obs.State.Scenes.FirstOrDefault(s => s.Name == scene)?.Items.FirstOrDefault(x => x.Id == id)?.Enabled ?? false;
                await obs.RequestAsync("SetSceneItemEnabled", new { sceneName = scene, sceneItemId = id, sceneItemEnabled = Resolve(step.Mode, current) }, ct);
                break;
            }

            case "obs.audio.mute":
            {
                var input = Required(step, "input");
                if (step.Mode == "toggle")
                    await obs.RequestAsync("ToggleInputMute", new { inputName = input }, ct);
                else
                    await obs.RequestAsync("SetInputMute", new { inputName = input, inputMuted = step.Mode == "on" }, ct);
                break;
            }

            case "obs.stream":
                await Output(step.Mode, obs.State.Streaming, "ToggleStream", "StartStream", "StopStream", ct);
                break;

            case "obs.record":
                await Output(step.Mode, obs.State.Recording, "ToggleRecord", "StartRecord", "StopRecord", ct);
                break;

            case "obs.record.pause":
                if (!obs.State.Recording) throw new ActionExecutionException("Es läuft gerade keine Aufnahme, die pausiert werden könnte.");
                await obs.RequestAsync("ToggleRecordPause", ct: ct);
                break;

            case "obs.replay":
                await Output(step.Mode, obs.State.ReplayBuffer, "ToggleReplayBuffer", "StartReplayBuffer", "StopReplayBuffer", ct);
                break;

            case "obs.replay.save":
                if (!obs.State.ReplayBuffer) throw new ActionExecutionException("Der Replay-Puffer läuft nicht - erst starten, dann speichern.");
                await obs.RequestAsync("SaveReplayBuffer", ct: ct);
                break;

            case "obs.vcam":
                await Output(step.Mode, obs.State.VirtualCam, "ToggleVirtualCam", "StartVirtualCam", "StopVirtualCam", ct);
                break;

            case "obs.audio.volume":
            {
                var input = Required(step, "input");
                double target;
                if (step.Str("mode") == "set")
                {
                    target = step.Dbl("value") ?? throw new ActionExecutionException("Zielwert in dB fehlt.");
                }
                else
                {
                    var current = await obs.RequestAsync("GetInputVolume", new { inputName = input }, ct);
                    var db = current?["inputVolumeDb"]?.GetValue<double>() ?? -100;
                    if (!double.IsFinite(db)) db = -100;
                    var stepDb = Math.Abs(step.Dbl("step") ?? 3);
                    // Vom ganz heruntergezogenen Regler aus nicht ewig in -100-dB-Schritten "lauter" klicken.
                    if (db < -60 && step.Str("mode") != "down") db = -60 - stepDb;
                    target = step.Str("mode") == "down" ? db - stepDb : Math.Min(db + stepDb, Math.Max(0, db));
                }
                await obs.RequestAsync("SetInputVolume", new { inputName = input, inputVolumeDb = Math.Clamp(target, -100, 26) }, ct);
                break;
            }

            case "obs.media":
            {
                var input = Required(step, "input");
                var mode = step.Str("mode") ?? "playpause";
                if (mode == "playpause")
                    mode = obs.State.MediaInputs.FirstOrDefault(m => m.Name == input)?.Playing == true ? "pause" : "play";
                var mediaAction = mode switch
                {
                    "play" => "PLAY", "pause" => "PAUSE", "stop" => "STOP", "restart" => "RESTART",
                    "next" => "NEXT", "previous" => "PREVIOUS",
                    _ => throw new ActionExecutionException($"Unbekannte Medien-Aktion '{mode}'."),
                };
                await obs.RequestAsync("TriggerMediaInputAction", new { inputName = input, mediaAction = $"OBS_WEBSOCKET_MEDIA_INPUT_ACTION_{mediaAction}" }, ct);
                break;
            }

            case "obs.source.refresh":
                await obs.RequestAsync("PressInputPropertiesButton", new { inputName = Required(step, "input"), propertyName = "refreshnocache" }, ct);
                break;

            case "obs.filter":
            {
                var source = Required(step, "source");
                var filter = Required(step, "filter");
                var enabled = step.Mode switch
                {
                    "on" => true,
                    "off" => false,
                    _ => !((await obs.RequestAsync("GetSourceFilter", new { sourceName = source, filterName = filter }, ct))?["filterEnabled"]?.GetValue<bool>() ?? false),
                };
                await obs.RequestAsync("SetSourceFilterEnabled", new { sourceName = source, filterName = filter, filterEnabled = enabled }, ct);
                break;
            }

            case "obs.transition.set":
                await obs.RequestAsync("SetCurrentSceneTransition", new { transitionName = Required(step, "transition") }, ct);
                if (step.Int("duration") is > 0 and var duration)
                    await obs.RequestAsync("SetCurrentSceneTransitionDuration", new { transitionDuration = Math.Clamp(duration, 50, 20000) }, ct);
                break;

            case "obs.collection":
                await obs.RequestAsync("SetCurrentSceneCollection", new { sceneCollectionName = Required(step, "collection") }, ct);
                break;

            case "obs.profile":
                await obs.RequestAsync("SetCurrentProfile", new { profileName = Required(step, "profile") }, ct);
                break;

            case "obs.record.chapter":
                if (!obs.State.Recording) throw new ActionExecutionException("Es läuft keine Aufnahme – Kapitelmarken gehen nur während der Aufnahme.");
                await obs.RequestAsync("CreateRecordChapter", step.Str("name") is { Length: > 0 } chapter ? new { chapterName = chapter } : null, ct);
                break;

            case "obs.record.split":
                if (!obs.State.Recording) throw new ActionExecutionException("Es läuft keine Aufnahme, die geteilt werden könnte.");
                await obs.RequestAsync("SplitRecordFile", ct: ct);
                break;

            case "automation.toggle":
                await ToggleAutomationAsync(step, ct);
                break;

            case "obs.hotkey":
                await obs.RequestAsync("TriggerHotkeyByName", new { hotkeyName = Required(step, "name") }, ct);
                break;

            case "flow.delay":
                await Task.Delay(Math.Clamp(step.Int("ms") ?? 1000, 0, 600_000), ct);
                break;

            case "system.volume":
                ExecuteSystemVolume(step);
                break;

            case "system.mute":
                ExecuteSystemMute(step);
                break;

            case "system.browser.open":
                OpenBrowser(Required(step, "url"));
                break;

            case "system.program.open":
                OpenProgram(Required(step, "path"), step.Str("arguments"));
                break;

            case "system.path.open":
                OpenPath(Required(step, "path"));
                break;

            case "system.shutdown":
                Shutdown(force: step.Str("mode") == "force");
                break;

            default:
                if (PluginHost.TryParseActionType(step.Type, out var pluginId, out var actionId))
                {
                    await plugins.InvokeAsync(pluginId, actionId, step.Params, ct);
                    break;
                }
                throw new ActionExecutionException($"Unbekannte Aktion '{step.Type}'.");
        }
    }

    private async Task ToggleAutomationAsync(ActionStep step, CancellationToken ct)
    {
        var id = step.Int("automation") ?? throw new ActionExecutionException("Keine Automation ausgewählt.");
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var automation = await db.Automations.FirstOrDefaultAsync(a => a.Id == id, ct)
                         ?? throw new ActionExecutionException("Diese Automation gibt es nicht mehr.");
        automation.Enabled = step.Mode switch { "on" => true, "off" => false, _ => !automation.Enabled };
        await db.SaveChangesAsync(ct);
        // Aufgeloest erst hier: AutomationEngine haengt selbst vom ActionExecutor ab.
        services.GetRequiredService<AutomationEngine>().Invalidate();
        services.GetRequiredService<HubNotifier>().AutomationsChanged();
    }

    private async Task Output(string mode, bool active, string toggle, string start, string stop, CancellationToken ct)
    {
        switch (mode)
        {
            case "on" or "start": if (!active) await obs.RequestAsync(start, ct: ct); break;
            case "off" or "stop": if (active) await obs.RequestAsync(stop, ct: ct); break;
            default: await obs.RequestAsync(toggle, ct: ct); break;
        }
    }

    private static bool Resolve(string mode, bool current) => mode switch
    {
        "on" or "start" => true,
        "off" or "stop" => false,
        _ => !current,
    };

    private static string Required(ActionStep step, string key) =>
        step.Str(key) is { Length: > 0 } v ? v : throw new ActionExecutionException($"Pflichtfeld '{key}' ist nicht gesetzt.");

    private void ExecuteSystemVolume(ActionStep step)
    {
        try
        {
            switch (step.Mode)
            {
                case "set":
                    var value = step.Int("value") ?? throw new ActionExecutionException("Zielwert in % fehlt.");
                    systemVolume.SetPercent(value);
                    break;
                case "down":
                    systemVolume.Adjust(-Math.Abs(step.Int("step") ?? 5));
                    break;
                default:
                    systemVolume.Adjust(Math.Abs(step.Int("step") ?? 5));
                    break;
            }
        }
        catch (InvalidOperationException ex) { throw new ActionExecutionException(ex.Message, ex); }
    }

    private void ExecuteSystemMute(ActionStep step)
    {
        try
        {
            switch (step.Mode)
            {
                case "on": systemVolume.SetMuted(true); break;
                case "off": systemVolume.SetMuted(false); break;
                default: systemVolume.ToggleMuted(); break;
            }
        }
        catch (InvalidOperationException ex) { throw new ActionExecutionException(ex.Message, ex); }
    }

    private static readonly HashSet<string> ProgramExtensions = [".exe", ".bat", ".cmd", ".com", ".lnk"];

    private static void RequireWindows()
    {
        if (!OperatingSystem.IsWindows())
            throw new ActionExecutionException("Nur auf dem nativ installierten Windows-Dienst verfügbar (nicht im Docker-Container).");
    }

    private static void StartProcess(System.Diagnostics.ProcessStartInfo info, string failure)
    {
        try
        {
            System.Diagnostics.Process.Start(info)?.Dispose();
        }
        catch (Exception ex)
        {
            throw new ActionExecutionException($"{failure}: {ex.Message}", ex);
        }
    }

    /// <summary>Startet ein fest hinterlegtes Programm. Der Pfad kommt aus der vom Besitzer angelegten Taste
    /// (nie vom druckenden Geraet); trotzdem nur vollstaendige Pfade zu existierenden Programmdateien.</summary>
    private static void OpenProgram(string path, string? arguments)
    {
        RequireWindows();
        path = path.Trim().Trim('"');
        if (!Path.IsPathFullyQualified(path))
            throw new ActionExecutionException($"„{path}“ ist kein vollständiger Pfad (z.B. C:\\Programme\\App\\app.exe).");
        if (!ProgramExtensions.Contains(Path.GetExtension(path).ToLowerInvariant()))
            throw new ActionExecutionException($"„{Path.GetFileName(path)}“ ist kein Programm (erlaubt: .exe, .bat, .cmd, .com, .lnk).");
        if (!System.IO.File.Exists(path))
            throw new ActionExecutionException($"Programm nicht gefunden: {path}");
        StartProcess(
            new System.Diagnostics.ProcessStartInfo(path)
            {
                UseShellExecute = true,
                Arguments = arguments?.Trim() ?? "",
                WorkingDirectory = Path.GetDirectoryName(path) ?? "",
            },
            "Programm konnte nicht gestartet werden");
    }

    /// <summary>Oeffnet einen Ordner im Explorer bzw. eine Datei mit ihrem Standardprogramm.</summary>
    private static void OpenPath(string path)
    {
        RequireWindows();
        path = path.Trim().Trim('"');
        if (!Path.IsPathFullyQualified(path))
            throw new ActionExecutionException($"„{path}“ ist kein vollständiger Pfad (z.B. C:\\Dokumente\\Tabelle.xlsx).");
        if (!System.IO.Directory.Exists(path) && !System.IO.File.Exists(path))
            throw new ActionExecutionException($"Datei oder Ordner nicht gefunden: {path}");
        StartProcess(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true }, "Konnte nicht geöffnet werden");
    }

    /// <summary>Faehrt den PC herunter. "/t 0" ohne "/f": Programme duerfen nachfragen (ungespeicherte Daten).
    /// Mit "force" zusaetzlich "/f" - alles wird sofort beendet. (Ein "/t" groesser 0 wuerde Windows
    /// automatisch als "/f" werten und waere deshalb kein "normales" Herunterfahren mehr.)</summary>
    private static void Shutdown(bool force)
    {
        RequireWindows();
        StartProcess(
            new System.Diagnostics.ProcessStartInfo("shutdown.exe", force ? "/s /f /t 0" : "/s /t 0") { UseShellExecute = false, CreateNoWindow = true },
            "Herunterfahren fehlgeschlagen");
    }

    /// <summary>Oeffnet eine Adresse im Standardbrowser. Nur http/https - kein UseShellExecute auf
    /// beliebige Strings (file://, javascript: usw. explizit abgelehnt, siehe Sicherheits-Baseline).</summary>
    private static void OpenBrowser(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
            throw new ActionExecutionException($"„{url}“ ist keine gültige http/https-Adresse.");
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            throw new ActionExecutionException($"Browser konnte nicht geöffnet werden: {ex.Message}", ex);
        }
    }
}
