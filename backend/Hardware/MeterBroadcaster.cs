using Deck.Server.Hubs;
using Deck.Server.Obs;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Hardware;

/// <summary>Pegel eines Windows-Geraets in dB: nach dem Lautstaerkeregler (Anzeige) und roh vor dem Regler (zeigt bei Stumm weiter das Signal).</summary>
public record WinMeterLevel(double Peak, double InputPeak);

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
        (double? Peak, double? InputPeak) lastSystem = default;
        Dictionary<string, WinMeterLevel> lastWin = [];
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
                    lastSystem = default;
                    lastWin = [];
                }

                if (any)
                {
                    try
                    {
                        // Geraeteliste (Lautstaerke/Stumm) alle 500 ms neu lesen, damit der Pegel einem bewegten Regler sofort folgt.
                        if (systemVolume is not NoSystemVolume && Environment.TickCount64 - devicesRefreshedTicks > 500)
                        {
                            devices = systemVolume.ListDevices();
                            devicesRefreshedTicks = Environment.TickCount64;
                        }

                        // Windows liefert bei WIEDERGABE-Geraeten den Pegel VOR dem Lautstaerkeregler (OBS dagegen nach dem Fader). Damit die
                        // Anzeige wie der OBS-Mixer reagiert - leiser gestellt = der Balken schlaegt nur noch bis dorthin aus - wird die
                        // Reglerdaempfung (dB) hier abgezogen; stumm = Stille. Aufnahmegeraete (Mikrofone) liefern den Pegel schon nach der Verstaerkung.
                        static double Post(double raw, AudioDeviceInfo d) => d.Muted ? -100 : d.Kind == "output" ? Math.Max(-100, Math.Round(raw + d.VolumeDb, 1)) : raw;

                        var win = new Dictionary<string, WinMeterLevel>();
                        foreach (var device in devices)
                            if (systemVolume.ReadPeakDbDevice(device.Id) is { } raw) win[device.Id] = new WinMeterLevel(Post(raw, device), raw);

                        // "System" = Standard-Ausgabe
                        var systemRaw = systemVolume is NoSystemVolume ? null : systemVolume.ReadPeakDb();
                        var defaultOutput = devices.FirstOrDefault(d => d.Kind == "output" && d.IsDefault);
                        var system = systemRaw is { } sr ? (Peak: defaultOutput is null ? sr : Post(sr, defaultOutput), InputPeak: (double?)sr) : (Peak: (double?)null, InputPeak: (double?)null);

                        var levels = _obsLevels;
                        if (system != lastSystem || !Same(levels, lastObs) || !SameWin(win, lastWin))
                        {
                            lastObs = levels;
                            lastSystem = system;
                            lastWin = win;
                            await hub.Clients.Group(DeckHub.MetersGroup).SendAsync("meters", new { obs = levels, system = system.Peak, systemInput = system.InputPeak, win }, stoppingToken);
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

    private static bool SameWin(Dictionary<string, WinMeterLevel> a, Dictionary<string, WinMeterLevel> b)
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
