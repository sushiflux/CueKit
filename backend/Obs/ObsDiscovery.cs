using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text.Json;
using Deck.Server.Services;

namespace Deck.Server.Obs;

public record ObsLocalConfig(bool ServerEnabled, int Port, bool AuthRequired, string? Password);

public record FoundObs(string Host, int Port, string? WebSocketVersion, bool IsLocal);

public record DiscoveryResult(bool Applied, string Message, IReadOnlyList<FoundObs> Found);

/// <summary>
/// Findet OBS ohne Eingabe: (1) liest die obs-websocket-Konfiguration von OBS auf diesem PC
/// (Port + Passwort), (2) sucht im lokalen Netz nach OBS-Instanzen auf dem Standardport.
/// Die Konfigurationsdatei gehoert dem selben Windows-Benutzer - Baton liest sie nur lokal und
/// uebernimmt das Passwort verschluesselt in die eigenen Einstellungen.
/// </summary>
public class ObsDiscovery(SettingsService settings, IConfiguration config, ILogger<ObsDiscovery> log)
{
    private const int DefaultPort = 4455;

    /// <summary>Bekannte Ablageorte von obs-websocket/config.json je Betriebssystem.</summary>
    private IEnumerable<string> ConfigCandidates()
    {
        if (config["Deck:ObsConfigPath"] is { Length: > 0 } configured) yield return configured;
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (appData.Length > 0) yield return Path.Combine(appData, "obs-studio", "plugin_config", "obs-websocket", "config.json");
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (home.Length > 0)
        {
            yield return Path.Combine(home, ".config", "obs-studio", "plugin_config", "obs-websocket", "config.json");
            yield return Path.Combine(home, "Library", "Application Support", "obs-studio", "plugin_config", "obs-websocket", "config.json");
        }
    }

    public ObsLocalConfig? ReadLocalConfig()
    {
        foreach (var path in ConfigCandidates())
        {
            try
            {
                if (!File.Exists(path)) continue;
                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                var r = doc.RootElement;
                return new ObsLocalConfig(
                    r.TryGetProperty("server_enabled", out var e) && e.ValueKind == JsonValueKind.True,
                    r.TryGetProperty("server_port", out var p) && p.TryGetInt32(out var port) ? port : DefaultPort,
                    r.TryGetProperty("auth_required", out var a) && a.ValueKind == JsonValueKind.True,
                    r.TryGetProperty("server_password", out var pw) && pw.ValueKind == JsonValueKind.String ? pw.GetString() : null);
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                log.LogDebug("OBS-Konfiguration {Path} nicht lesbar: {Message}", path, ex.Message);
            }
        }
        return null;
    }

    /// <summary>Uebernimmt die lokale OBS-Konfiguration, falls vorhanden. Liefert eine Meldung fuer den Nutzer.</summary>
    public async Task<(bool Applied, string Message)> ApplyLocalConfigAsync(CancellationToken ct = default)
    {
        var local = ReadLocalConfig();
        if (local is null)
            return (false, "Auf diesem PC wurde keine OBS-Installation gefunden (OBS ≥ 28 nötig).");
        if (!local.ServerEnabled)
            return (false, "OBS gefunden, aber der WebSocket-Server ist aus. In OBS: Werkzeuge > WebSocket-Server-Einstellungen > „WebSocket-Server aktivieren“ anhaken, dann erneut suchen.");

        await settings.SetAsync(SettingKeys.ObsHost, "127.0.0.1", ct);
        await settings.SetAsync(SettingKeys.ObsPort, local.Port.ToString(), ct);
        await settings.SetObsPasswordAsync(local.AuthRequired ? local.Password : null, ct);
        log.LogInformation("OBS-Verbindung automatisch aus der lokalen OBS-Konfiguration uebernommen (Port {Port}).", local.Port);
        return (true, $"OBS auf diesem PC gefunden (Port {local.Port}) – Verbindung wird hergestellt.");
    }

