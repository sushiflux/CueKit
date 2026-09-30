namespace Deck.Server.Hardware;

/// <summary>
/// Entwickler-Notbehelf fuer den Docker-Dev-Stack: liest CPU-/RAM-Auslastung DES CONTAINERS selbst
/// aus /proc (Linux), NICHT die echten Werte des Windows-Hosts - LibreHardwareMonitor braucht native
/// Windows-APIs und liefert im Linux-Container immer <see cref="SystemMonitorSnapshot.Unavailable"/>.
/// Nur damit beim Entwickeln/Testen der Anzeige-Kacheln ueberhaupt Live-Zahlen durch die UI flieszen,
/// ohne den Dienst extra nativ unter Windows starten zu muessen - keine Ersatz-Zielfunktion.
///
/// <see cref="SystemMonitorSnapshot.Available"/> bleibt bewusst <c>true</c> (die Kachel zeigt einen
/// Wert statt "nicht verfuegbar"), aber <see cref="SystemMonitorSnapshot.Error"/> traegt einen Hinweis,
/// dass es Container- statt PC-Werte sind - GPU ist im Container nicht auslesbar (kein Passthrough
/// im Dev-Stack), bleibt daher immer null.
/// </summary>
public sealed class ContainerSystemMonitor : ISystemMonitor
{
    private const string Note = "Entwickler-Notbehelf: Container-Werte, nicht der echte PC (nur im Docker-Dev-Stack).";

    private readonly ILogger<ContainerSystemMonitor> _log;
    private readonly ISystemVolume _volume;
    private volatile SystemMonitorSnapshot _current = SystemMonitorSnapshot.Unavailable with { Error = Note };
    private (long Idle, long Total)? _lastCpu;

    public ContainerSystemMonitor(ILogger<ContainerSystemMonitor> log, ISystemVolume volume)
    {
        _log = log;
        _volume = volume;
    }

    public SystemMonitorSnapshot Current => _current;

    /// <summary>Im Container gibt es keine Windows-Lautstaerke.</summary>
    public void RefreshVolume() { }

    public void Refresh()
    {
        var volume = _volume.Status;
        try
        {
            var cpuLoad = ReadCpuLoadPercent();
            var ramLoad = ReadMemoryLoadPercent();
            _current = new SystemMonitorSnapshot(true, cpuLoad, null, null, null, ramLoad, Note,
                volume.Available ? volume.Percent : null, volume.Available ? volume.Muted : null);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Container-Ressourcenwerte konnten nicht gelesen werden.");
            _current = SystemMonitorSnapshot.Unavailable with
            {
                Error = Note,
                VolumePercent = volume.Available ? volume.Percent : null,
                VolumeMuted = volume.Available ? volume.Muted : null,
            };
        }
    }

    /// <summary>Anteil nicht-idler Zeit seit dem letzten Aufruf, aus der ersten Zeile von /proc/stat
    /// (aggregiert ueber alle CPUs des Containers/Hosts-Kernels). Erster Aufruf liefert null, da eine
    /// Differenz zweier Zeitpunkte gebraucht wird.</summary>
    private double? ReadCpuLoadPercent()
    {
        var line = File.ReadLines("/proc/stat").FirstOrDefault(l => l.StartsWith("cpu ", StringComparison.Ordinal));
        if (line is null) return null;
        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1).Select(long.Parse).ToArray();
        if (parts.Length < 5) return null;
        // user nice system idle iowait irq softirq [steal ...]
        var idle = parts[3] + (parts.Length > 4 ? parts[4] : 0);
        var total = parts.Sum();

        if (_lastCpu is not { } last)
        {
            _lastCpu = (idle, total);
            return null;
        }
        _lastCpu = (idle, total);
        var totalDelta = total - last.Total;
        if (totalDelta <= 0) return null;
        var idleDelta = idle - last.Idle;
        return Math.Clamp(100.0 * (totalDelta - idleDelta) / totalDelta, 0, 100);
    }

    /// <summary>Belegter Speicheranteil des Containers aus /proc/meminfo (MemTotal/MemAvailable).</summary>
    private static double? ReadMemoryLoadPercent()
    {
        long? total = null, available = null;
        foreach (var line in File.ReadLines("/proc/meminfo"))
        {
            if (line.StartsWith("MemTotal:", StringComparison.Ordinal)) total = ParseKb(line);
            else if (line.StartsWith("MemAvailable:", StringComparison.Ordinal)) available = ParseKb(line);
            if (total.HasValue && available.HasValue) break;
        }
        if (total is not > 0 || available is null) return null;
        return Math.Clamp(100.0 * (total.Value - available.Value) / total.Value, 0, 100);
    }

    private static long? ParseKb(string line)
    {
        var digits = line.Where(char.IsDigit).ToArray();
        return digits.Length > 0 && long.TryParse(new string(digits), out var kb) ? kb : null;
    }
}
