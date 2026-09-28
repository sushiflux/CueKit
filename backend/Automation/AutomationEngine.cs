using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Deck.Server.Actions;
using Deck.Server.Data;
using Deck.Server.Obs;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Automation;

/// <summary>
/// Wertet Automationen aus: reagiert auf OBS-Events und prueft sekuendlich zeitbasierte Ausloeser
/// (z.B. "Szene laeuft seit 5 Minuten" oder "alle 10 Minuten").
/// </summary>
public sealed class AutomationEngine(
    IServiceScopeFactory scopes,
    ObsService obs,
    ActionExecutor executor,
    ILogger<AutomationEngine> log) : BackgroundService
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record Loaded(int Id, string Name, AutomationPart Trigger, IReadOnlyList<AutomationPart> Conditions, IReadOnlyList<ActionStep> Actions);

    private volatile IReadOnlyList<Loaded> _automations = [];
    private readonly ConcurrentDictionary<int, AutomationRunInfo> _lastRuns = new();
    private readonly ConcurrentDictionary<int, DateTimeOffset> _sceneTimerFiredFor = new();
    private readonly ConcurrentDictionary<int, DateTimeOffset> _intervalLastRun = new();
    private readonly ConcurrentDictionary<int, byte> _running = new();
    private int _reloadRequested = 1;

    public event Action? RunsChanged;

    public IReadOnlyDictionary<int, AutomationRunInfo> LastRuns => _lastRuns;

    /// <summary>Nach jeder Aenderung an Automationen aufrufen.</summary>
    public void Invalidate() => Interlocked.Exchange(ref _reloadRequested, 1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        obs.ObsEvent += OnObsEvent;
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
            do
            {
                if (Interlocked.Exchange(ref _reloadRequested, 0) == 1)
                    await ReloadAsync(stoppingToken);
                Tick();
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) { }
        finally
        {
            obs.ObsEvent -= OnObsEvent;
        }
    }

    private async Task ReloadAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var list = new List<Loaded>();
        foreach (var a in await db.Automations.AsNoTracking().Where(a => a.Enabled).ToListAsync(ct))
        {
            try
            {
                list.Add(new Loaded(a.Id, a.Name,
                    JsonSerializer.Deserialize<AutomationPart>(a.TriggerJson, Json) ?? throw new JsonException("Trigger fehlt"),
                    JsonSerializer.Deserialize<List<AutomationPart>>(a.ConditionsJson, Json) ?? [],
                    JsonSerializer.Deserialize<List<ActionStep>>(a.ActionsJson, Json) ?? []));
            }
            catch (JsonException ex)
            {
                log.LogWarning("Automation {Name} ist fehlerhaft gespeichert und wird uebersprungen: {Message}", a.Name, ex.Message);
            }
        }
        _automations = list;
    }

    private void Tick()
    {
        var state = obs.State;
        if (state.Status != ObsConnectionStatus.Connected) return;
        var now = DateTimeOffset.UtcNow;

        foreach (var a in _automations)
        {
            switch (a.Trigger.Type)
            {
                case "obs.sceneActiveFor":
                {
                    var scene = a.Trigger.AsStep().Str("scene");
                    var seconds = a.Trigger.AsStep().Int("seconds") ?? 300;
                    if (state.ProgramScene != scene || state.ProgramSceneSince is not { } since) break;
                    if (now - since < TimeSpan.FromSeconds(Math.Max(1, seconds))) break;
                    // Pro "Live-Phase" der Szene nur einmal feuern.
                    if (_sceneTimerFiredFor.TryGetValue(a.Id, out var firedFor) && firedFor == since) break;
                    _sceneTimerFiredFor[a.Id] = since;
                    Fire(a, state);
                    break;
                }
                case "schedule.interval":
                {
                    var seconds = Math.Max(5, a.Trigger.AsStep().Int("seconds") ?? 600);
                    var last = _intervalLastRun.GetOrAdd(a.Id, now);
                    if (now - last < TimeSpan.FromSeconds(seconds)) break;
                    _intervalLastRun[a.Id] = now;
                    Fire(a, state);
                    break;
                }
            }
        }
    }

    private void OnObsEvent(string type, JsonNode? data)
    {
        var triggerType = type switch
        {
            "CurrentProgramSceneChanged" => "obs.sceneChanged",
            "StreamStateChanged" => OutputTrigger(data, "obs.streamStarted", "obs.streamStopped"),
            "RecordStateChanged" => OutputTrigger(data, "obs.recordStarted", "obs.recordStopped"),
            _ => null,
        };
        if (triggerType is null) return;

        var state = obs.State;
        foreach (var a in _automations.Where(a => a.Trigger.Type == triggerType))
        {
            if (triggerType == "obs.sceneChanged")
            {
                var wanted = a.Trigger.AsStep().Str("scene");
                if (!string.IsNullOrEmpty(wanted) && wanted != data?["sceneName"]?.GetValue<string>()) continue;
            }
            Fire(a, state);
        }
    }

    private static string? OutputTrigger(JsonNode? data, string started, string stopped) =>
        data?["outputState"]?.GetValue<string>() switch
        {
            "OBS_WEBSOCKET_OUTPUT_STARTED" => started,
            "OBS_WEBSOCKET_OUTPUT_STOPPED" => stopped,
            _ => null,
        };

    private static bool ConditionsMet(Loaded a, ObsSnapshot s) => a.Conditions.All(c =>
    {
        var step = c.AsStep();
        return c.Type switch
        {
            "obs.currentSceneIs" => s.ProgramScene == step.Str("scene"),
            "obs.currentSceneIsNot" => s.ProgramScene != step.Str("scene"),
            "obs.isStreaming" => s.Streaming == (step.Str("value") != "false"),
            "obs.isRecording" => s.Recording == (step.Str("value") != "false"),
            _ => false, // unbekannte Bedingung -> sicherheitshalber nicht ausfuehren
        };
    });

    private void Fire(Loaded a, ObsSnapshot state)
    {
        if (!ConditionsMet(a, state)) return;
        // Eine Automation laeuft nie parallel zu sich selbst (z.B. lange "Warten"-Schritte).
        if (!_running.TryAdd(a.Id, 0)) return;

        _ = Task.Run(async () =>
        {
            try
            {
                await executor.ExecuteAsync(a.Actions, $"Automation '{a.Name}'");
                _lastRuns[a.Id] = new AutomationRunInfo(DateTimeOffset.UtcNow, true, null);
            }
            catch (Exception ex)
            {
                _lastRuns[a.Id] = new AutomationRunInfo(DateTimeOffset.UtcNow, false, ex.Message);
            }
            finally
            {
                _running.TryRemove(a.Id, out _);
                RunsChanged?.Invoke();
            }
        });
    }
}