    /// <summary>Erster Start: noch nie etwas eingestellt -> stillschweigend automatisch einrichten.</summary>
    public async Task AutoConfigureOnFirstRunAsync(CancellationToken ct = default)
    {
        if (settings.Get(SettingKeys.ObsHost) is not null || settings.HasObsPassword) return;
        await ApplyLocalConfigAsync(ct);
    }

    public async Task<DiscoveryResult> DiscoverAsync(CancellationToken ct)
    {
        var (applied, message) = await ApplyLocalConfigAsync(ct);
        if (applied) return new DiscoveryResult(true, message, []);

        var found = await ScanNetworkAsync(ct);
        if (found.Count == 0)
            return new DiscoveryResult(false, $"{message} Im Netzwerk wurde ebenfalls kein OBS auf Port {DefaultPort} gefunden.", []);
        return new DiscoveryResult(false, $"{found.Count} OBS-Instanz(en) im Netzwerk gefunden – bitte auswählen und das WebSocket-Passwort dieses OBS eintragen.", found);
    }

    /// <summary>Prueft Port 4455 auf allen Adressen der eigenen /24-Netze und bestaetigt Treffer per obs-websocket-Hello.</summary>
    private async Task<List<FoundObs>> ScanNetworkAsync(CancellationToken ct)
    {
        var bases = NetworkInfo.LanAddresses().ToList();
        if (config["Deck:PublicHost"] is { Length: > 0 } publicHost) bases.Add(publicHost);

        var targets = new HashSet<string> { "127.0.0.1" };
        if (Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true") targets.Add("host.docker.internal");
        foreach (var ip in bases.Where(b => IPAddress.TryParse(b, out var a) && a.AddressFamily == AddressFamily.InterNetwork).Distinct())
        {
            var prefix = ip[..(ip.LastIndexOf('.') + 1)];
            for (var i = 1; i < 255; i++) targets.Add(prefix + i);
        }

        using var limiter = new SemaphoreSlim(64);
        var tasks = targets.Select(async host =>
        {
            await limiter.WaitAsync(ct);
            try { return await ProbeAsync(host, DefaultPort, ct); }
            finally { limiter.Release(); }
        });
        var results = (await Task.WhenAll(tasks)).Where(r => r is not null).Select(r => r!).ToList();

        // host.docker.internal und 127.0.0.1 meinen im Dev-Container denselben PC - nur einmal zeigen.
        return results
            .GroupBy(r => r.IsLocal ? "local" : r.Host)
            .Select(g => g.First())
            .OrderByDescending(r => r.IsLocal).ThenBy(r => r.Host)
            .ToList();
    }

    private static async Task<FoundObs?> ProbeAsync(string host, int port, CancellationToken ct)
    {
        try
        {
            using (var tcp = new TcpClient())
            {
                using var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                connectTimeout.CancelAfter(TimeSpan.FromMilliseconds(400));
                await tcp.ConnectAsync(host, port, connectTimeout.Token);
            }

            using var ws = new ClientWebSocket();
            ws.Options.AddSubProtocol("obswebsocket.json");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(2));
            await ws.ConnectAsync(new Uri($"ws://{host}:{port}"), timeout.Token);
            var buffer = new byte[8192];
            var result = await ws.ReceiveAsync(buffer, timeout.Token);
            using var hello = JsonDocument.Parse(buffer.AsMemory(0, result.Count));
            if (!hello.RootElement.TryGetProperty("op", out var op) || op.GetInt32() != 0) return null;
            var version = hello.RootElement.GetProperty("d").TryGetProperty("obsWebSocketVersion", out var v) ? v.GetString() : null;
            try { await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "probe", CancellationToken.None); } catch { }
            var isLocal = host is "127.0.0.1" or "host.docker.internal";
            return new FoundObs(isLocal ? "127.0.0.1" : host, port, version, isLocal);
        }
        catch
        {
            return null;
        }
    }
}
