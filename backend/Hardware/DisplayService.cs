using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Deck.Server.Hardware;

/// <summary>Eine von einem Monitor unterstuetzte Aufloesung mit den moeglichen Bildwiederholraten (Hz, absteigend).</summary>
public record DisplayResolution(int Width, int Height, IReadOnlyList<int> RefreshRates);

/// <summary>
/// Ein aktiver Windows-Monitor. <see cref="Id"/> ist der Geraetepfad des Monitors (bleibt stabil, auch wenn Windows die
/// Anzeigenummern \\.\DISPLAYn umsortiert); <see cref="HdrSupported"/> sagt, ob der Monitor HDR kann (nur dann ist HDR schaltbar).
/// </summary>
public record DisplayInfo(
    string Id,
    string Name,
    string GdiName,
    bool IsPrimary,
    bool HdrSupported,
    bool HdrEnabled,
    int Width,
    int Height,
    int RefreshRate,
    IReadOnlyList<DisplayResolution> Resolutions,
    bool Rotated = false);

/// <summary>Plattformneutraler Zugriff auf Monitor-Einstellungen (HDR, Aufloesung) - nur nativ unter Windows verfuegbar.</summary>
public interface IDisplayControl
{
    IReadOnlyList<DisplayInfo> List();

    /// <summary>HDR eines Monitors setzen (enabled = null: umschalten). Gibt den neuen Zustand zurueck.</summary>
    bool SetHdr(string displayId, bool? enabled);

    /// <summary>Aufloesung (und optional Bildwiederholrate) eines Monitors aendern. Ohne hz: gleiche Rate wie jetzt, falls moeglich, sonst die hoechste.</summary>
    void SetResolution(string displayId, int width, int height, int? hz);
}

/// <summary>Ob der Monitor gerade in dieser Aufloesung laeuft - bei gedrehten Monitoren zaehlt auch die vertauschte Schreibweise.</summary>
public static class DisplayInfoExtensions
{
    public static bool IsMode(this DisplayInfo d, int width, int height) =>
        (d.Width == width && d.Height == height) || (d.Rotated && d.Width == height && d.Height == width);
}

public sealed class NoDisplayControl : IDisplayControl
{
    private const string Unavailable = "Nur auf dem nativ installierten Windows-Dienst verfügbar.";
    public IReadOnlyList<DisplayInfo> List() => [];
    public bool SetHdr(string displayId, bool? enabled) => throw new InvalidOperationException(Unavailable);
    public void SetResolution(string displayId, int width, int height, int? hz) => throw new InvalidOperationException(Unavailable);
}

