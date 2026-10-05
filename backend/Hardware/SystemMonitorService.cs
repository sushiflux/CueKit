using System.Runtime.Versioning;
using LibreHardwareMonitor.Hardware;

namespace Deck.Server.Hardware;

/// <summary>Kennwerte, die eine "system.monitor.display"-Kachel anzeigen kann.</summary>
public static class SystemMetric
{
    public const string CpuLoad = "cpuLoad";
    public const string CpuTemp = "cpuTemp";
    public const string GpuLoad = "gpuLoad";
    public const string GpuTemp = "gpuTemp";
    public const string RamLoad = "ramLoad";
}

/// <summary>
/// Momentaufnahme der System-Sensoren. Prozentwerte 0-100, Temperaturen in °C - jeweils null,
/// wenn kein passender Sensor gefunden wurde (z.B. keine auslesbare CPU-Temperatur auf manchen
/// Laptops/VMs). <see cref="Available"/> ist false auf Nicht-Windows-Systemen.
/// VolumePercent/VolumeMuted spiegeln die Windows-Master-Lautstaerke (<see cref="ISystemVolume"/>) -
/// hier mitgefuehrt statt ueber einen zweiten Broadcast-Mechanismus, damit eine "system.mute"/
/// "system.volume"-Taste im Live-Deck ohne zusaetzliches Polling eine LED zeigen kann; jeweils
/// null, wenn die Lautstaerke nicht gelesen werden konnte (siehe <see cref="SystemVolumeStatus.Available"/>).
/// </summary>
public record SystemMonitorSnapshot(bool Available, double? CpuLoad, double? CpuTemp, double? GpuLoad, double? GpuTemp, double? RamLoad, string? Error, int? VolumePercent = null, bool? VolumeMuted = null)
{
    public static readonly SystemMonitorSnapshot Unavailable =
        new(false, null, null, null, null, null, "Nur auf dem nativ installierten Windows-Dienst verfügbar.");
}

/// <summary>Plattformneutraler Zugriff - siehe <see cref="ISystemVolume"/> fuer dasselbe Muster.
/// <see cref="Refresh"/> liegt bewusst auf dem Interface (statt eines Typ-Checks an den Aufrufstellen),
/// damit Broadcaster/Controller plattformunabhaengig bleiben - auf Nicht-Windows ist es ein No-Op.</summary>
public interface ISystemMonitor
{
    SystemMonitorSnapshot Current { get; }
    void Refresh();
    /// <summary>Aktualisiert nur Lautstaerke/Stumm (schnell, ohne Hardware-Sensoren neu einzulesen).</summary>
    void RefreshVolume();
}

public sealed class NoSystemMonitor : ISystemMonitor
{
    public SystemMonitorSnapshot Current => SystemMonitorSnapshot.Unavailable;
    public void Refresh() { }
    public void RefreshVolume() { }
}

