using System.Collections.Concurrent;
using System.ComponentModel;
using System.Diagnostics;
using Deck.Server.Data;
using Deck.Server.Services;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Plugins;

public enum PluginRunState { Stopped, Starting, Running, Crashed, Error }

public record PluginRuntimeStatus(PluginRunState State, string? Message, int Restarts, IReadOnlyList<string> Log);

/// <summary>
/// Verwaltet installierte Plugin-Pakete: Installation aus ZIP (Datei oder Katalog), Deinstallation und
/// den Betrieb der Plugin-Prozesse (Node.js). Adresse und Plugin-Schluessel bekommt jeder Prozess
/// automatisch per Umgebungsvariable - der Nutzer muss nichts eintragen. Abstuerze werden mit
/// wachsender Pause neu gestartet; wer in kurzer Zeit zu oft abstuerzt, wird angehalten.
/// </summary>
public sealed class PluginManager(
    IServiceScopeFactory scopes,
    DataPaths paths,
    SettingsService settings,
    IServer server,
    IConfiguration config,
    ILogger<PluginManager> log) : BackgroundService
{
    private readonly ConcurrentDictionary<string, Runner> _runners = new();
    private readonly SemaphoreSlim _installLock = new(1, 1);
    private readonly TaskCompletionSource _started = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public event Action? Changed;

    public PluginRuntimeStatus StatusOf(string id) =>
        _runners.TryGetValue(id, out var r) ? r.Status : new PluginRuntimeStatus(PluginRunState.Stopped, null, 0, []);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Directory.CreateDirectory(paths.PluginsDir);
        CleanupStaging();

        // Erst starten, wenn Kestrel lauscht - die Plugins verbinden sich sofort zurueck.
        await Task.Yield();
        try { await WaitForServerAddressAsync(stoppingToken); } catch (OperationCanceledException) { return; }

        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            foreach (var p in await db.InstalledPlugins.AsNoTracking().Where(p => p.Enabled).ToListAsync(stoppingToken))
                Start(p);
        }

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
        finally
        {
            foreach (var r in _runners.Values) r.Stop();
        }
    }

    // ---------- Installation ----------

    public async Task<InstalledPluginEntity> InstallAsync(string zipPath, string source, CancellationToken ct)
    {
        await _installLock.WaitAsync(ct);
        var staging = Path.Combine(paths.PluginsDir, $".staging-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(staging);
            var manifest = PluginPackage.Extract(zipPath, staging);

            // Laeuft eine aeltere Version, erst stoppen - sonst sind ihre Dateien gesperrt.
            if (_runners.TryRemove(manifest.Id, out var old)) old.Stop();

            var target = PluginDir(manifest.Id);
            if (Directory.Exists(target)) Directory.Delete(target, recursive: true);
            Directory.Move(staging, target);

            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.InstalledPlugins.FindAsync([manifest.Id], ct);
            var isNew = entity is null;
            entity ??= new InstalledPluginEntity { Id = manifest.Id };
            entity.Name = manifest.Name;
            entity.Version = manifest.Version;
            entity.Author = manifest.Author;
            entity.Description = manifest.Description;
            entity.Icon = manifest.Icon ?? "tabler:puzzle";
            entity.Entry = manifest.Entry;
            entity.Source = source;
            entity.InstalledAt = DateTimeOffset.UtcNow;
            if (isNew) db.InstalledPlugins.Add(entity);
            await db.SaveChangesAsync(ct);

            log.LogInformation("Plugin {Name} {Version} installiert ({Source}).", entity.Name, entity.Version, source);
            if (entity.Enabled) Start(entity);
            Changed?.Invoke();
            return entity;
        }
        finally
        {
            if (Directory.Exists(staging)) TryDelete(staging);
            _installLock.Release();
        }
    }

    public async Task<bool> UninstallAsync(string id, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.InstalledPlugins.FindAsync([id], ct);
        if (entity is null) return false;
        if (_runners.TryRemove(id, out var runner)) runner.Stop();
        db.InstalledPlugins.Remove(entity);
        await db.SaveChangesAsync(ct);
        TryDelete(PluginDir(id));
        Changed?.Invoke();
        return true;
    }

    public async Task<bool> SetEnabledAsync(string id, bool enabled, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.InstalledPlugins.FindAsync([id], ct);
        if (entity is null) return false;
        entity.Enabled = enabled;
        await db.SaveChangesAsync(ct);
        if (enabled) Start(entity);
        else if (_runners.TryRemove(id, out var runner)) runner.Stop();
        Changed?.Invoke();
        return true;
    }

    public async Task<bool> RestartAsync(string id, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.InstalledPlugins.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (entity is null) return false;
        if (_runners.TryRemove(id, out var runner)) runner.Stop();
        Start(entity);
        return true;
    }

    // ---------- Prozesse ----------

    private void Start(InstalledPluginEntity plugin)
    {
        if (!_started.Task.IsCompletedSuccessfully) return; // beim Hochfahren startet ExecuteAsync alle
        var runner = new Runner(this, plugin.Id, plugin.Name, PluginDir(plugin.Id), plugin.Entry);
        if (_runners.TryRemove(plugin.Id, out var previous)) previous.Stop();
        _runners[plugin.Id] = runner;
        runner.Begin();
    }

    private string PluginDir(string id) => Path.Combine(paths.PluginsDir, id);

    private string NodeExecutable => config["Deck:NodePath"] is { Length: > 0 } p ? p : "node";

    private string _serverUrl = "";

    private async Task WaitForServerAddressAsync(CancellationToken ct)
    {
        while (true)
        {
            var address = server.Features.Get<IServerAddressesFeature>()?.Addresses.FirstOrDefault();
            if (address is not null)
            {
                var uri = new Uri(address.Replace("0.0.0.0", "127.0.0.1").Replace("[::]", "127.0.0.1").Replace("+", "127.0.0.1").Replace("*", "127.0.0.1"));
                _serverUrl = $"ws://127.0.0.1:{uri.Port}/ws/plugins";
                _started.TrySetResult();
                return;
            }
            await Task.Delay(200, ct);
        }
    }

    private void CleanupStaging()
    {
        foreach (var dir in Directory.EnumerateDirectories(paths.PluginsDir, ".staging-*")) TryDelete(dir);
    }

    private static void TryDelete(string dir)
    {
        try { Directory.Delete(dir, recursive: true); } catch { /* beim naechsten Start */ }
    }

    private void RaiseChanged() => Changed?.Invoke();

    // Fuer die verschachtelte Runner-Klasse (Parameter des primaeren Konstruktors sind dort nicht sichtbar).
    private string PluginKey => settings.Get(SettingKeys.PluginKey) ?? "";
    private ILogger Log => log;

    /// <summary>Ein ueberwachter Plugin-Prozess mit Neustart-Logik und Protokoll-Puffer.</summary>
    private sealed class Runner(PluginManager owner, string id, string name, string dir, string entry)
    {
        private const int LogLines = 200;
        private readonly CancellationTokenSource _cts = new();
        private readonly ConcurrentQueue<string> _log = new();
        private Process? _process;
        private volatile PluginRunState _state = PluginRunState.Starting;
        private string? _message;
        private int _restarts;

        public PluginRuntimeStatus Status => new(_state, _message, _restarts, _log.ToArray());

        public void Begin() => _ = Task.Run(() => LoopAsync(_cts.Token));

        public void Stop()
        {
            _cts.Cancel();
            try { if (_process is { HasExited: false }) _process.Kill(entireProcessTree: true); } catch { }
            _state = PluginRunState.Stopped;
        }

        private async Task LoopAsync(CancellationToken ct)
        {
            var quickCrashes = 0;
            var delay = TimeSpan.FromSeconds(1);
            while (!ct.IsCancellationRequested)
            {
                var startedAt = DateTimeOffset.UtcNow;
                Set(PluginRunState.Starting, null);
                int exitCode;
                try
                {
                    exitCode = await RunOnceAsync(ct);
                }
                catch (Win32Exception)
                {
                    Set(PluginRunState.Error, "Node.js-Laufzeit nicht gefunden. Die Desktop-App bringt sie mit; im Entwicklungsbetrieb Node.js installieren oder Deck:NodePath setzen.");
                    return;
                }
                catch (OperationCanceledException) { return; }
                catch (Exception ex)
                {
                    Set(PluginRunState.Error, $"Plugin konnte nicht gestartet werden: {ex.Message}");
                    return;
                }

                if (ct.IsCancellationRequested) return;
                _restarts++;
                var ranFor = DateTimeOffset.UtcNow - startedAt;
                quickCrashes = ranFor < TimeSpan.FromSeconds(30) ? quickCrashes + 1 : 0;
                var lastLine = _log.LastOrDefault();
                if (quickCrashes >= 5)
                {
                    Set(PluginRunState.Crashed, $"Wurde angehalten: 5 Abstürze kurz hintereinander (Exit-Code {exitCode}). Letzte Meldung: {lastLine ?? "–"}");
                    return;
                }
                Set(PluginRunState.Crashed, $"Beendet mit Exit-Code {exitCode} – Neustart in {delay.TotalSeconds:0} s. Letzte Meldung: {lastLine ?? "–"}");
                try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { return; }
                delay = ranFor > TimeSpan.FromMinutes(1) ? TimeSpan.FromSeconds(1) : TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 30));
            }
        }

        private async Task<int> RunOnceAsync(CancellationToken ct)
        {
            var psi = new ProcessStartInfo(owner.NodeExecutable)
            {
                WorkingDirectory = dir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            // TypeScript direkt ausfuehren (Node >= 22.6 "type stripping") ohne Warnrauschen im Log.
            psi.ArgumentList.Add("--disable-warning=ExperimentalWarning");
            psi.ArgumentList.Add(entry);
            psi.Environment["DECK_URL"] = owner._serverUrl;
            psi.Environment["DECK_KEY"] = owner.PluginKey;
            psi.Environment["DECK_PLUGIN_ID"] = id;
            psi.Environment["DECK_PLUGIN_DIR"] = dir;

            using var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, e) => Append(e.Data);
            process.ErrorDataReceived += (_, e) => Append(e.Data);
            process.Start();
            // Windows: Plugin endet automatisch mit dem Dienst, auch bei Absturz (Job-Objekt).
            if (OperatingSystem.IsWindows()) ChildProcessJob.Assign(process);
            _process = process;
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            Set(PluginRunState.Running, null);
            owner.Log.LogInformation("Plugin-Prozess gestartet: {Name} (PID {Pid})", name, process.Id);

            try { await process.WaitForExitAsync(ct); }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { }
                throw;
            }
            return process.ExitCode;
        }

        private void Append(string? line)
        {
            if (line is null) return;
            _log.Enqueue($"{DateTime.Now:HH:mm:ss} {line}");
            while (_log.Count > LogLines) _log.TryDequeue(out _);
        }

        private void Set(PluginRunState state, string? message)
        {
            _state = state;
            _message = message;
            if (message is not null) Append($"[System] {message}");
            owner.RaiseChanged();
        }
    }
}
