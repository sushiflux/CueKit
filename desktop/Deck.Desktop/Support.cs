using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32;

namespace Deck.Desktop;

/// <summary>Kleines Ereignisprotokoll (desktop.log im Datenordner) - fuer Support und Tests, z.B. Update-Pruefungen.</summary>
internal static class AppLog
{
    private static string? _path;
    private static readonly object Gate = new();

    public static void Configure(string dataDir) => _path = Path.Combine(dataDir, "desktop.log");

    public static void Write(string message)
    {
        if (_path is null) return;
        lock (Gate)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                // Nicht unbegrenzt wachsen lassen: ab 256 KB die alte Datei ersetzen.
                if (File.Exists(_path) && new FileInfo(_path).Length > 256 * 1024) File.Move(_path, _path + ".old", overwrite: true);
                File.AppendAllText(_path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Das Protokoll ist Beiwerk - niemals ein Grund, die App zu stoeren.
            }
        }
    }
}

internal static class Dialogs
{
    public static void Error(string title, string message) => MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);

    public static void Info(string title, string message) => MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
}

/// <summary>Das App-Icon (branding/icon.ico, mehrere Groessen) als Fenster- und Tray-Icon in der passenden Aufloesung.</summary>
internal static class AppIcon
{
    private static byte[] Bytes()
    {
        using var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("icon.ico") ?? throw new InvalidOperationException("Icon-Ressource fehlt.");
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }

    public static Icon Small() => new(new MemoryStream(Bytes()), SystemInformation.SmallIconSize);

    public static Icon Large() => new(new MemoryStream(Bytes()), SystemInformation.IconSize);
}

/// <summary>"Mit Windows starten": Eintrag im Run-Schluessel des aktuellen Benutzers (keine Adminrechte noetig).</summary>
internal static class AutoStart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    public static bool IsEnabled(string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(name) is string;
    }

    public static void Set(string name, bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) key.SetValue(name, $"\"{Environment.ProcessPath}\" --tray");
        else key.DeleteValue(name, throwOnMissingValue: false);
    }
}

internal static class Native
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
    private static extern int SetWindowTheme(IntPtr hwnd, string? subAppName, string? subIdList);

    /// <summary>Dunkle Bildlaufleisten (statt der hellen Standardleisten) in einem dunklen Steuerelement.</summary>
    public static void UseDarkScrollbars(IntPtr hwnd) => _ = SetWindowTheme(hwnd, "DarkMode_Explorer", null);

    /// <summary>Dunkle Titelleiste (Windows 10 ab 20H1 / Windows 11) - passt zur dunklen Oberflaeche.</summary>
    public static void UseDarkTitleBar(IntPtr hwnd)
    {
        var on = 1;
        _ = DwmSetWindowAttribute(hwnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
    }
}

/// <summary>Merkt sich Position/Groesse des Fensters zwischen den Starts (window.json im Datenordner).</summary>
internal sealed class WindowStore(string path)
{
    public sealed record Saved(int X, int Y, int Width, int Height, bool Maximized);

    public Saved? Load()
    {
        try
        {
            if (!File.Exists(path)) return null;
            var saved = JsonSerializer.Deserialize<Saved>(File.ReadAllText(path));
            // Nur uebernehmen, wenn das Fenster auf einem aktuell angeschlossenen Bildschirm sichtbar ist
            // (Monitor abgesteckt, Aufloesung geaendert ...).
            return saved is { Width: >= 320, Height: >= 240 } && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(saved.X, saved.Y, saved.Width, saved.Height)))
                ? saved
                : null;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    public void Save(Rectangle bounds, bool maximized)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, JsonSerializer.Serialize(new Saved(bounds.X, bounds.Y, bounds.Width, bounds.Height, maximized)));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Fenstergroesse ist eine Bequemlichkeit - kein Grund, das Beenden zu stoeren.
        }
    }
}
