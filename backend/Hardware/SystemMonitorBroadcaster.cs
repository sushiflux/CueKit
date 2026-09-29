using Deck.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Hardware;

/// <summary>Wer gerade eine Anzeige-Kachel fuer System-Werte offen hat - wie PreviewSubscribers fuer
/// die OBS-Live-Vorschau: kein Polling, solange niemand zuschaut.</summary>
public sealed class SystemMonitorSubscribers
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> _ids = new();
    public void Add(string id) => _ids[id] = 0;
    public void Remove(string id) => _ids.TryRemove(id, out _);
    public bool Any => !_ids.IsEmpty;
}

/// <summary>
/// Sendet alle 2 Sekunden einen "systemState"-Schnappschuss (CPU/GPU-Auslastung, Temperaturen,
/// RAM) an alle Geraete - aber nur, solange (a) der Dienst nativ unter Windows laeuft und
/// (b) mindestens ein Geraet eine Anzeige-Kachel offen hat. Analog zur Live-Vorschau in
/// HubNotifier.RunPreviewLoopAsync.
/// </summary>
public sealed class SystemMonitorBroadcaster(
    IHubContext<DeckHub> hub,
    ISystemMonitor monitor,
    SystemMonitorSubscribers subscribers,
    ILogger<SystemMonitorBroadcaster> log) : BackgroundService
{
    private static readonly TimeSpan ActiveInterval = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan IdleInterval = TimeSpan.FromSeconds(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Auf Nicht-Windows (Docker-Dev) gibt es nichts zu tun - ISystemMonitor ist dann NoSystemMonitor
        // und Refresh() ein No-Op, aber die Schleife wuerde sonst grundlos weiterlaufen.
        if (monitor is NoSystemMonitor) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            if (subscribers.Any)
            {
                try
                {
                    monitor.Refresh();
                    await hub.Clients.All.SendAsync("systemState", monitor.Current, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception ex)
                {
                    log.LogDebug(ex, "System-Zustand konnte nicht gesendet werden.");
                }
            }

            try { await Task.Delay(subscribers.Any ? ActiveInterval : IdleInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
