using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Deck.Desktop;

/// <summary>Das Programmfenster: eine WebView2, die die Oberflaeche des lokal laufenden Dienstes zeigt.</summary>
internal sealed class MainForm : Form
{
    private static readonly Color Canvas = Color.FromArgb(11, 13, 18); // wie --c-canvas im dunklen Theme

    private readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Canvas };
    private readonly Uri _startUri;
    private readonly string _userDataFolder;
    private readonly WindowStore _store;
    private bool _forceClose;
    private bool _fullScreen;
    private Rectangle _restoreBounds;
    private FormWindowState _restoreState;

    /// <summary>Wird ausgeloest, wenn das Schliessen-Kreuz das Fenster nur in den Tray schickt.</summary>
    public event Action? HiddenToTray;

    public MainForm(string product, Uri startUri, string dataDir)
    {
        _startUri = startUri;
        _userDataFolder = Path.Combine(dataDir, "webview2");
        _store = new WindowStore(Path.Combine(dataDir, "window.json"));

        Text = product;
        Icon = AppIcon.Large();
        BackColor = Canvas;
        MinimumSize = new Size(640, 420);
        ClientSize = new Size(1280, 800);
        StartPosition = FormStartPosition.CenterScreen;
        if (_store.Load() is { } saved)
        {
            StartPosition = FormStartPosition.Manual;
            Bounds = new Rectangle(saved.X, saved.Y, saved.Width, saved.Height);
            if (saved.Maximized) WindowState = FormWindowState.Maximized;
        }

        Controls.Add(_web);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Native.UseDarkTitleBar(Handle);
    }

    /// <summary>Startet WebView2 und laedt die Oberflaeche. Wirft <see cref="WebView2RuntimeNotFoundException"/>, wenn die Laufzeit fehlt.</summary>
    public async Task InitializeWebViewAsync()
    {
        _ = Handle; // WebView2 braucht ein erzeugtes Fenster-Handle, auch wenn das Fenster (Tray-Start) noch nicht sichtbar ist
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: _userDataFolder);
        await _web.EnsureCoreWebView2Async(environment);

        var core = _web.CoreWebView2;
        var settings = core.Settings;
        settings.AreDefaultContextMenusEnabled = false; // die Oberflaeche hat eigene Kontextmenues
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
#if DEBUG
        settings.AreDevToolsEnabled = true;
        settings.AreBrowserAcceleratorKeysEnabled = true;
#else
        settings.AreDevToolsEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
#endif

        // Externe Links oeffnen im Standardbrowser - das Fenster bleibt bei der eigenen Oberflaeche.
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenExternal(e.Uri);
        };
        core.NavigationStarting += (_, e) =>
        {
            if (IsOwnOrigin(e.Uri)) return;
            e.Cancel = true;
            OpenExternal(e.Uri);
        };
        core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        core.ContainsFullScreenElementChanged += (_, _) => SetFullScreen(core.ContainsFullScreenElement);

        core.Navigate(_startUri.ToString());
    }

    public void ShowWindow()
    {
        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        // Aus dem Tray/zweiten Start heraus verweigert Windows sonst haeufig den Vordergrund.
        TopMost = true;
        TopMost = false;
        Activate();
    }

    /// <summary>Schliesst das Fenster wirklich (statt nur in den Tray zu verschwinden) - beim Beenden der App.</summary>
    public void ForceClose()
    {
        _forceClose = true;
        Close();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        SaveBounds();
        if (!_forceClose && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            HiddenToTray?.Invoke();
        }
        base.OnFormClosing(e);
    }

    private void SaveBounds()
    {
        if (_fullScreen || WindowState == FormWindowState.Minimized) return;
        var maximized = WindowState == FormWindowState.Maximized;
        _store.Save(maximized ? RestoreBounds : Bounds, maximized);
    }

    private void SetFullScreen(bool on)
    {
        if (on == _fullScreen) return;
        _fullScreen = on;
        if (on)
        {
            _restoreState = WindowState;
            _restoreBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            Bounds = Screen.FromControl(this).Bounds;
            TopMost = true; // ueber der Taskleiste
        }
        else
        {
            TopMost = false;
            FormBorderStyle = FormBorderStyle.Sizable;
            Bounds = _restoreBounds;
            WindowState = _restoreState;
        }
    }

    private bool IsOwnOrigin(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && (parsed.IsLoopback || parsed.Host.Equals(_startUri.Host, StringComparison.OrdinalIgnoreCase));

    private static void OpenExternal(string uri)
    {
        // Nur normale Web-Adressen - nie file:, javascript: o.ae. an das System weiterreichen.
        if (Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && parsed.Scheme is "http" or "https")
            Process.Start(new ProcessStartInfo(parsed.ToString()) { UseShellExecute = true })?.Dispose();
    }
}
