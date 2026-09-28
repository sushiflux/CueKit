using Deck.Server.Obs;
using Deck.Server.Plugins;

namespace Deck.Server.Actions;

public class ActionExecutionException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Fuehrt Aktionsschritte nacheinander aus - von Buttons wie von Automationen.</summary>
public class ActionExecutor(ObsService obs, PluginHost plugins, ILogger<ActionExecutor> log)
{
    public async Task ExecuteAsync(IReadOnlyList<ActionStep> steps, string origin, CancellationToken ct = default)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            var step = steps[i];
            if (ActionCatalog.IsClientSide(step.Type)) continue;
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
    }

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

            case "obs.hotkey":
                await obs.RequestAsync("TriggerHotkeyByName", new { hotkeyName = Required(step, "name") }, ct);
                break;

            case "flow.delay":
                await Task.Delay(Math.Clamp(step.Int("ms") ?? 1000, 0, 600_000), ct);
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
}