/// <summary>
/// Windows-Monitorsteuerung: Monitor-Liste und HDR ueber die DisplayConfig-API (QueryDisplayConfig / DisplayConfigGet-/SetDeviceInfo,
/// "Advanced Color"), Aufloesungen ueber GDI (EnumDisplaySettingsEx / ChangeDisplaySettingsEx).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class DisplayService : IDisplayControl
{
    // ---------------- Lesen ----------------

    public IReadOnlyList<DisplayInfo> List()
    {
        var result = new List<DisplayInfo>();
        foreach (var path in ActivePaths())
        {
            try
            {
                var gdi = SourceName(path);
                var (friendly, devicePath) = TargetName(path);
                var color = GetColorInfo(path);
                var current = new DEVMODE { dmSize = (ushort)Marshal.SizeOf<DEVMODE>() };
                if (!EnumDisplaySettingsExW(gdi, ENUM_CURRENT_SETTINGS, ref current, 0)) continue;
                // Gedrehter Monitor (Hochkant): Windows meldet Breite/Hoehe vertauscht (2160x3840). Angezeigt und geschaltet wird in der
                // nativen Ausrichtung des Panels (3840x2160), wie man es kennt; beim Setzen wird zurueckgetauscht.
                var rotated = current.dmDisplayOrientation is 1 or 3;
                result.Add(new DisplayInfo(
                    string.IsNullOrEmpty(devicePath) ? gdi : devicePath,
                    string.IsNullOrWhiteSpace(friendly) ? gdi : friendly,
                    gdi,
                    current.dmPositionX == 0 && current.dmPositionY == 0,
                    color.Supported,
                    color.Enabled,
                    rotated ? (int)current.dmPelsHeight : (int)current.dmPelsWidth,
                    rotated ? (int)current.dmPelsWidth : (int)current.dmPelsHeight,
                    (int)current.dmDisplayFrequency,
                    Resolutions(gdi, rotated),
                    rotated));
            }
            catch { /* ein Monitor, der gerade nicht lesbar ist (Wechsel/Standby), soll die Liste nicht verhindern */ }
        }
        return result.OrderByDescending(d => d.IsPrimary).ThenBy(d => d.GdiName, StringComparer.Ordinal).ToList();
    }

    private static List<DisplayResolution> Resolutions(string gdiName, bool rotated)
    {
        var map = new Dictionary<(int W, int H), SortedSet<int>>();
        var mode = new DEVMODE { dmSize = (ushort)Marshal.SizeOf<DEVMODE>() };
        for (var i = 0; EnumDisplaySettingsExW(gdiName, i, ref mode, 0); i++)
        {
            if (mode.dmBitsPerPel < 24 || mode.dmPelsWidth == 0) continue;
            var key = rotated ? ((int)mode.dmPelsHeight, (int)mode.dmPelsWidth) : ((int)mode.dmPelsWidth, (int)mode.dmPelsHeight);
            if (!map.TryGetValue(key, out var set)) map[key] = set = [];
            set.Add((int)mode.dmDisplayFrequency);
        }
        return map.OrderByDescending(k => (long)k.Key.W * k.Key.H)
            .Select(k => new DisplayResolution(k.Key.W, k.Key.H, k.Value.Reverse().ToList()))
            .ToList();
    }

    // ---------------- Schreiben ----------------

    public bool SetHdr(string displayId, bool? enabled)
    {
        var path = FindPath(displayId);
        var color = GetColorInfo(path);
        if (!color.Supported) throw new InvalidOperationException("Dieser Monitor unterstützt kein HDR.");
        var target = enabled ?? !color.Enabled;
        if (target == color.Enabled) return target; // schon im gewuenschten Zustand - nichts zu tun, kein Flackern

        // Neue Windows-Versionen: eigener HDR-Schalter (SET_HDR_STATE); die alte "Advanced Color"-Schaltung wuerde dort nur die Farbverwaltung aendern.
        var set = new SET_ADVANCED_COLOR_STATE
        {
            header = new DEVICE_INFO_HEADER { type = color.V2 ? SET_HDR_STATE_TYPE : SET_ADVANCED_COLOR_STATE_TYPE, size = (uint)Marshal.SizeOf<SET_ADVANCED_COLOR_STATE>(), adapterId = path.targetInfo.adapterId, id = path.targetInfo.id },
            value = target ? 1u : 0u,
        };
        var rc = DisplayConfigSetDeviceInfo(ref set);
        if (rc != 0) throw new InvalidOperationException($"HDR konnte nicht {(target ? "eingeschaltet" : "ausgeschaltet")} werden (Windows-Fehler {rc}).");

        // Der Wechsel dauert je nach Monitor einige Sekunden (neuer Videomodus): bis zu 6 s warten, bis Windows den neuen Zustand meldet -
        // sonst wuerde die Taste Erfolg zeigen, obwohl nichts passiert ist.
        for (var i = 0; i < 24; i++)
        {
            Thread.Sleep(250);
            if (GetColorInfo(FindPath(displayId)).Enabled == target) return target;
        }
        throw new InvalidOperationException($"Windows hat HDR nicht {(target ? "eingeschaltet" : "ausgeschaltet")} – der Monitor hat den Wechsel nicht übernommen.");
    }

    public void SetResolution(string displayId, int width, int height, int? hz)
    {
        var display = List().FirstOrDefault(d => d.Id == displayId) ?? throw new InvalidOperationException("Der Monitor wurde nicht gefunden (abgesteckt oder ausgeschaltet?).");
        var resolution = display.Resolutions.FirstOrDefault(r => r.Width == width && r.Height == height);
        // Bei einem gedrehten Monitor galt frueher die von Windows gemeldete, vertauschte Schreibweise (2160x3840) - weiterhin akzeptieren.
        if (resolution is null && display.Rotated && display.Resolutions.FirstOrDefault(r => r.Width == height && r.Height == width) is { } swapped)
        {
            resolution = swapped;
            (width, height) = (height, width);
        }
        if (resolution is null) throw new InvalidOperationException($"Der Monitor „{display.Name}“ unterstützt {width}×{height} nicht.");
        var rate = hz is { } wanted && resolution.RefreshRates.Contains(wanted) ? wanted
                 : resolution.RefreshRates.Contains(display.RefreshRate) ? display.RefreshRate
                 : resolution.RefreshRates.Max();
        if (display.Width == width && display.Height == height && display.RefreshRate == rate) return; // schon eingestellt

        var mode = new DEVMODE { dmSize = (ushort)Marshal.SizeOf<DEVMODE>() };
        if (!EnumDisplaySettingsExW(display.GdiName, ENUM_CURRENT_SETTINGS, ref mode, 0))
            throw new InvalidOperationException("Die aktuelle Anzeigeeinstellung konnte nicht gelesen werden.");
        mode.dmPelsWidth = (uint)(display.Rotated ? height : width);
        mode.dmPelsHeight = (uint)(display.Rotated ? width : height);
        mode.dmDisplayFrequency = (uint)rate;
        mode.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY;

        // Erst testen (aendert nichts), dann setzen - so wird nie ein nicht unterstuetzter Modus angewendet.
        var test = ChangeDisplaySettingsExW(display.GdiName, ref mode, IntPtr.Zero, CDS_TEST, IntPtr.Zero);
        if (test != DISP_CHANGE_SUCCESSFUL) throw new InvalidOperationException($"Windows lehnt {width}×{height} @ {rate} Hz auf „{display.Name}“ ab ({ChangeMessage(test)}).");
        var result = ChangeDisplaySettingsExW(display.GdiName, ref mode, IntPtr.Zero, CDS_UPDATEREGISTRY, IntPtr.Zero);
        if (result != DISP_CHANGE_SUCCESSFUL) throw new InvalidOperationException($"Die Auflösung konnte nicht geändert werden ({ChangeMessage(result)}).");
    }

    private static string ChangeMessage(int code) => code switch
    {
        1 => "Neustart nötig",
        -1 => "Fehler",
        -2 => "Modus nicht unterstützt",
        -3 => "Konfiguration ungültig",
        -4 => "Modus ungültig",
        -5 => "Dateizugriff nicht möglich",
        -6 => "Parameter ungültig",
        _ => $"Code {code}",
    };

    // ---------------- DisplayConfig ----------------

    private static PATH_INFO[] ActivePaths()
    {
        if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, out var pathCount, out var modeCount) != 0) return [];
        var paths = new PATH_INFO[pathCount];
        var modes = new MODE_INFO[modeCount];
        if (QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero) != 0) return [];
        return paths.Take((int)pathCount).ToArray();
    }

    private static PATH_INFO FindPath(string displayId)
    {
        foreach (var path in ActivePaths())
        {
            var (_, devicePath) = TargetName(path);
            if (string.Equals(devicePath, displayId, StringComparison.OrdinalIgnoreCase) || string.Equals(SourceName(path), displayId, StringComparison.OrdinalIgnoreCase)) return path;
        }
        throw new InvalidOperationException("Der Monitor wurde nicht gefunden (abgesteckt oder ausgeschaltet?).");
    }

    private static string SourceName(PATH_INFO path)
    {
        var info = new SOURCE_DEVICE_NAME { header = new DEVICE_INFO_HEADER { type = GET_SOURCE_NAME, size = (uint)Marshal.SizeOf<SOURCE_DEVICE_NAME>(), adapterId = path.sourceInfo.adapterId, id = path.sourceInfo.id } };
        return DisplayConfigGetDeviceInfo(ref info) == 0 ? info.viewGdiDeviceName : "";
    }

    private static (string Friendly, string DevicePath) TargetName(PATH_INFO path)
    {
        var info = new TARGET_DEVICE_NAME { header = new DEVICE_INFO_HEADER { type = GET_TARGET_NAME, size = (uint)Marshal.SizeOf<TARGET_DEVICE_NAME>(), adapterId = path.targetInfo.adapterId, id = path.targetInfo.id } };
        return DisplayConfigGetDeviceInfo(ref info) == 0 ? (info.monitorFriendlyDeviceName, info.monitorDevicePath) : ("", "");
    }

    /// <summary>
    /// HDR-Faehigkeit und -Zustand eines Monitors. Ab Windows 11 24H2 trennt die neue Schnittstelle (GET_ADVANCED_COLOR_INFO_2) HDR von
    /// der Farbverwaltung (WCG): die alte meldet "Advanced Color" auch dann als aktiv, wenn nur WCG laeuft, und kann HDR bei manchen Monitoren
    /// als aus melden. Die neue gilt, wenn sie antwortet (V2 = true); sonst der Rueckfall auf die alte (aeltere Windows-Versionen).
    /// </summary>
    private static (bool Supported, bool Enabled, bool V2, uint Raw, int Mode) GetColorInfo(PATH_INFO path)
    {
        var v2 = new GET_ADVANCED_COLOR_INFO_2 { header = new DEVICE_INFO_HEADER { type = GET_ADVANCED_COLOR_INFO_2_TYPE, size = (uint)Marshal.SizeOf<GET_ADVANCED_COLOR_INFO_2>(), adapterId = path.targetInfo.adapterId, id = path.targetInfo.id } };
        if (DisplayConfigGetDeviceInfo(ref v2) == 0)
        {
            // Bit 4: HDR unterstuetzt, Bit 5: HDR vom Nutzer eingeschaltet; activeColorMode 2 = HDR laeuft gerade.
            var supported = (v2.value & (1u << 4)) != 0;
            var enabled = (v2.value & (1u << 5)) != 0 || v2.activeColorMode == 2;
            return (supported, enabled, true, v2.value, v2.activeColorMode);
        }
        var info = new GET_ADVANCED_COLOR_INFO { header = new DEVICE_INFO_HEADER { type = GET_ADVANCED_COLOR_INFO_TYPE, size = (uint)Marshal.SizeOf<GET_ADVANCED_COLOR_INFO>(), adapterId = path.targetInfo.adapterId, id = path.targetInfo.id } };
        if (DisplayConfigGetDeviceInfo(ref info) != 0) return (false, false, false, 0, 0);
        // Bit 0: Advanced Color (HDR) unterstuetzt, Bit 1: aktiv.
        return ((info.value & 1) != 0, (info.value & 2) != 0, false, info.value, 0);
    }

    // ---------------- Konstanten / Interop ----------------

    private const uint QDC_ONLY_ACTIVE_PATHS = 2;
    private const uint GET_SOURCE_NAME = 1, GET_TARGET_NAME = 2, GET_ADVANCED_COLOR_INFO_TYPE = 9, SET_ADVANCED_COLOR_STATE_TYPE = 10, GET_ADVANCED_COLOR_INFO_2_TYPE = 15, SET_HDR_STATE_TYPE = 16;
    private const int ENUM_CURRENT_SETTINGS = -1;
    private const uint DM_PELSWIDTH = 0x80000, DM_PELSHEIGHT = 0x100000, DM_DISPLAYFREQUENCY = 0x400000;
    private const uint CDS_UPDATEREGISTRY = 0x1, CDS_TEST = 0x2;
    private const int DISP_CHANGE_SUCCESSFUL = 0;

    [StructLayout(LayoutKind.Sequential)] private struct LUID { public uint LowPart; public int HighPart; }
    [StructLayout(LayoutKind.Sequential)] private struct RATIONAL { public uint Numerator; public uint Denominator; }
    [StructLayout(LayoutKind.Sequential)] private struct PATH_SOURCE_INFO { public LUID adapterId; public uint id; public uint modeInfoIdx; public uint statusFlags; }
    [StructLayout(LayoutKind.Sequential)]
    private struct PATH_TARGET_INFO
    {
        public LUID adapterId; public uint id; public uint modeInfoIdx; public uint outputTechnology; public uint rotation; public uint scaling;
        public RATIONAL refreshRate; public uint scanLineOrdering; public int targetAvailable; public uint statusFlags;
    }
    [StructLayout(LayoutKind.Sequential)] private struct PATH_INFO { public PATH_SOURCE_INFO sourceInfo; public PATH_TARGET_INFO targetInfo; public uint flags; }
    [StructLayout(LayoutKind.Sequential, Size = 64)] private struct MODE_INFO { public uint infoType; public uint id; public LUID adapterId; }
    [StructLayout(LayoutKind.Sequential)] private struct DEVICE_INFO_HEADER { public uint type; public uint size; public LUID adapterId; public uint id; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SOURCE_DEVICE_NAME { public DEVICE_INFO_HEADER header; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string viewGdiDeviceName; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct TARGET_DEVICE_NAME
    {
        public DEVICE_INFO_HEADER header; public uint flags; public uint outputTechnology; public ushort edidManufactureId; public ushort edidProductCodeId; public uint connectorInstance;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string monitorFriendlyDeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string monitorDevicePath;
    }

    [StructLayout(LayoutKind.Sequential)] private struct GET_ADVANCED_COLOR_INFO { public DEVICE_INFO_HEADER header; public uint value; public int colorEncoding; public uint bitsPerColorChannel; }
    [StructLayout(LayoutKind.Sequential)] private struct GET_ADVANCED_COLOR_INFO_2 { public DEVICE_INFO_HEADER header; public uint value; public int colorEncoding; public uint bitsPerColorChannel; public int activeColorMode; }
    [StructLayout(LayoutKind.Sequential)] private struct SET_ADVANCED_COLOR_STATE { public DEVICE_INFO_HEADER header; public uint value; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DEVMODE
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public uint dmFields;
        public int dmPositionX, dmPositionY;
        public uint dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency, dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
    }

    [DllImport("user32.dll")] private static extern int GetDisplayConfigBufferSizes(uint flags, out uint pathCount, out uint modeCount);
    [DllImport("user32.dll")] private static extern int QueryDisplayConfig(uint flags, ref uint pathCount, [Out] PATH_INFO[] paths, ref uint modeCount, [Out] MODE_INFO[] modes, IntPtr topology);
    [DllImport("user32.dll")] private static extern int DisplayConfigGetDeviceInfo(ref SOURCE_DEVICE_NAME info);
    [DllImport("user32.dll")] private static extern int DisplayConfigGetDeviceInfo(ref TARGET_DEVICE_NAME info);
    [DllImport("user32.dll")] private static extern int DisplayConfigGetDeviceInfo(ref GET_ADVANCED_COLOR_INFO info);
    [DllImport("user32.dll")] private static extern int DisplayConfigGetDeviceInfo(ref GET_ADVANCED_COLOR_INFO_2 info);
    [DllImport("user32.dll")] private static extern int DisplayConfigSetDeviceInfo(ref SET_ADVANCED_COLOR_STATE info);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool EnumDisplaySettingsExW(string deviceName, int modeNum, ref DEVMODE devMode, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int ChangeDisplaySettingsExW(string deviceName, ref DEVMODE devMode, IntPtr hwnd, uint flags, IntPtr lParam);
}
