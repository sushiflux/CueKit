using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Deck.Server.Hardware;

/// <summary>Aktueller Stand der Windows-Systemlautstaerke (Master, nicht OBS-Audio).</summary>
public record SystemVolumeStatus(bool Available, int Percent, bool Muted, string? Error);

/// <summary>
/// Plattformneutraler Zugriff auf die Windows-Systemlautstaerke. Auf Nicht-Windows-Systemen
/// (z.B. Docker-Dev-Container) schlicht nicht verfuegbar - siehe <see cref="IGlobalHotkeys"/>
/// in Deck.Server.Hotkeys fuer dasselbe Muster.
/// </summary>
public interface ISystemVolume
{
    SystemVolumeStatus Status { get; }
    void Adjust(int deltaPercent);
    void SetPercent(int percent);
    void SetMuted(bool muted);
    void ToggleMuted();

    /// <summary>Aktueller Spitzenpegel des aktiven Standard-Ausgabegeraets in dB (-100 = Stille),
    /// oder null, wenn nicht ermittelbar. Fuer die Live-Pegelanzeige, gedacht fuer haeufiges Abfragen.</summary>
    double? ReadPeakDb();
}

public sealed class NoSystemVolume : ISystemVolume
{
    private static readonly SystemVolumeStatus Unavailable =
        new(false, 0, false, "Nur auf dem nativ installierten Windows-Dienst verfügbar.");

    public SystemVolumeStatus Status => Unavailable;
    public void Adjust(int deltaPercent) => throw new InvalidOperationException(Unavailable.Error);
    public void SetPercent(int percent) => throw new InvalidOperationException(Unavailable.Error);
    public void SetMuted(bool muted) => throw new InvalidOperationException(Unavailable.Error);
    public void ToggleMuted() => throw new InvalidOperationException(Unavailable.Error);
    public double? ReadPeakDb() => null;
}

