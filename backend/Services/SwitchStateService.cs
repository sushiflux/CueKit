using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Deck.Server.Actions;
using Deck.Server.Data;
using Deck.Server.Hubs;
using Deck.Server.Obs;

namespace Deck.Server.Services;

/// <summary>
/// Verwaltet und synchronisiert den Schaltzustand (Zustand 1 / An vs. Zustand 2 / Aus)
/// aller Multi-Aktionsschalter ("deck.multiSwitch").
/// </summary>
public class SwitchStateService
{
    private readonly ConcurrentDictionary<int, bool> _states = new();
    private readonly string _filePath;
    private readonly ObsService _obs;
    private readonly HubNotifier _notifier;
    private readonly ILogger<SwitchStateService> _log;

    public SwitchStateService(DataPaths dataPaths, ObsService obs, HubNotifier notifier, ILogger<SwitchStateService> log)
    {
        _filePath = Path.Combine(dataPaths.DataDir, "switch-states.json");
        _obs = obs;
        _notifier = notifier;
        _log = log;
        Load();
    }

    /// <summary>Liefert alle gespeicherten Schalterzustände (ButtonId -> isOn).</summary>
    public IReadOnlyDictionary<int, bool> GetAll() => _states;

    /// <summary>Ermittelt den aktuellen Zustand eines Multi-Aktionsschalters.</summary>
    public bool GetState(ButtonEntity button, ActionStep switchStep)
    {
        var onSteps = GetSubSteps(switchStep.Params, "onSteps");
        if (TryEvaluateObsState(onSteps, out var obsState))
        {
            _states[button.Id] = obsState;
            return obsState;
        }

        if (_states.TryGetValue(button.Id, out var state))
        {
            return state;
        }

        return false;
    }

    /// <summary>
    /// Führt den Tastendruck eines Multi-Aktionsschalters aus:
    /// Schaltet den Zustand um (von Aus zu An oder von An zu Aus) und führt die jeweiligen Aktionen aus.
    /// </summary>
    public async Task<PressResult> ExecuteSwitchPressAsync(ButtonEntity button, ActionStep switchStep, ActionExecutor executor, CancellationToken ct)
    {
        var currentlyOn = GetState(button, switchStep);
        var targetState = !currentlyOn;

        var onSteps = GetSubSteps(switchStep.Params, "onSteps");
        var offSteps = GetSubSteps(switchStep.Params, "offSteps");
        var stepsToRun = targetState ? onSteps : offSteps;

        string? notice = null;
        if (stepsToRun.Count > 0)
        {
            var stateLabel = targetState ? "Zustand 1 (An)" : "Zustand 2 (Aus)";
            notice = await executor.ExecuteAsync(stepsToRun, $"Schalter '{button.Label}' ({stateLabel})", ct);
        }

        _states[button.Id] = targetState;
        Save();
        _notifier.SwitchStateChanged(button.Id, targetState);

        return new PressResult(true, null, notice);
    }

    /// <summary>Entfernt den Zustand einer gelöschten Taste.</summary>
    public void Remove(int buttonId)
    {
        if (_states.TryRemove(buttonId, out _))
        {
            Save();
        }
    }

    /// <summary>Setzt alle Zustände zurück (z.B. bei Deck-Import/Reset).</summary>
    public void Clear()
    {
        _states.Clear();
        Save();
    }

    /// <summary>
    /// Prüft, ob alle in den Einschalt-Schritten enthaltenen OBS-Ziele (Audioquellen, Sichtbarkeiten etc.)
    /// bereits live in OBS den gewünschten Zustand haben.
    /// </summary>
    private bool TryEvaluateObsState(List<ActionStep> onSteps, out bool isActive)
    {
        isActive = false;
        if (!_obs.IsConnected) return false;

        var testableCount = 0;
        var activeCount = 0;

        foreach (var step in onSteps)
        {
            if (step.Type == "obs.audio.mute")
            {
                var input = step.Str("input");
                if (string.IsNullOrEmpty(input)) continue;
                var audio = _obs.State.AudioInputs.FirstOrDefault(a => a.Name == input);
                if (audio is null) continue;
                testableCount++;
                var mode = step.Mode; // "off" = Ton an, "on" = Stumm, "toggle" = Umschalten
                var matches = mode == "off" ? !audio.Muted : mode == "on" ? audio.Muted : !audio.Muted;
                if (matches) activeCount++;
            }
            else if (step.Type == "obs.source.visibility")
            {
                var scene = step.Str("scene");
                var source = step.Str("source");
                if (string.IsNullOrEmpty(scene) || string.IsNullOrEmpty(source)) continue;
                var sceneObj = _obs.State.Scenes.FirstOrDefault(s => s.Name == scene);
                var item = sceneObj?.Items.FirstOrDefault(i => i.SourceName == source);
                if (item is null) continue;
                testableCount++;
                var mode = step.Mode; // "on" = Einblenden, "off" = Ausblenden
                var matches = mode == "off" ? !item.Enabled : item.Enabled;
                if (matches) activeCount++;
            }
            else if (step.Type == "obs.stream")
            {
                testableCount++;
                var mode = step.Mode;
                var matches = mode == "off" ? !_obs.State.Streaming : _obs.State.Streaming;
                if (matches) activeCount++;
            }
            else if (step.Type == "obs.record")
            {
                testableCount++;
                var mode = step.Mode;
                var matches = mode == "off" ? !_obs.State.Recording : _obs.State.Recording;
                if (matches) activeCount++;
            }
        }

        if (testableCount == 0) return false;
        isActive = activeCount == testableCount;
        return true;
    }

    /// <summary>Liest Unterschritte aus einem ActionStep-Params-Objekt.</summary>
    public static List<ActionStep> GetSubSteps(JsonObject? p, string key)
    {
        if (p != null && p.TryGetPropertyValue(key, out var node) && node is not null)
        {
            try
            {
                return node.Deserialize<List<ActionStep>>(JsonSerializerOptions.Web) ?? [];
            }
            catch
            {
                return [];
            }
        }
        return [];
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_filePath))
            {
                var json = File.ReadAllText(_filePath);
                var dict = JsonSerializer.Deserialize<Dictionary<int, bool>>(json);
                if (dict != null)
                {
                    foreach (var (k, v) in dict) _states[k] = v;
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Konnte Schalter-Zustände aus {Path} nicht laden", _filePath);
        }
    }

    private void Save()
    {
        try
        {
            var json = JsonSerializer.Serialize(_states);
            File.WriteAllText(_filePath, json);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Konnte Schalter-Zustände nicht in {Path} speichern", _filePath);
        }
    }
}
