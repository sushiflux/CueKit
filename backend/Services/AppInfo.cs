using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;

namespace Deck.Server.Services;

/// <summary>Version (live aus version.txt, siehe post-commit-Hook) und Branding (aus branding.json).</summary>
public class AppInfo(IWebHostEnvironment env, IConfiguration config)
{
    public record Branding(string ProductName, string Tagline, string Company, string MadeIn);

    private Branding? _branding;

    /// <summary>vJahr.Monat.CommitDesJahres, im Development-Profil mit "-dev"-Suffix.</summary>
    public string Version
    {
        get
        {
            var raw = FindFile("version.txt") is { } path ? File.ReadAllText(path).Trim() : "";
            if (string.IsNullOrEmpty(raw)) raw = "v0.0.0";
            return env.IsDevelopment() ? $"{raw}-dev" : raw;
        }
    }

    public Branding Brand => _branding ??= LoadBranding();

    private Branding LoadBranding()
    {
        var path = FindFile("branding.json");
        if (path is not null)
        {
            var b = JsonSerializer.Deserialize<Branding>(File.ReadAllText(path), new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (b is not null) return b;
        }
        return new Branding("Deck", "", "", "");
    }

    /// <summary>Sucht im ContentRoot, eine Ebene darueber (Repo-Wurzel bzw. /branding.json im Container) und neben der EXE.</summary>
    private string? FindFile(string name)
    {
        string?[] candidates =
        [
            config[$"Deck:Files:{name}"],
            Path.Combine(env.ContentRootPath, name),
            Path.Combine(env.ContentRootPath, "..", name),
            Path.Combine(AppContext.BaseDirectory, name),
        ];
        return candidates.FirstOrDefault(p => p is not null && File.Exists(p));
    }
}

/// <summary>Ermittelt die Adresse, unter der Handys/Tablets im LAN den Dienst erreichen (fuer den QR-Code).</summary>
public class NetworkInfo(IConfiguration config, SettingsService settings)
{
    public string PublicBaseUrl(HttpRequest request)
    {
        var host = settings.Get(SettingKeys.PublicHost);
        if (string.IsNullOrWhiteSpace(host)) host = config["Deck:PublicHost"];
        if (string.IsNullOrWhiteSpace(host)) host = LanAddresses().FirstOrDefault() ?? request.Host.Host;

        var port = config["Deck:PublicPort"] is { Length: > 0 } p ? p : request.Host.Port?.ToString();
        return port is null or "80" ? $"http://{host}" : $"http://{host}:{port}";
    }

    /// <summary>IPv4-Adressen aktiver, physischer Netzwerkkarten (ohne Loopback/Docker/WSL/VPN-Adapter).</summary>
    public static IReadOnlyList<string> LanAddresses()
    {
        string[] virtualHints = ["vEthernet", "Docker", "WSL", "VirtualBox", "VMware", "Hyper-V", "Loopback", "TAP", "Tailscale", "ZeroTier"];
        return NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up
                        && n.NetworkInterfaceType is not NetworkInterfaceType.Loopback and not NetworkInterfaceType.Tunnel
                        && !virtualHints.Any(h => n.Name.Contains(h, StringComparison.OrdinalIgnoreCase) || n.Description.Contains(h, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(n => n.GetIPProperties().GatewayAddresses.Count > 0) // Adapter mit Gateway zuerst
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Select(a => a.Address)
            .Where(a => a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a) && !a.ToString().StartsWith("169.254."))
            .Select(a => a.ToString())
            .Distinct()
            .ToList();
    }
}