/// <summary>
/// Steuert die Windows-Master-Lautstaerke ueber die Core-Audio-COM-Schnittstellen
/// (MMDeviceEnumerator/IAudioEndpointVolume). Handgeschriebenes COM-Interop statt eines
/// zusaetzlichen NuGet-Pakets (z.B. NAudio) - die benoetigte Flaeche ist klein (ein Endpunkt,
/// vier Methoden) und passt zum bestehenden Stil in GlobalHotkeyService (rohes P/Invoke statt
/// Fremdbibliothek fuer eine kleine, stabile Win32-Oberflaeche).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class SystemVolumeService : ISystemVolume
{
    // MMDeviceEnumerator: BCDE0395-E52F-467C-8E3D-C4579291692E, IMMDeviceEnumerator: A95664D2-9614-4F35-A746-DE8DB63617E6
    private static readonly Guid ClsidMMDeviceEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");

    public SystemVolumeStatus Status
    {
        get
        {
            try
            {
                using var endpoint = OpenEndpoint();
                endpoint.GetMasterVolumeLevelScalar(out var level);
                endpoint.GetMute(out var muted);
                return new SystemVolumeStatus(true, (int)Math.Round(level * 100), muted != 0, null);
            }
            catch (Exception ex)
            {
                return new SystemVolumeStatus(false, 0, false, $"Lautstärke konnte nicht gelesen werden: {ex.Message}");
            }
        }
    }

    public void Adjust(int deltaPercent)
    {
        using var endpoint = OpenEndpoint();
        endpoint.GetMasterVolumeLevelScalar(out var level);
        var target = Math.Clamp(level + deltaPercent / 100f, 0f, 1f);
        endpoint.SetMasterVolumeLevelScalar(target, Guid.Empty);
    }

    public void SetPercent(int percent)
    {
        using var endpoint = OpenEndpoint();
        endpoint.SetMasterVolumeLevelScalar(Math.Clamp(percent, 0, 100) / 100f, Guid.Empty);
    }

    public void SetMuted(bool muted)
    {
        using var endpoint = OpenEndpoint();
        endpoint.SetMute(muted ? 1 : 0, Guid.Empty);
    }

    public void ToggleMuted()
    {
        using var endpoint = OpenEndpoint();
        endpoint.GetMute(out var muted);
        endpoint.SetMute(muted == 0 ? 1 : 0, Guid.Empty);
    }

    // Die Pegelanzeige fragt bis zu ~20x pro Sekunde ab - die COM-Objekte deshalb kurz behalten statt
    // pro Abfrage neu zu erzeugen. Nach ein paar Sekunden neu oeffnen, damit ein gewechseltes
    // Standard-Ausgabegeraet uebernommen wird.
    private static readonly TimeSpan MeterLifetime = TimeSpan.FromSeconds(3);
    private readonly object _meterLock = new();
    private IAudioMeterInformation? _meter;
    private long _meterOpenedTicks;

    public double? ReadPeakDb()
    {
        lock (_meterLock)
        {
            try
            {
                if (_meter is null || Environment.TickCount64 - _meterOpenedTicks > MeterLifetime.TotalMilliseconds)
                {
                    ReleaseMeter();
                    _meter = OpenMeter();
                    _meterOpenedTicks = Environment.TickCount64;
                }
                _meter.GetPeakValue(out var peak);
                return peak <= 0.00001f ? -100 : Math.Round(20 * Math.Log10(peak), 1);
            }
            catch
            {
                ReleaseMeter();
                return null;
            }
        }
    }

    private void ReleaseMeter()
    {
        if (_meter is not null) Marshal.ReleaseComObject(_meter);
        _meter = null;
    }

    private static IAudioMeterInformation OpenMeter()
    {
        var enumeratorType = Type.GetTypeFromCLSID(ClsidMMDeviceEnumerator) ?? throw new InvalidOperationException("MMDeviceEnumerator nicht verfügbar.");
        var enumerator = (IMMDeviceEnumerator)(Activator.CreateInstance(enumeratorType) ?? throw new InvalidOperationException("MMDeviceEnumerator konnte nicht erstellt werden."));
        try
        {
            enumerator.GetDefaultAudioEndpoint(0 /* eRender */, 1 /* eMultimedia */, out var device);
            try
            {
                var iid = typeof(IAudioMeterInformation).GUID;
                device.Activate(ref iid, 0x1 /* CLSCTX_INPROC_SERVER */, IntPtr.Zero, out var meterObj);
                return (IAudioMeterInformation)meterObj;
            }
            finally { Marshal.ReleaseComObject(device); }
        }
        finally { Marshal.ReleaseComObject(enumerator); }
    }

    private static AudioEndpointVolumeHandle OpenEndpoint()
    {
        var enumeratorType = Type.GetTypeFromCLSID(ClsidMMDeviceEnumerator) ?? throw new InvalidOperationException("MMDeviceEnumerator nicht verfügbar.");
        var enumerator = (IMMDeviceEnumerator)(Activator.CreateInstance(enumeratorType) ?? throw new InvalidOperationException("MMDeviceEnumerator konnte nicht erstellt werden."));
        try
        {
            enumerator.GetDefaultAudioEndpoint(0 /* eRender */, 1 /* eMultimedia */, out var device);
            try
            {
                // Activate() liefert eine eigene RCW fuer IAudioEndpointVolume - das ist die einzige
                // COM-Referenz, die wir ueber die Lebenszeit des Handles hinweg behalten muessen.
                var iidAudioEndpointVolume = typeof(IAudioEndpointVolume).GUID;
                device.Activate(ref iidAudioEndpointVolume, 0x1 /* CLSCTX_INPROC_SERVER */, IntPtr.Zero, out var volumeObj);
                return new AudioEndpointVolumeHandle((IAudioEndpointVolume)volumeObj);
            }
            finally { Marshal.ReleaseComObject(device); }
        }
        finally { Marshal.ReleaseComObject(enumerator); }
    }

    /// <summary>Haelt die COM-Referenz auf IAudioEndpointVolume und gibt sie beim Verlassen des using-Blocks frei.</summary>
    private readonly struct AudioEndpointVolumeHandle(IAudioEndpointVolume volume) : IDisposable
    {
        public void GetMasterVolumeLevelScalar(out float level) => volume.GetMasterVolumeLevelScalar(out level);
        public void SetMasterVolumeLevelScalar(float level, Guid eventContext) => volume.SetMasterVolumeLevelScalar(level, eventContext);
        public void GetMute(out int muted) => volume.GetMute(out muted);
        public void SetMute(int muted, Guid eventContext) => volume.SetMute(muted, eventContext);

        public void Dispose() => Marshal.ReleaseComObject(volume);
    }

    // ---------- Core-Audio-COM-Schnittstellen (minimaler Ausschnitt) ----------

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        void EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        void GetDefaultAudioEndpoint(int dataFlow, int role, [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        void Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    }

    /// <summary>Spitzenpegel des Endpunkts (0..1 linear). Vtable-Reihenfolge wie im Windows-SDK.</summary>
    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioMeterInformation
    {
        void GetPeakValue(out float peak);
        void GetMeteringChannelCount(out int count);
        void GetChannelsPeakValues(int channelCount, IntPtr peakValues);
        void QueryHardwareSupport(out int hardwareSupportMask);
    }

    /// <summary>Nur die vier Methoden, die wir brauchen - IAudioEndpointVolume hat in Wirklichkeit deutlich mehr,
    /// aber die COM-Vtable-Reihenfolge muss trotzdem exakt stimmen, daher keine ausgelassenen Slots hier.</summary>
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        void RegisterControlChangeNotify(IntPtr notify);
        void UnregisterControlChangeNotify(IntPtr notify);
        void GetChannelCount(out int count);
        void SetMasterVolumeLevel(float levelDb, Guid eventContext);
        void SetMasterVolumeLevelScalar(float level, Guid eventContext);
        void GetMasterVolumeLevel(out float levelDb);
        void GetMasterVolumeLevelScalar(out float level);
        void SetChannelVolumeLevel(int channel, float levelDb, Guid eventContext);
        void SetChannelVolumeLevelScalar(int channel, float level, Guid eventContext);
        void GetChannelVolumeLevel(int channel, out float levelDb);
        void GetChannelVolumeLevelScalar(int channel, out float level);
        void SetMute(int mute, Guid eventContext);
        void GetMute(out int mute);
        void GetVolumeStepInfo(out int step, out int stepCount);
        void VolumeStepUp(Guid eventContext);
        void VolumeStepDown(Guid eventContext);
        void QueryHardwareSupport(out int hardwareSupportMask);
        void GetVolumeRange(out float volumeMinDb, out float volumeMaxDb, out float volumeIncrementDb);
    }
}