/// <summary>
/// Liest CPU-/GPU-Auslastung, Temperaturen und RAM-Auslastung ueber LibreHardwareMonitorLib
/// (MIT-lizenziert, Nachfolger von OpenHardwareMonitor). Anders als bei der Systemlautstaerke
/// (kleine, stabile Win32-COM-Flaeche) lohnt sich hier kein Eigenbau: zuverlaessige
/// Temperatursensorik braucht je nach Mainboard-/GPU-Hersteller ganz unterschiedliche
/// Kernel-Zugriffe (WinRing0-Treiber, WMI, herstellerspezifische ACPI-Tabellen), die die
/// Bibliothek bereits abdeckt.
///
/// <see cref="Computer.Open"/> braucht (je nach Sensor) erhoehte Rechte/den mitgelieferten
/// Kernel-Treiber - schlaegt das fehl (z.B. eingeschraenkter Dienstkontext), bleibt der Dienst
/// mit <see cref="SystemMonitorSnapshot.Available"/> = false nutzbar statt den Host mitzureissen
/// (siehe CLAUDE.md: ein BackgroundService-Crash darf nie den ganzen Host toeten).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class SystemMonitorService : ISystemMonitor, IDisposable
{
    private readonly ILogger<SystemMonitorService> _log;
    private readonly ISystemVolume _volume;
    private readonly Lock _gate = new();
    private Computer? _computer;
    private bool _openFailed;
    private volatile SystemMonitorSnapshot _current = SystemMonitorSnapshot.Unavailable;

    public SystemMonitorService(ILogger<SystemMonitorService> log, ISystemVolume volume)
    {
        _log = log;
        _volume = volume;
    }

    public SystemMonitorSnapshot Current => _current;

    /// <summary>Liest alle Sensoren neu ein und aktualisiert <see cref="Current"/>. Wird vom periodischen
    /// Broadcast-Loop aufgerufen (siehe SystemMonitorBroadcaster) - laeuft bewusst nicht selbst als
    /// eigener BackgroundService, damit "niemand schaut zu" auch das Auslesen selbst spart.</summary>
    public void Refresh()
    {
        // Lautstaerke ist von den Hardware-Sensoren unabhaengig (eigene kleine Win32-COM-Flaeche,
        // siehe SystemVolumeService) - auch lesen, wenn LibreHardwareMonitor auf dieser Maschine
        // dauerhaft fehlschlaegt (_openFailed), damit eine "system.mute"-Taste trotzdem eine LED zeigt.
        var volume = _volume.Status;
        try
        {
            lock (_gate)
            {
                if (_openFailed)
                {
                    _current = _current with { VolumePercent = volume.Available ? volume.Percent : null, VolumeMuted = volume.Available ? volume.Muted : null };
                    return;
                }
                if (_computer is null)
                {
                    _computer = new Computer
                    {
                        IsCpuEnabled = true,
                        IsGpuEnabled = true,
                        IsMemoryEnabled = true,
                        IsMotherboardEnabled = true,
                        IsControllerEnabled = true,
                    };
                    _computer.Open();
                }

                double? cpuLoad = null, cpuTemp = null, gpuLoad = null, gpuTemp = null, ramLoad = null;

                void ScanHardware(IHardware hw)
                {
                    hw.Update();
                    foreach (var sub in hw.SubHardware)
                    {
                        ScanHardware(sub);
                    }

                    var isCpu = hw.HardwareType == HardwareType.Cpu;
                    var isGpu = hw.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel;
                    var isMemory = hw.HardwareType == HardwareType.Memory;
                    var isMobo = hw.HardwareType is HardwareType.Motherboard or HardwareType.SuperIO;

                    foreach (var sensor in hw.Sensors)
                    {
                        if (sensor.Value is not { } value || !double.IsFinite(value)) continue;

                        if (isCpu && sensor.SensorType == SensorType.Load && sensor.Name is "CPU Total")
                        {
                            cpuLoad = value;
                        }
                        else if (isCpu && sensor.SensorType == SensorType.Temperature && value > 0 && value < 125)
                        {
                            var isPreferred = sensor.Name.Contains("Package", StringComparison.OrdinalIgnoreCase)
                                           || sensor.Name.Contains("Tctl", StringComparison.OrdinalIgnoreCase)
                                           || sensor.Name.Contains("Tdie", StringComparison.OrdinalIgnoreCase);
                            if (cpuTemp is null || isPreferred) cpuTemp = value;
                        }
                        else if (isMobo && sensor.SensorType == SensorType.Temperature && value > 0 && value < 125)
                        {
                            // Motherboard / Super I/O Fallback für neuere CPUs (z.B. AMD Zen 5 Granite Ridge),
                            // falls der CPU-Treiber noch keine SMU PM-Table unterstützt.
                            var name = sensor.Name;
                            var isCpuSensor = name.Contains("CPU", StringComparison.OrdinalIgnoreCase)
                                           || name.Contains("Tctl", StringComparison.OrdinalIgnoreCase)
                                           || name.Contains("Tdie", StringComparison.OrdinalIgnoreCase)
                                           || name.Contains("Socket", StringComparison.OrdinalIgnoreCase);
                            if (isCpuSensor && cpuTemp is null) cpuTemp = value;
                        }
                        else if (isGpu && sensor.SensorType == SensorType.Load && sensor.Name is "GPU Core")
                        {
                            gpuLoad = value;
                        }
                        else if (isGpu && sensor.SensorType == SensorType.Temperature && value > 0 && (gpuTemp is null || sensor.Name.Contains("Core", StringComparison.OrdinalIgnoreCase)))
                        {
                            gpuTemp = value;
                        }
                        else if (isMemory && sensor.SensorType == SensorType.Load && sensor.Name is "Memory")
                        {
                            ramLoad = value;
                        }
                    }
                }

                foreach (var hardware in _computer.Hardware)
                {
                    ScanHardware(hardware);
                }

                _current = new SystemMonitorSnapshot(true, cpuLoad, cpuTemp, gpuLoad, gpuTemp, ramLoad, null,
                    volume.Available ? volume.Percent : null, volume.Available ? volume.Muted : null);
            }
        }
        catch (Exception ex)
        {
            _openFailed = true;
            _log.LogWarning(ex, "System-Sensoren konnten nicht gelesen werden.");
            // Available bleibt false (Sensoren sind es nicht), aber die von den Sensoren
            // unabhaengige Lautstaerke soll trotzdem ankommen.
            _current = SystemMonitorSnapshot.Unavailable with
            {
                Error = $"System-Sensoren nicht verfügbar: {ex.Message}",
                VolumePercent = volume.Available ? volume.Percent : null,
                VolumeMuted = volume.Available ? volume.Muted : null,
            };
        }
    }

    public void RefreshVolume()
    {
        var volume = _volume.Status;
        lock (_gate)
        {
            _current = _current with { VolumePercent = volume.Available ? volume.Percent : null, VolumeMuted = volume.Available ? volume.Muted : null };
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            try { _computer?.Close(); } catch { /* best effort beim Beenden */ }
            _computer = null;
        }
    }
}
