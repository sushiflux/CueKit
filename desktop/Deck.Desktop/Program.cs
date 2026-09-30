using Velopack;

namespace Deck.Desktop;

internal static class Program
{
    // "Local\" = pro Windows-Sitzung: jeder angemeldete Benutzer kann seine eigene Instanz haben.
    private const string InstanceMutexName = @"Local\SushiFluxDevelop.Deck.Desktop";
    private const string ShowEventName = @"Local\SushiFluxDevelop.Deck.Desktop.Show";

    [STAThread]
    private static void Main(string[] args)
    {
        // Velopack: Installations-, Update- und Deinstallations-Hooks. Muss als Erstes laufen und beendet den
        // Prozess selbst, wenn er nur als Hook gestartet wurde; ohne Installation (Build-Ordner) ein No-op.
        VelopackApp.Build()
            .OnBeforeUninstallFastCallback(_ => AutoStart.Set(Application.ProductName ?? "", enabled: false))
            .Run();

        // Aus Startmenue/Autostart ist das Arbeitsverzeichnis nicht der Programmordner - der Dienst sucht
        // wwwroot, branding.json und version.txt relativ dazu.
        Directory.SetCurrentDirectory(AppContext.BaseDirectory);
        ApplicationConfiguration.Initialize();

        using var mutex = new Mutex(initiallyOwned: true, InstanceMutexName, out var isFirstInstance);
        using var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        if (!isFirstInstance)
        {
            // Zweiter Start: die laufende Instanz holt ihr Fenster nach vorn, dieser Prozess endet sofort.
            showEvent.Set();
            return;
        }

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Dialogs.Error($"{Application.ProductName}: unerwarteter Fehler", e.Exception.Message);

        Application.Run(new TrayApplicationContext(StartOptions.Parse(args), showEvent));
    }
}

/// <summary>
/// Startparameter der Huelle: <c>--tray</c> (ohne Fenster im Tray starten, so startet der Autostart) und
/// <c>--dev-url=http://localhost:5200</c> (Entwicklung: Fenster zeigt den Vite-Server statt der gebauten
/// Oberflaeche) und <c>--accept-eula</c> (Lizenz ohne Dialog bestaetigen - fuer unbeaufsichtigte Installationen und
/// automatisierte Tests) sowie <c>--auto-update</c> (sofort nach Updates suchen und ein gefundenes ohne Rueckfrage
/// installieren - ebenfalls fuer unbeaufsichtigten Betrieb und Tests). Alle uebrigen Argumente (z.B. <c>--Deck:Port=5215</c>, <c>--Deck:DataDir=...</c>) gehen
/// unveraendert an den Dienst.
/// </summary>
internal sealed record StartOptions(bool StartHidden, string? DevUrl, bool AcceptEula, bool AutoUpdate, string[] AllArgs, string[] ServerArgs)
{
    private const string DevUrlPrefix = "--dev-url=";

    public static StartOptions Parse(string[] args)
    {
        var hidden = args.Contains("--tray", StringComparer.OrdinalIgnoreCase);
        var acceptEula = args.Contains("--accept-eula", StringComparer.OrdinalIgnoreCase);
        var autoUpdate = args.Contains("--auto-update", StringComparer.OrdinalIgnoreCase);
        var devUrl = args.FirstOrDefault(a => a.StartsWith(DevUrlPrefix, StringComparison.OrdinalIgnoreCase))?[DevUrlPrefix.Length..];
        // Eigene Schalter nicht weiterreichen: der Kommandozeilen-Provider von .NET wuerde "--tray" sonst mit dem
        // naechsten Argument als Schluessel/Wert-Paar verschlucken.
        var serverArgs = args
            .Where(a => !a.Equals("--tray", StringComparison.OrdinalIgnoreCase) && !a.Equals("--accept-eula", StringComparison.OrdinalIgnoreCase) && !a.Equals("--auto-update", StringComparison.OrdinalIgnoreCase) && !a.StartsWith(DevUrlPrefix, StringComparison.OrdinalIgnoreCase))
            .ToArray();
        return new StartOptions(hidden, devUrl, acceptEula, autoUpdate, args, serverArgs);
    }
}
