using System.Collections.Concurrent;
using System.Net;
using Deck.Server.Services;

namespace Deck.Server.Auth;

/// <summary>
/// Kurzlebige Einmal-Kopplungscodes (5 Minuten). Ein Besitzer-Geraet erzeugt einen Code, der als
/// QR-Code angezeigt wird; das Handy scannt ihn und tauscht ihn gegen ein dauerhaftes Geraete-Token.
/// </summary>
public class PairingService
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, DateTimeOffset> _codes = new();

    public (string Code, DateTimeOffset ExpiresAt) Create()
    {
        Cleanup();
        var code = TokenUtil.NewPairingCode();
        var expires = DateTimeOffset.UtcNow.Add(Lifetime);
        _codes[code] = expires;
        return (code, expires);
    }

    /// <summary>Loest den Code ein (genau einmal gueltig).</summary>
    public bool TryRedeem(string code)
    {
        Cleanup();
        var normalized = code.Trim().ToUpperInvariant().Replace("-", "").Replace(" ", "");
        return _codes.TryRemove(normalized, out var expires) && expires > DateTimeOffset.UtcNow;
    }

    private void Cleanup()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var (code, expires) in _codes)
            if (expires <= now) _codes.TryRemove(code, out _);
    }
}

/// <summary>
/// Wer darf das allererste (Besitzer-)Geraet einrichten? Nur Anfragen vom PC selbst (Loopback) -
/// bzw. im Docker-Dev-Stack zusaetzlich aus dem per Konfiguration freigegebenen Docker-Netz, da
/// Anfragen vom Host dort ueber das Bridge-Gateway statt ueber 127.0.0.1 ankommen.
/// </summary>
public class BootstrapPolicy(IConfiguration config)
{
    private readonly IReadOnlyList<(IPAddress Network, int Prefix)> _extraNetworks =
        (config["Deck:BootstrapAllowedNetworks"] ?? "")
            .Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(ParseCidr).Where(x => x is not null).Select(x => x!.Value).ToList();

    public bool IsAllowed(IPAddress? remote)
    {
        if (remote is null) return false;
        if (remote.IsIPv4MappedToIPv6) remote = remote.MapToIPv4();
        if (IPAddress.IsLoopback(remote)) return true;
        return _extraNetworks.Any(n => new IPNetwork(n.Network, n.Prefix).Contains(remote));
    }

    private static (IPAddress, int)? ParseCidr(string s)
    {
        var parts = s.Split('/');
        return parts.Length == 2 && IPAddress.TryParse(parts[0], out var ip) && int.TryParse(parts[1], out var p) ? (ip, p) : null;
    }
}
