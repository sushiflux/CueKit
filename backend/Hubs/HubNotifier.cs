using Deck.Server.Automation;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Hubs;

/// <summary>Leitet Zustandsaenderungen der Dienste an alle verbundenen Geraete weiter.</summary>
public sealed class HubNotifier(
    IHubContext<DeckHub> hub,
    ObsService obs,
    PluginHost plugins,
    PluginManager pluginManager,
    AutomationEngine automations) : BackgroundService
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

    /// <summary>Schaltzustand eines Multi-Aktionsschalters geändert.</summary>
    public void SwitchStateChanged(int buttonId, bool isOn) => _ = hub.Clients.All.SendAsync("switchStateChanged", buttonId, isOn);

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        obs.StateChanged += OnObsStateChanged;
        plugins.Changed += OnCatalogChanged;
        plugins.Changed += OnPluginsChanged;
        pluginManager.Changed += OnPluginsChanged;
        automations.RunsChanged += OnAutomationsChanged;
        stoppingToken.Register(() =>
        {
            obs.StateChanged -= OnObsStateChanged;
            plugins.Changed -= OnCatalogChanged;
            plugins.Changed -= OnPluginsChanged;
            pluginManager.Changed -= OnPluginsChanged;
            automations.RunsChanged -= OnAutomationsChanged;
        });
        return Task.CompletedTask;
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
}
