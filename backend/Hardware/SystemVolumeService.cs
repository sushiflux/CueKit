using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Deck.Server.Hardware;

/// <summary>Aktueller Stand der Windows-Systemlautstaerke (Master, nicht OBS-Audio).</summary>
public record SystemVolumeStatus(bool Available, int Percent, bool Muted, string? Error);

/// <summary>Ein aktives Windows-Audiogeraet. Kind: "output" (Wiedergabe) oder "input" (Aufnahme, z.B. Mikrofon).</summary>
public record AudioDeviceInfo(string Id, string Name, string Kind, bool IsDefault, int Percent, bool Muted);

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

    /// <summary>Alle aktiven Wiedergabe- und Aufnahmegeraete (leer, wenn nicht verfuegbar).</summary>
    IReadOnlyList<AudioDeviceInfo> ListDevices();

    // Dasselbe fuer ein bestimmtes Geraet (deviceId aus AudioDeviceInfo.Id); null = Standard-Ausgabe wie oben.
    void AdjustDevice(string? deviceId, int deltaPercent);
    void SetPercentDevice(string? deviceId, int percent);
    void SetMutedDevice(string? deviceId, bool muted);
    void ToggleMutedDevice(string? deviceId);
    double? ReadPeakDbDevice(string deviceId);
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
    public IReadOnlyList<AudioDeviceInfo> ListDevices() => [];
    public void AdjustDevice(string? deviceId, int deltaPercent) => throw new InvalidOperationException(Unavailable.Error);
    public void SetPercentDevice(string? deviceId, int percent) => throw new InvalidOperationException(Unavailable.Error);
    public void SetMutedDevice(string? deviceId, bool muted) => throw new InvalidOperationException(Unavailable.Error);
    public void ToggleMutedDevice(string? deviceId) => throw new InvalidOperationException(Unavailable.Error);
    public double? ReadPeakDbDevice(string deviceId) => null;
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

    public void Adjust(int deltaPercent) => AdjustDevice(null, deltaPercent);
    public void SetPercent(int percent) => SetPercentDevice(null, percent);
    public void SetMuted(bool muted) => SetMutedDevice(null, muted);
    public void ToggleMuted() => ToggleMutedDevice(null);

    public void AdjustDevice(string? deviceId, int deltaPercent)
    {
        using var endpoint = OpenEndpoint(deviceId);
        endpoint.GetMasterVolumeLevelScalar(out var level);
        endpoint.SetMasterVolumeLevelScalar(Math.Clamp(level + deltaPercent / 100f, 0f, 1f), Guid.Empty);
    }

    public void SetPercentDevice(string? deviceId, int percent)
    {
        using var endpoint = OpenEndpoint(deviceId);
        endpoint.SetMasterVolumeLevelScalar(Math.Clamp(percent, 0, 100) / 100f, Guid.Empty);
    }

    public void SetMutedDevice(string? deviceId, bool muted)
    {
        using var endpoint = OpenEndpoint(deviceId);
        endpoint.SetMute(muted ? 1 : 0, Guid.Empty);
    }

    public void ToggleMutedDevice(string? deviceId)
    {
        using var endpoint = OpenEndpoint(deviceId);
        endpoint.GetMute(out var muted);
        endpoint.SetMute(muted == 0 ? 1 : 0, Guid.Empty);
    }

    // Anzeigenamen aendern sich praktisch nie - einmal pro Geraet lesen (der Eigenschaftsspeicher ist vergleichsweise teuer).
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _names = new();

    public IReadOnlyList<AudioDeviceInfo> ListDevices()
    {
        var result = new List<AudioDeviceInfo>();
        try
        {
            var enumerator = CreateEnumerator();
            try
            {
                foreach (var (flow, kind) in new[] { (0, "output"), (1, "input") })
                {
                    var defaultId = TryGetDefaultId(enumerator, flow);
                    enumerator.EnumAudioEndpoints(flow, 1 /* DEVICE_STATE_ACTIVE */, out var collection);
                    try
                    {
                        collection.GetCount(out var count);
                        for (uint i = 0; i < count; i++)
                        {
                            collection.Item(i, out var device);
                            try
                            {
                                device.GetId(out var id);
                                var name = _names.GetOrAdd(id, _ => ReadFriendlyName(device) ?? id);
                                var (percent, muted) = ReadVolume(device);
                                result.Add(new AudioDeviceInfo(id, name, kind, id == defaultId, percent, muted));
                            }
                            catch { /* Geraet verschwand waehrend der Abfrage (z.B. USB abgezogen) - ueberspringen. */ }
                            finally { Marshal.ReleaseComObject(device); }
                        }
                    }
                    finally { Marshal.ReleaseComObject(collection); }
                }
            }
            finally { Marshal.ReleaseComObject(enumerator); }
        }
        catch { /* Audiodienst nicht erreichbar -> leere Liste */ }
        return result;
    }

    private static string? TryGetDefaultId(IMMDeviceEnumerator enumerator, int flow)
    {
        try
        {
            enumerator.GetDefaultAudioEndpoint(flow, 1 /* eMultimedia */, out var device);
            try { device.GetId(out var id); return id; }
            finally { Marshal.ReleaseComObject(device); }
        }
        catch { return null; }
    }

    private static (int Percent, bool Muted) ReadVolume(IMMDevice device)
    {
        var iid = typeof(IAudioEndpointVolume).GUID;
        device.Activate(ref iid, 0x1, IntPtr.Zero, out var volumeObj);
        var volume = (IAudioEndpointVolume)volumeObj;
        try
        {
            volume.GetMasterVolumeLevelScalar(out var level);
            volume.GetMute(out var muted);
            return ((int)Math.Round(level * 100), muted != 0);
        }
        finally { Marshal.ReleaseComObject(volume); }
    }

    private static string? ReadFriendlyName(IMMDevice device)
    {
        device.OpenPropertyStore(0 /* STGM_READ */, out var store);
        try
        {
            var key = new PropertyKey { FmtId = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), Pid = 14 /* PKEY_Device_FriendlyName */ };
            store.GetValue(ref key, out var value);
            try { return value.Vt == 31 /* VT_LPWSTR */ ? Marshal.PtrToStringUni(value.P) : null; }
            finally { PropVariantClear(ref value); }
        }
        finally { Marshal.ReleaseComObject(store); }
    }

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant value);

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

    private readonly Dictionary<string, (IAudioMeterInformation Meter, long OpenedTicks)> _deviceMeters = new();

    public double? ReadPeakDbDevice(string deviceId)
    {
        lock (_meterLock)
        {
            try
            {
                if (!_deviceMeters.TryGetValue(deviceId, out var entry) || Environment.TickCount64 - entry.OpenedTicks > MeterLifetime.TotalMilliseconds)
                {
                    if (entry.Meter is not null) Marshal.ReleaseComObject(entry.Meter);
                    entry = (OpenMeter(deviceId), Environment.TickCount64);
                    _deviceMeters[deviceId] = entry;
                }
                entry.Meter.GetPeakValue(out var peak);
                return peak <= 0.00001f ? -100 : Math.Round(20 * Math.Log10(peak), 1);
            }
            catch
            {
                if (_deviceMeters.Remove(deviceId, out var broken)) Marshal.ReleaseComObject(broken.Meter);
                return null;
            }
        }
    }

    private void ReleaseMeter()
    {
        if (_meter is not null) Marshal.ReleaseComObject(_meter);
        _meter = null;
    }

    private static IMMDeviceEnumerator CreateEnumerator()
    {
        var enumeratorType = Type.GetTypeFromCLSID(ClsidMMDeviceEnumerator) ?? throw new InvalidOperationException("MMDeviceEnumerator nicht verfügbar.");
        return (IMMDeviceEnumerator)(Activator.CreateInstance(enumeratorType) ?? throw new InvalidOperationException("MMDeviceEnumerator konnte nicht erstellt werden."));
    }

    /// <summary>Gewuenschtes Geraet; null = aktuelle Standard-Ausgabe.</summary>
    private static IMMDevice OpenDevice(IMMDeviceEnumerator enumerator, string? deviceId)
    {
        if (deviceId is null)
        {
            enumerator.GetDefaultAudioEndpoint(0 /* eRender */, 1 /* eMultimedia */, out var def);
            return def;
        }
        try { enumerator.GetDevice(deviceId, out var device); return device; }
        catch (COMException) { throw new InvalidOperationException("Das Audiogerät ist nicht mehr verfügbar (abgesteckt oder deaktiviert)."); }
    }

    private static IAudioMeterInformation OpenMeter(string? deviceId = null)
    {
        var enumerator = CreateEnumerator();
        try
        {
            var device = OpenDevice(enumerator, deviceId);
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

    private static AudioEndpointVolumeHandle OpenEndpoint(string? deviceId = null)
    {
        var enumerator = CreateEnumerator();
        try
        {
            var device = OpenDevice(enumerator, deviceId);
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
        void EnumAudioEndpoints(int dataFlow, int stateMask, [MarshalAs(UnmanagedType.Interface)] out IMMDeviceCollection devices);
        void GetDefaultAudioEndpoint(int dataFlow, int role, [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
        void GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        void GetCount(out uint count);
        void Item(uint index, [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        void Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
        void OpenPropertyStore(int stgmAccess, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore properties);
        void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out PropVariant value);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey { public Guid FmtId; public uint Pid; }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropVariant { public ushort Vt; public ushort R1, R2, R3; public IntPtr P; public IntPtr P2; }

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
