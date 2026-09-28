using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.Json;
using Deck.Server.Actions;
using Deck.Server.Data;
using Deck.Server.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Hotkeys;

/// <summary>Stand der systemweiten Tastenkuerzel - fuer Editor-Hinweise.</summary>
public record HotkeyStatus(bool Global, IReadOnlyList<string> Conflicts);

/// <summary>Plattformneutraler Zugriff: auf Nicht-Windows-Systemen (z.B. Docker) inaktiv.</summary>
public interface IGlobalHotkeys
{
    HotkeyStatus Status { get; }
    void Invalidate();
}

public sealed class NoGlobalHotkeys : IGlobalHotkeys
{
    public HotkeyStatus Status { get; } = new(false, []);
    public void Invalidate() { }
}

/// <summary>
/// Meldet die Tastenkuerzel aller Tasten systemweit bei Windows an (RegisterHotKey) - wie OBS: sie
/// greifen auch, wenn ein Spiel im Vordergrund ist. Laeuft auf einem eigenen Thread mit
/// Nachrichtenschleife (WM_HOTKEY landet in der Queue genau des Threads, der registriert hat).
/// Kuerzel, die ein anderes Programm schon belegt, landen in <see cref="HotkeyStatus.Conflicts"/>.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class GlobalHotkeyService(
    IServiceScopeFactory scopes,
    ActionExecutor executor,
    HubNotifier notifier,
    IHubContext<DeckHub> hub,
    ILogger<GlobalHotkeyService> log) : BackgroundService, IGlobalHotkeys
{
    private const uint ModAlt = 0x1, ModControl = 0x2, ModShift = 0x4, ModWin = 0x8, ModNoRepeat = 0x4000;
    private const uint WmHotkey = 0x0312, WmQuit = 0x0012, WmReload = 0x8001;

    private readonly ConcurrentDictionary<int, int> _idToButton = new();
    private volatile IReadOnlyDictionary<string, int> _wanted = new Dictionary<string, int>();
    private volatile HotkeyStatus _status = new(true, []);
    private uint _threadId;
    private readonly TaskCompletionSource _threadReady = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public HotkeyStatus Status => _status;

    public void Invalidate() => _ = ReloadAsync();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var thread = new Thread(MessageLoop) { IsBackground = true, Name = "GlobalHotkeys" };
        thread.Start();
        await _threadReady.Task;
        notifier.DecksChanged += Invalidate;
        await ReloadAsync();

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
        finally
        {
            notifier.DecksChanged -= Invalidate;
            PostThreadMessage(_threadId, WmQuit, UIntPtr.Zero, IntPtr.Zero);
        }
    }

    private async Task ReloadAsync()
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            _wanted = await db.Buttons.AsNoTracking().Where(b => b.Hotkey != null).ToDictionaryAsync(b => b.Hotkey!, b => b.Id);
            if (_threadId != 0) PostThreadMessage(_threadId, WmReload, UIntPtr.Zero, IntPtr.Zero);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Tastenkuerzel konnten nicht geladen werden.");
        }
    }

    private void MessageLoop()
    {
        _threadId = GetCurrentThreadId();
        // Message-Queue des Threads anlegen, bevor andere Threads hineinposten.
        PeekMessage(out _, IntPtr.Zero, 0, 0, 0);
        _threadReady.TrySetResult();

        while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
        {
            if (msg.message == WmReload) RegisterAll();
            else if (msg.message == WmHotkey && _idToButton.TryGetValue((int)msg.wParam, out var buttonId))
                _ = Task.Run(() => TriggerAsync(buttonId));
        }

        foreach (var id in _idToButton.Keys) UnregisterHotKey(IntPtr.Zero, id);
    }

    private void RegisterAll()
    {
        foreach (var id in _idToButton.Keys) UnregisterHotKey(IntPtr.Zero, id);
        _idToButton.Clear();

        var conflicts = new List<string>();
        var nextId = 1;
        foreach (var (hotkey, buttonId) in _wanted)
        {
            if (!TryParse(hotkey, out var mods, out var vk)) { conflicts.Add(hotkey); continue; }
            var id = nextId++;
            if (RegisterHotKey(IntPtr.Zero, id, mods | ModNoRepeat, vk)) _idToButton[id] = buttonId;
            else conflicts.Add(hotkey); // meist: anderes Programm (z.B. OBS) hat dieselbe Kombination
        }
        _status = new HotkeyStatus(true, conflicts);
        if (conflicts.Count > 0) log.LogInformation("{Count} Tastenkuerzel sind von anderen Programmen belegt: {List}", conflicts.Count, string.Join(", ", conflicts));
        _ = hub.Clients.All.SendAsync("hotkeysChanged");
    }

    private async Task TriggerAsync(int buttonId)
    {
        string? error = null;
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var button = await db.Buttons.AsNoTracking().FirstOrDefaultAsync(b => b.Id == buttonId);
            if (button is null) return;
            var steps = JsonSerializer.Deserialize<List<ActionStep>>(button.ActionsJson, JsonSerializerOptions.Web) ?? [];
            // Deck-Navigation (Ordner/Zurueck) hat ohne sichtbares Deck keine Bedeutung.
            await executor.ExecuteAsync(steps.Where(s => !ActionCatalog.IsClientSide(s.Type)).ToList(), $"Tastenkürzel '{button.Label}'");
        }
        catch (ActionExecutionException ex) { error = ex.Message; }
        catch (Exception ex) { error = ex.Message; log.LogWarning(ex, "Tastenkuerzel fehlgeschlagen."); }
        // Offene Decks lassen die Taste kurz einsinken bzw. zeigen den Fehler.
        await hub.Clients.All.SendAsync("keyTriggered", buttonId, error);
    }

    // ---------- Umsetzung KeyboardEvent.code -> Windows-Virtual-Key ----------

    /// <summary>Physische Tasten per Scancode - so trifft "KeyY" auch auf QWERTZ die richtige Taste.</summary>
    private static readonly Dictionary<string, uint> ScanCodes = new()
    {
        ["KeyA"] = 0x1E, ["KeyB"] = 0x30, ["KeyC"] = 0x2E, ["KeyD"] = 0x20, ["KeyE"] = 0x12, ["KeyF"] = 0x21, ["KeyG"] = 0x22,
        ["KeyH"] = 0x23, ["KeyI"] = 0x17, ["KeyJ"] = 0x24, ["KeyK"] = 0x25, ["KeyL"] = 0x26, ["KeyM"] = 0x32, ["KeyN"] = 0x31,
        ["KeyO"] = 0x18, ["KeyP"] = 0x19, ["KeyQ"] = 0x10, ["KeyR"] = 0x13, ["KeyS"] = 0x1F, ["KeyT"] = 0x14, ["KeyU"] = 0x16,
        ["KeyV"] = 0x2F, ["KeyW"] = 0x11, ["KeyX"] = 0x2D, ["KeyY"] = 0x15, ["KeyZ"] = 0x2C,
        ["Digit1"] = 0x02, ["Digit2"] = 0x03, ["Digit3"] = 0x04, ["Digit4"] = 0x05, ["Digit5"] = 0x06, ["Digit6"] = 0x07,
        ["Digit7"] = 0x08, ["Digit8"] = 0x09, ["Digit9"] = 0x0A, ["Digit0"] = 0x0B,
        ["Minus"] = 0x0C, ["Equal"] = 0x0D, ["BracketLeft"] = 0x1A, ["BracketRight"] = 0x1B, ["Semicolon"] = 0x27, ["Quote"] = 0x28,
        ["Backquote"] = 0x29, ["Backslash"] = 0x2B, ["Comma"] = 0x33, ["Period"] = 0x34, ["Slash"] = 0x35, ["IntlBackslash"] = 0x56,
    };

    /// <summary>Layout-unabhaengige Tasten direkt als Virtual-Key.</summary>
    private static readonly Dictionary<string, uint> VirtualKeys = new()
    {
        ["Space"] = 0x20, ["Enter"] = 0x0D, ["Tab"] = 0x09, ["Escape"] = 0x1B, ["Backspace"] = 0x08, ["Insert"] = 0x2D, ["Delete"] = 0x2E,
        ["Home"] = 0x24, ["End"] = 0x23, ["PageUp"] = 0x21, ["PageDown"] = 0x22, ["ArrowLeft"] = 0x25, ["ArrowUp"] = 0x26, ["ArrowRight"] = 0x27,
        ["ArrowDown"] = 0x28, ["PrintScreen"] = 0x2C, ["ScrollLock"] = 0x91, ["Pause"] = 0x13,
        ["NumpadMultiply"] = 0x6A, ["NumpadAdd"] = 0x6B, ["NumpadSubtract"] = 0x6D, ["NumpadDecimal"] = 0x6E, ["NumpadDivide"] = 0x6F,
        ["MediaPlayPause"] = 0xB3, ["MediaStop"] = 0xB2, ["MediaTrackNext"] = 0xB0, ["MediaTrackPrevious"] = 0xB1,
        ["AudioVolumeMute"] = 0xAD, ["AudioVolumeDown"] = 0xAE, ["AudioVolumeUp"] = 0xAF,
    };

    private static bool TryParse(string hotkey, out uint mods, out uint vk)
    {
        mods = 0;
        vk = 0;
        var parts = hotkey.Split('+');
        foreach (var p in parts[..^1])
            mods |= p switch { "Ctrl" => ModControl, "Alt" => ModAlt, "Shift" => ModShift, "Meta" => ModWin, _ => 0 };
        var code = parts[^1];

        if (VirtualKeys.TryGetValue(code, out vk)) return true;
        if (code.Length is 2 or 3 && code[0] == 'F' && int.TryParse(code[1..], out var f) && f is >= 1 and <= 24) { vk = (uint)(0x70 + f - 1); return true; }
        if (code.StartsWith("Numpad") && code.Length == 7 && char.IsDigit(code[6])) { vk = (uint)(0x60 + (code[6] - '0')); return true; }
        if (ScanCodes.TryGetValue(code, out var scan))
        {
            vk = MapVirtualKeyEx(scan, 3 /* MAPVK_VSC_TO_VK_EX */, GetKeyboardLayout(0));
            return vk != 0;
        }
        return false;
    }

    // ---------- Win32 ----------

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
        public uint lPrivate;
    }

    [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] private static extern int GetMessage(out Msg lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Msg lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostThreadMessage(uint idThread, uint msg, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint MapVirtualKeyEx(uint uCode, uint uMapType, IntPtr dwhkl);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint idThread);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
}
