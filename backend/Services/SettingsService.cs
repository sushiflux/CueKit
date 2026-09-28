using System.Collections.Concurrent;
using Deck.Server.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Services;

public static class SettingKeys
{
    public const string ObsHost = "obs.host";
    public const string ObsPort = "obs.port";
    public const string ObsPassword = "obs.password";          // verschluesselt (DataProtection)
    public const string PluginKey = "plugins.key";             // Schluessel fuer lokale Plugin-Prozesse
    public const string PublicHost = "network.publicHost";     // optionaler Override fuer QR-Code-URLs
    public const string PreviewFps = "preview.fps";
}

/// <summary>
/// Datenbank-gestuetzte Einstellungen mit In-Memory-Cache. Sensible Werte (OBS-Passwort) liegen
/// per ASP.NET-DataProtection verschluesselt in der Datenbank, nie im Klartext.
/// </summary>
public class SettingsService(IServiceScopeFactory scopes, IDataProtectionProvider dp, IConfiguration config)
{
    private readonly ConcurrentDictionary<string, string> _cache = new();
    private readonly IDataProtector _protector = dp.CreateProtector("Deck.Settings.v1");
    private bool _loaded;

    public event Action<string>? Changed;

    public async Task LoadAsync(CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var s in await db.Settings.AsNoTracking().ToListAsync(ct))
            _cache[s.Key] = s.Value;
        _loaded = true;

        // Plugin-Schluessel beim allerersten Start kryptographisch zufaellig erzeugen.
        if (!_cache.ContainsKey(SettingKeys.PluginKey))
            await SetAsync(SettingKeys.PluginKey, TokenUtil.NewToken(24), ct);
    }

    public string? Get(string key)
    {
        if (!_loaded) throw new InvalidOperationException("Einstellungen wurden noch nicht geladen.");
        return _cache.TryGetValue(key, out var v) ? v : null;
    }

    public string ObsHost => Get(SettingKeys.ObsHost) ?? config["Deck:ObsDefaultHost"] ?? "127.0.0.1";
    public int ObsPort => int.TryParse(Get(SettingKeys.ObsPort), out var p) ? p : 4455;
    public bool HasObsPassword => !string.IsNullOrEmpty(Get(SettingKeys.ObsPassword));
    public int PreviewFps => int.TryParse(Get(SettingKeys.PreviewFps), out var f) ? Math.Clamp(f, 1, 15) : 6;

    public string? ObsPassword
    {
        get
        {
            var enc = Get(SettingKeys.ObsPassword);
            if (string.IsNullOrEmpty(enc)) return null;
            try { return _protector.Unprotect(enc); }
            catch { return null; } // Schluesselring verloren -> Passwort muss neu eingegeben werden
        }
    }

    public Task SetObsPasswordAsync(string? password, CancellationToken ct = default) =>
        SetAsync(SettingKeys.ObsPassword, string.IsNullOrEmpty(password) ? "" : _protector.Protect(password), ct);

    public async Task SetAsync(string key, string value, CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.Settings.FindAsync([key], ct);
        if (existing is null) db.Settings.Add(new SettingEntity { Key = key, Value = value });
        else existing.Value = value;
        await db.SaveChangesAsync(ct);
        _cache[key] = value;
        Changed?.Invoke(key);
    }
}
