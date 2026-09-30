using System.Diagnostics;
using Deck.Server;
using Microsoft.Extensions.Configuration;
using Microsoft.Web.WebView2.Core;
using Velopack;

namespace Deck.Desktop;

/// <summary>
/// Lebenszyklus der Desktop-App: Tray-Symbol, Dienst im selben Prozess, Fenster mit WebView2. Das
/// Schliessen-Kreuz schickt das Fenster nur in den Tray; beendet wird ueber das Tray-Menue.
/// </summary>
internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly StartOptions _options;
    private readonly string _product = Application.ProductName ?? "App";
    private readonly ServiceHost _service = new();
    private readonly NotifyIcon _tray;
    private SynchronizationContext? _ui;
    private MainForm? _form;
    private bool _exiting;
    private bool _trayHintShown;
    private UpdateService? _updates;
    private UpdateInfo? _pendingUpdate;
    private ToolStripMenuItem? _applyUpdateItem;
    private bool _checkingForUpdates;

    public TrayApplicationContext(StartOptions options, EventWaitHandle showEvent)
    {
        _options = options;

        var autoStart = new ToolStripMenuItem("Mit Windows starten") { CheckOnClick = true, Checked = AutoStart.IsEnabled(_product) };
        autoStart.CheckedChanged += (_, _) => AutoStart.Set(_product, autoStart.Checked);

        var menu = new ContextMenuStrip();
        var open = new ToolStripMenuItem($"{_product} öffnen", null, (_, _) => ShowWindow());
        open.Font = new Font(menu.Font, FontStyle.Bold);
        menu.Items.Add(open);
        menu.Items.Add("Im Browser öffnen", null, (_, _) => OpenInBrowser());
        menu.Items.Add(new ToolStripSeparator());
        // Store-Version (MSIX): der Store aktualisiert, und der Run-Schlüssel-Autostart greift im Paket nicht.
        if (!Native.IsPackaged)
        {
            menu.Items.Add(autoStart);
            menu.Items.Add("Nach Updates suchen", null, (_, _) => _ = CheckForUpdatesAsync(userInitiated: true));
            _applyUpdateItem = new ToolStripMenuItem("Update installieren", null, (_, _) => ApplyPendingUpdate()) { Visible = false };
            _applyUpdateItem.Font = new Font(menu.Font, FontStyle.Bold);
            menu.Items.Add(_applyUpdateItem);
            menu.Items.Add(new ToolStripSeparator());
        }
        menu.Items.Add("Beenden", null, (_, _) => ExitApplication());

        _tray = new NotifyIcon { Icon = AppIcon.Small(), Text = _product, ContextMenuStrip = menu, Visible = true };
        _tray.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) ShowWindow();
        };

        // Zweiter Programmstart meldet sich ueber dieses Signal - dann Fenster nach vorn.
        new Thread(() =>
        {
            while (showEvent.WaitOne()) _ui?.Post(_ => ShowWindow(), null);
        }) { IsBackground = true, Name = "show-signal" }.Start();

        // Erst starten, wenn die Nachrichtenschleife laeuft (dann existiert der UI-SynchronizationContext).
        Application.Idle += OnFirstIdle;
    }

    private void OnFirstIdle(object? sender, EventArgs e)
    {
        Application.Idle -= OnFirstIdle;
        _ui = SynchronizationContext.Current;
        _ = StartAsync();
    }

    private async Task StartAsync()
    {
        // Lizenzvereinbarung vor allem anderen: solange sie nicht bestaetigt ist, startet weder Dienst noch Fenster.
        // Der Datenordner wird mit derselben Regel wie beim Dienst bestimmt (Kommandozeile/Umgebung/Standard).
        var dataDir = ServerHost.ResolveDataDir(new ConfigurationBuilder().AddEnvironmentVariables().AddCommandLine(_options.ServerArgs).Build());
        if (!_options.AcceptEula && !EulaGate.EnsureAccepted(dataDir, _product))
        {
            ExitApplication();
            return;
        }

        try
        {
            await _service.StartAsync(_options.ServerArgs);
        }
        catch (Exception ex)
        {
            Dialogs.Error($"{_product} konnte nicht starten", Describe(ex));
            ExitApplication();
            return;
        }

        _form = new MainForm(_product, _options.DevUrl is { Length: > 0 } dev ? new Uri(dev) : _service.LocalUri, _service.DataDir);
        _form.HiddenToTray += OnFormHidden;
        try
        {
            await _form.InitializeWebViewAsync();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            // Der Dienst laeuft trotzdem (Handys/Tablets, Tastenkuerzel) - nur das eigene Fenster fehlt.
            Dialogs.Error(
                $"{_product}: WebView2 fehlt",
                "Für das Programmfenster wird die „Microsoft Edge WebView2“-Laufzeit benötigt, sie ist auf diesem PC nicht installiert.\n\n" +
                "Download: https://developer.microsoft.com/microsoft-edge/webview2/\n\n" +
                $"{_product} läuft im Hintergrund weiter. Über das Tray-Symbol → „Im Browser öffnen“ kannst du die Oberfläche trotzdem nutzen.");
            _form.Dispose();
            _form = null;
            return;
        }
        catch (Exception ex)
        {
            Dialogs.Error($"{_product}: Fenster konnte nicht geöffnet werden", ex.Message);
            _form.Dispose();
            _form = null;
            return;
        }

        if (!_options.StartHidden) _form.ShowWindow();

        AppLog.Configure(_service.DataDir);
        var feedUrl = _service.Configuration?["Deck:UpdateFeedUrl"] is { Length: > 0 } feed ? feed : UpdateService.DefaultFeedUrl;
        _updates = new UpdateService(feedUrl);
        AppLog.Write($"Start: Version {_updates.CurrentVersion}, installiert={_updates.IsInstalled}, Update-Feed={feedUrl}");
        if (_updates.IsInstalled) _ = RunUpdateLoopAsync();
    }

    /// <summary>Im Hintergrund alle paar Stunden nach Updates sehen - leise, ohne Dialoge bei Fehlern.</summary>
    private async Task RunUpdateLoopAsync()
    {
        if (_options.AutoUpdate)
        {
            // Unbeaufsichtigt/Test: sofort pruefen und ein gefundenes Update ohne Rueckfrage einspielen.
            await CheckForUpdatesAsync(userInitiated: false);
            if (_pendingUpdate is not null) ApplyPendingUpdate();
            return;
        }

        await Task.Delay(TimeSpan.FromSeconds(30));
        while (!_exiting)
        {
            await CheckForUpdatesAsync(userInitiated: false);
            await Task.Delay(TimeSpan.FromHours(6));
        }
    }

    private async Task CheckForUpdatesAsync(bool userInitiated)
    {
        if (_updates is null || _checkingForUpdates) return;
        if (!_updates.IsInstalled)
        {
            if (userInitiated) Dialogs.Info(_product, "Updates gibt es nur in der installierten Version – dieser Start läuft aus einem Entwicklungs- oder Programmordner.");
            return;
        }

        _checkingForUpdates = true;
        try
        {
            AppLog.Write("Update-Pruefung gestartet");
            var info = await _updates.CheckAndDownloadAsync();
            if (info is null)
            {
                AppLog.Write("Update-Pruefung: kein neueres Update");
                if (userInitiated) Dialogs.Info(_product, $"Du hast die aktuelle Version ({_updates.CurrentVersion}).");
                return;
            }

            _pendingUpdate = info;
            AppLog.Write($"Update {info.TargetFullRelease.Version} heruntergeladen und bereit");
            if (_applyUpdateItem is not null)
            {
                _applyUpdateItem.Text = $"Auf Version {info.TargetFullRelease.Version} aktualisieren";
                _applyUpdateItem.Visible = true;
            }
            _tray.ShowBalloonTip(5000, _product, $"Version {info.TargetFullRelease.Version} ist bereit – Tray-Symbol → „Auf Version {info.TargetFullRelease.Version} aktualisieren“.", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Update-Prüfung fehlgeschlagen: {ex.Message}");
            AppLog.Write($"Update-Pruefung fehlgeschlagen: {ex.Message}");
            if (userInitiated) Dialogs.Error($"{_product}: Update-Prüfung fehlgeschlagen", "Der Update-Server war nicht erreichbar oder lieferte keine gültigen Daten." + Environment.NewLine + Environment.NewLine + ex.Message);
        }
        finally
        {
            _checkingForUpdates = false;
        }
    }

    private void ApplyPendingUpdate()
    {
        if (_updates is null || _pendingUpdate is null) return;
        // Der Installer ersetzt die Dateien, sobald dieser Prozess beendet ist, und startet die App neu.
        AppLog.Write($"Update {_pendingUpdate.TargetFullRelease.Version} wird installiert, App startet danach neu");
        _updates.ApplyOnExitAndRestart(_pendingUpdate, _options.AllArgs);
        ExitApplication();
    }

    private void ShowWindow()
    {
        if (_form is not null) _form.ShowWindow();
        else OpenInBrowser();
    }

    private void OpenInBrowser()
    {
        if (_service.LocalUri.Port <= 1) return; // Dienst noch nicht gestartet
        Process.Start(new ProcessStartInfo(_service.LocalUri.ToString()) { UseShellExecute = true })?.Dispose();
    }

    private void OnFormHidden()
    {
        if (_trayHintShown) return;
        _trayHintShown = true;
        _tray.ShowBalloonTip(3500, _product, "Läuft im Hintergrund weiter. Beenden über das Tray-Symbol → „Beenden“.", ToolTipIcon.Info);
    }

    private async void ExitApplication()
    {
        if (_exiting) return;
        _exiting = true;
        _tray.Visible = false;
        _form?.ForceClose();
        try
        {
            await _service.DisposeAsync();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Dienst konnte nicht sauber beendet werden: {ex.Message}");
        }
        _tray.Dispose();
        ExitThread();
    }

    /// <summary>Startfehler mit dem konkreten Grund - besonders der haeufigste: Port bereits belegt.</summary>
    private string Describe(Exception ex)
    {
        var text = ex.Message;
        if (text.Contains("address already in use", StringComparison.OrdinalIgnoreCase) || text.Contains("Failed to bind", StringComparison.OrdinalIgnoreCase))
            return $"{text}\n\nDer Port ist bereits belegt – läuft {_product} schon (oder der Docker-Live-Stack auf demselben Port)? " +
                   "Alternativ einen anderen Port starten: --Deck:Port=<Nummer>.";
        return text;
    }
}
