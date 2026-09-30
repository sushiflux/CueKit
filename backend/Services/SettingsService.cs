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

    // Aussehen (app-weit, nicht pro Deck) - siehe AppearanceController.
    public const string AppearancePressBehavior = "appearance.pressBehavior";
    public const string AppearanceVolumeIndicator = "appearance.volumeIndicator";
    /// <summary>Gewaehlte Gehaeuse-Plate-Fassung um das Tastenraster ("house:&lt;key&gt;", siehe
    /// frontend lib/housePlates.ts) oder leer fuer kein Gehaeuse.</summary>
    public const string AppearancePlate = "appearance.plate";
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

    private static readonly HashSet<string> ValidPressBehaviors = ["spring", "stay"];
    private static readonly HashSet<string> ValidVolumeIndicators = ["led", "level"];

    /// <summary>Tastendruckverhalten global fuers ganze Deck - kein Pro-Taste-Override.</summary>
    public string AppearancePressBehavior => Get(SettingKeys.AppearancePressBehavior) is { } v && ValidPressBehaviors.Contains(v) ? v : "spring";

    /// <summary>Ob Lautstaerke-Tasten (Volume/Mute) ihren Zustand ueber die LED oder den Pegelbalken
    /// anzeigen - betrifft nur Tasten mit einem Lautstaerke-Bezug, siehe buttonLevel() im Frontend.</summary>
    public string AppearanceVolumeIndicator => Get(SettingKeys.AppearanceVolumeIndicator) is { } v && ValidVolumeIndicators.Contains(v) ? v : "led";

    /// <summary>Gewaehlte Gehaeuse-Plate ("house:&lt;key&gt;") oder "" fuer kein Gehaeuse - keine
    /// serverseitige Preset-Liste noetig, das Frontend validiert nur das Namensschema (siehe
    /// AppearanceController.Save).</summary>
    public string AppearancePlate => Get(SettingKeys.AppearancePlate) ?? "";

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

    /// <summary>
    /// Mehrere Werte in EINEM Scope/EINER Transaktion speichern, statt SetAsync() wiederholt
    /// aufzurufen - jeder SetAsync()-Aufruf oeffnet eine eigene SQLite-Verbindung/Transaktion, was
    /// bei mehreren Werten hintereinander (z.B. den 11 Aussehen-Einstellungen) unnoetig viele
    /// Lock-Gelegenheiten auf derselben Datenbankdatei erzeugt und im Zusammenspiel mit dem
    /// SQLite-Default-Timeout (30s) zu spuerbaren Verzoegerungen fuehren kann.
    /// </summary>
    public async Task SetManyAsync(IReadOnlyDictionary<string, string> values, CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var keys = values.Keys.ToList();
        var existing = await db.Settings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, ct);
        foreach (var (key, value) in values)
        {
            if (existing.TryGetValue(key, out var entity)) entity.Value = value;
            else db.Settings.Add(new SettingEntity { Key = key, Value = value });
        }
        await db.SaveChangesAsync(ct);
        foreach (var (key, value) in values) _cache[key] = value;
        foreach (var key in values.Keys) Changed?.Invoke(key);
    }
}
