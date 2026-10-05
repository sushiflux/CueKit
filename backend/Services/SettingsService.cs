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
    // Twitch: die Client-ID ist oeffentlich (Anwendungstyp "Public", es gibt kein Client-Secret); Token liegen verschluesselt.
    public const string TwitchClientId = "twitch.clientId";
    public const string TwitchAccessToken = "twitch.accessToken";       // verschluesselt (DataProtection)
    public const string TwitchRefreshToken = "twitch.refreshToken";     // verschluesselt (DataProtection)
    public const string TwitchTokenExpiresAt = "twitch.tokenExpiresAt"; // ISO-8601 (UTC)
    public const string TwitchUserId = "twitch.userId";
    public const string TwitchLogin = "twitch.login";
    // Was von Twitch im oberen OLED angezeigt wird (jeweils einzeln abschaltbar, Standard: an).
    public const string TwitchShowViewers = "twitch.show.viewers";
    public const string TwitchShowSubs = "twitch.show.subs";
    public const string TwitchShowCategory = "twitch.show.category";
    public const string TwitchShowTitle = "twitch.show.title";
    public const string PluginKey = "plugins.key";             // Schluessel fuer lokale Plugin-Prozesse
    public const string PublicHost = "network.publicHost";     // optionaler Override fuer QR-Code-URLs

    // Aussehen (app-weit, nicht pro Deck) - siehe AppearanceController.
    public const string AppearancePressBehavior = "appearance.pressBehavior";
    public const string AppearanceVolumeIndicator = "appearance.volumeIndicator";
    /// <summary>Zustandsdarstellung der Tasten: "fill" (Vollflaeche gruen/rot) oder "icon" (nur Symbol/Text farbig).</summary>
    public const string AppearanceStateStyle = "appearance.stateStyle";
    /// <summary>Gewaehlte Gehaeuse-Plate-Fassung um das Tastenraster ("house:&lt;key&gt;", siehe
    /// frontend lib/housePlates.ts) - es bleibt immer ein Gehaeuse aktiv.</summary>
    public const string AppearancePlate = "appearance.plate";
    /// <summary>Optisches Subpixel-Mesh ueber alle Tasten (LCD CueDeck Matrix).</summary>
    public const string AppearanceDisplayMesh = "appearance.displayMesh";
    public const string AppearanceKeySurface = "appearance.keySurface";
    public const string AppearanceLedColors = "appearance.ledColors";
    public const string AppearanceLedSpeed = "appearance.ledSpeed";
    public const string AppearanceLedEffect = "appearance.ledEffect";
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
    private static readonly HashSet<string> ValidVolumeIndicators = ["led", "level", "corner", "glow", "none"];
    private static readonly HashSet<string> ValidStateStyles = ["fill", "glow", "corner", "led", "level", "icon"];

    /// <summary>Tastendruckverhalten global fuers ganze Deck - kein Pro-Taste-Override.</summary>
    public string AppearancePressBehavior => Get(SettingKeys.AppearancePressBehavior) is { } v && ValidPressBehaviors.Contains(v) ? v : "spring";

    /// <summary>Ob Lautstaerke-Tasten (Volume/Mute) ihren Zustand ueber die LED oder den Pegelbalken
    /// anzeigen - betrifft nur Tasten mit einem Lautstaerke-Bezug, siehe buttonLevel() im Frontend.</summary>
    public string AppearanceStateStyle => Get(SettingKeys.AppearanceStateStyle) is { } v && ValidStateStyles.Contains(v) ? v : "fill";

    public string AppearanceVolumeIndicator => Get(SettingKeys.AppearanceVolumeIndicator) is { } v && ValidVolumeIndicators.Contains(v) ? v : "led";

    /// <summary>Gewaehlte Gehaeuse-Plate ("house:&lt;key&gt;") - es bleibt immer ein Gehaeuse gewaehlt.</summary>
    public string AppearancePlate => Get(SettingKeys.AppearancePlate) is { Length: > 0 } p ? p : "house:studiopro";

    /// <summary>Optisches Subpixel-Mesh ueber alle Tasten (LCD CueDeck Look).</summary>
    public bool AppearanceDisplayMesh => Get(SettingKeys.AppearanceDisplayMesh) == "true";

    private static readonly HashSet<string> ValidKeySurfaces = ["smooth", "mesh", "oled"];

    /// <summary>Tastenoberflaeche: "smooth" (glatte Kappen), "mesh" (Subpixel-Matrix) oder "oled" (flache OLED-Displays, kein Tastenhub).
    /// Aeltere Staende kannten nur den Mesh-Schalter - dann wird daraus abgeleitet.</summary>
    public string AppearanceKeySurface => Get(SettingKeys.AppearanceKeySurface) is { } v && ValidKeySurfaces.Contains(v) ? v : (AppearanceDisplayMesh ? "mesh" : "smooth");

    public string AppearanceLedColors => Get(SettingKeys.AppearanceLedColors) ?? "#a78bfa,#f472b6,#7dd3fc";
    public int AppearanceLedSpeed => int.TryParse(Get(SettingKeys.AppearanceLedSpeed), out var s) ? s : 4;
    public string AppearanceLedEffect => Get(SettingKeys.AppearanceLedEffect) ?? "sweep";

    /// <summary>Verschluesselt einen sensiblen Wert fuers Speichern (DataProtection, Schluesselring des Dienstes).</summary>
    public string Protect(string plain) => _protector.Protect(plain);

    /// <summary>Entschluesselt einen mit <see cref="Protect"/> gespeicherten Wert; wirft, wenn der Schluesselring fehlt.</summary>
    public string Unprotect(string protectedValue) => _protector.Unprotect(protectedValue);

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
