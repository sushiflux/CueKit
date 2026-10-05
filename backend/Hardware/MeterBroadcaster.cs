using Deck.Server.Hubs;
using Deck.Server.Obs;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Hardware;

/// <summary>Wer gerade Tasten mit Live-Pegelanzeige offen hat - solange niemand zuschaut, wird weder
/// bei OBS die hochfrequente Pegel-Event-Gruppe abonniert noch der Windows-Pegel abgefragt.</summary>
public sealed class MeterSubscribers
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> _ids = new();
    public void Add(string id) => _ids[id] = 0;
    public void Remove(string id) => _ids.TryRemove(id, out _);
    public bool Any => !_ids.IsEmpty;
}

/// <summary>
/// Sendet den Live-Pegel (dB) als "meters"-Nachricht an alle Geraete, die eine Pegel-Taste offen
/// haben: <c>{ obs: { "<Eingang>": dB }, system: dB|null }</c>. OBS-Pegel kommen als Events von OBS
/// (bis ~50/s), der Windows-Pegel wird hier abgefragt; gesendet wird hoechstens alle 50 ms und nur,
/// wenn sich ein Wert geaendert hat (bei Stille also gar nicht).
/// </summary>
public sealed class MeterBroadcaster(
    IHubContext<DeckHub> hub,
    ObsService obs,
    ISystemVolume systemVolume,
    MeterSubscribers subscribers,
    ILogger<MeterBroadcaster> log) : BackgroundService
{
    private static readonly TimeSpan ActiveInterval = TimeSpan.FromMilliseconds(50);
    private static readonly TimeSpan IdleInterval = TimeSpan.FromMilliseconds(250);
    private static readonly IReadOnlyDictionary<string, ObsMeterLevel> NoLevels = new Dictionary<string, ObsMeterLevel>();

    private volatile IReadOnlyDictionary<string, ObsMeterLevel> _obsLevels = NoLevels;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        obs.MetersChanged += OnObsMeters;
        var subscribed = false;
        IReadOnlyDictionary<string, ObsMeterLevel> lastObs = NoLevels;
        double? lastSystem = null;
        Dictionary<string, double> lastWin = [];
        IReadOnlyList<AudioDeviceInfo> devices = [];
        var devicesRefreshedTicks = 0L;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var any = subscribers.Any;
                if (any != subscribed)
                {
                    subscribed = any;
                    obs.SetMetersWanted(any);
                    if (!any) _obsLevels = NoLevels;
                    lastObs = NoLevels;
                    lastSystem = null;
                    lastWin = [];
                }

                if (any)
                {
                    try
                    {
                        var system = systemVolume is NoSystemVolume ? null : systemVolume.ReadPeakDb();
                        // Pegel aller aktiven Windows-Geraete (Ausgaben + Mikrofone); die Geraeteliste nur alle 3 s neu lesen.
                        if (systemVolume is not NoSystemVolume && Environment.TickCount64 - devicesRefreshedTicks > 3000)
                        {
                            devices = systemVolume.ListDevices();
                            devicesRefreshedTicks = Environment.TickCount64;
                        }
                        var win = new Dictionary<string, double>();
                        foreach (var device in devices)
                            if (systemVolume.ReadPeakDbDevice(device.Id) is { } db) win[device.Id] = db;

                        var levels = _obsLevels;
                        if (system != lastSystem || !Same(levels, lastObs) || !SameWin(win, lastWin))
                        {
                            lastObs = levels;
                            lastSystem = system;
                            lastWin = win;
                            await hub.Clients.Group(DeckHub.MetersGroup).SendAsync("meters", new { obs = levels, system, win }, stoppingToken);
                        }
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                    catch (Exception ex)
                    {
                        log.LogDebug(ex, "Pegel konnte nicht gesendet werden.");
                    }
                }

                try { await Task.Delay(any ? ActiveInterval : IdleInterval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
        finally
        {
            obs.MetersChanged -= OnObsMeters;
            obs.SetMetersWanted(false);
        }
    }

    private void OnObsMeters(IReadOnlyDictionary<string, ObsMeterLevel> levels) => _obsLevels = levels;

    private static bool SameWin(Dictionary<string, double> a, Dictionary<string, double> b)
    {
        if (a.Count != b.Count) return false;
        foreach (var (key, value) in a)
            if (!b.TryGetValue(key, out var other) || other != value) return false;
        return true;
    }

    private static bool Same(IReadOnlyDictionary<string, ObsMeterLevel> a, IReadOnlyDictionary<string, ObsMeterLevel> b)
    {
        if (ReferenceEquals(a, b)) return true;
        if (a.Count != b.Count) return false;
        foreach (var (key, value) in a)
            if (!b.TryGetValue(key, out var other) || other != value) return false;
        return true;
    }
}
