using Velopack;
using Velopack.Sources;

namespace Deck.Desktop;

/// <summary>
/// Auto-Update ueber Velopack. Funktioniert nur in der installierten App (Setup von Velopack); beim Start
/// aus dem Build-Ordner meldet <see cref="IsInstalled"/> false und es passiert nichts. Die Feed-Adresse ist
/// ein GitHub-Repository (nur Releases, oeffentlich lesbar) oder ein Webserver mit den Velopack-Dateien.
/// </summary>
internal sealed class UpdateService
{
    /// <summary>Platzhalter, bis ein oeffentliches Release-Repository existiert (siehe docs/DISTRIBUTION.md).</summary>
    public const string DefaultFeedUrl = "https://github.com/SushiFlux-Develop/cuekit-releases";

    private readonly UpdateManager _manager;

    public UpdateService(string feedUrl)
    {
        IUpdateSource source = feedUrl.Contains("github.com", StringComparison.OrdinalIgnoreCase)
            ? new GithubSource(feedUrl, accessToken: null, prerelease: false)
            : new SimpleWebSource(feedUrl);
        _manager = new UpdateManager(source);
    }

    public bool IsInstalled => _manager.IsInstalled;

    public string CurrentVersion => _manager.CurrentVersion?.ToString() ?? "-";

    /// <summary>Sucht ein Update und laedt es herunter. Null, wenn die installierte Version aktuell ist.</summary>
    public async Task<UpdateInfo?> CheckAndDownloadAsync(CancellationToken ct = default)
    {
        var info = await _manager.CheckForUpdatesAsync();
        if (info is null) return null;
        await _manager.DownloadUpdatesAsync(info, cancelToken: ct);
        return info;
    }

    /// <summary>Installiert das heruntergeladene Update, sobald die App beendet ist, und startet sie danach neu.</summary>
    /// <param name="restartArgs">Startargumente fuer den Neustart (z.B. --tray) - sonst startet die aktualisierte App ohne sie.</param>
    public void ApplyOnExitAndRestart(UpdateInfo info, string[] restartArgs) =>
        _manager.WaitExitThenApplyUpdates(info.TargetFullRelease, silent: false, restart: true, restartArgs: restartArgs);
}
