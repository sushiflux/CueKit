using Deck.Server.Automation;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Deck.Server.Services;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Hubs;

/// <summary>Leitet Zustandsaenderungen der Dienste an alle verbundenen Geraete weiter.</summary>
public sealed class HubNotifier(
    IHubContext<DeckHub> hub,
    ObsService obs,
    PluginHost plugins,
    PluginManager pluginManager,
    AutomationEngine automations,
    PreviewSubscribers previewSubscribers,
    SettingsService settings,
    ILogger<HubNotifier> log) : BackgroundService
{
    private int _statePending;

    /// <summary>Tasten/Decks geaendert - z.B. fuer die systemweiten Tastenkuerzel.</summary>
    public event Action? DecksChanged;

    public Task DecksChangedAsync()
    {
        DecksChanged?.Invoke();
        return hub.Clients.All.SendAsync("decksChanged");
    }

    /// <summary>Automationen angelegt/geaendert/an- oder ausgeschaltet -> Tasten-LEDs aktualisieren.</summary>
    public void AutomationsChanged() => _ = hub.Clients.All.SendAsync("automationsChanged");

    /// <summary>App-weite Aussehen-Einstellungen (Zustandsanzeige/Druckverhalten/Hintergrund) geaendert.</summary>
    public void AppearanceChanged() => _ = hub.Clients.All.SendAsync("appearanceChanged");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        obs.StateChanged += OnObsStateChanged;
        plugins.Changed += OnCatalogChanged;
        plugins.Changed += OnPluginsChanged;
        pluginManager.Changed += OnPluginsChanged;
        automations.RunsChanged += OnAutomationsChanged;
        try
        {
            await RunPreviewLoopAsync(stoppingToken);
        }
        finally
        {
            obs.StateChanged -= OnObsStateChanged;
            plugins.Changed -= OnCatalogChanged;
            plugins.Changed -= OnPluginsChanged;
            pluginManager.Changed -= OnPluginsChanged;
            automations.RunsChanged -= OnAutomationsChanged;
        }
    }

    /// <summary>OBS-Events kommen oft in Salven - auf 50 ms entprellen, dann den aktuellen Stand senden.</summary>
    private void OnObsStateChanged(ObsSnapshot snapshot)
    {
        if (Interlocked.Exchange(ref _statePending, 1) == 1) return;
        _ = Task.Run(async () =>
        {
            await Task.Delay(50);
            Interlocked.Exchange(ref _statePending, 0);
            await hub.Clients.All.SendAsync("obsState", obs.State);
        });
    }

    private void OnCatalogChanged() => _ = hub.Clients.All.SendAsync("catalogChanged");

    /// <summary>Installiert/gestartet/abgestuerzt/verbunden - fuer die Plugin-Seite.</summary>
    private void OnPluginsChanged() => _ = hub.Clients.All.SendAsync("pluginsChanged");

    private void OnAutomationsChanged() => _ = hub.Clients.All.SendAsync("automationsChanged");

    /// <summary>
    /// Live-Vorschau des Programm-Ausgangs: nur solange mindestens ein Geraet sie angefordert hat,
    /// damit OBS nicht grundlos Screenshots rendert.
    /// </summary>
    private async Task RunPreviewLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var interval = TimeSpan.FromMilliseconds(1000.0 / settings.PreviewFps);
            try
            {
                var state = obs.State;
                if (previewSubscribers.Any && state.Status == ObsConnectionStatus.Connected && state.ProgramScene is { } scene)
                {
                    var shot = await obs.RequestAsync("GetSourceScreenshot", new
                    {
                        sourceName = scene,
                        imageFormat = "jpg",
                        imageWidth = 640,
                        imageCompressionQuality = 70,
                    }, ct);
                    if (shot?["imageData"]?.GetValue<string>() is { } dataUrl)
                        await hub.Clients.Group(DeckHub.PreviewGroup).SendAsync("preview", dataUrl, ct);
                }
                else
                {
                    interval = TimeSpan.FromMilliseconds(500);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                log.LogDebug("Vorschaubild fehlgeschlagen: {Message}", ex.Message);
                interval = TimeSpan.FromSeconds(1);
            }

            try { await Task.Delay(interval, ct); } catch (OperationCanceledException) { break; }
        }
    }
}
