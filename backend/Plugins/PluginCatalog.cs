using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Deck.Server.Plugins;

public record CatalogEntry(
    string Id,
    string Name,
    string Version,
    string? Author,
    string? Description,
    string? Icon,
    string DownloadUrl,
    string Sha256,
    string? Homepage);

public record CatalogIndex(IReadOnlyList<CatalogEntry> Plugins);

/// <summary>
/// Offizieller Plugin-Katalog der Produkt-Website: eine JSON-Liste (catalog.json) mit Download-Adresse
/// und SHA-256-Pruefsumme je Paket. Die Adresse steht in der Konfiguration (Deck:PluginCatalogUrl) -
/// solange die Website nicht existiert, ist sie leer und der Katalog meldet sich als nicht verfuegbar.
/// </summary>
public class PluginCatalog(IHttpClientFactory http, IConfiguration config, PluginManager manager, ILogger<PluginCatalog> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private CatalogIndex? _cache;
    private DateTimeOffset _cachedAt;

    public string? Url => config["Deck:PluginCatalogUrl"] is { Length: > 0 } u ? u : null;

    public async Task<CatalogIndex> GetAsync(bool refresh, CancellationToken ct)
    {
        if (Url is null) throw new InvalidOperationException("Der Plugin-Katalog ist noch nicht verfügbar – Plugins lassen sich bis dahin als ZIP-Datei installieren.");
        if (!refresh && _cache is not null && DateTimeOffset.UtcNow - _cachedAt < TimeSpan.FromMinutes(5)) return _cache;

        try
        {
            using var client = http.CreateClient("catalog");
            using var response = await client.GetAsync(Url, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > 2 * 1024 * 1024) throw new InvalidOperationException("Katalog-Datei ist zu groß.");
            var index = await response.Content.ReadFromJsonAsync<CatalogIndex>(Json, ct) ?? new CatalogIndex([]);
            _cache = index;
            _cachedAt = DateTimeOffset.UtcNow;
            return index;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            log.LogWarning("Plugin-Katalog nicht erreichbar: {Message}", ex.Message);
            throw new InvalidOperationException($"Der Plugin-Katalog ist gerade nicht erreichbar ({ex.Message}). Internetverbindung prüfen oder später erneut versuchen.");
        }
    }

    public async Task<Data.InstalledPluginEntity> InstallAsync(string id, CancellationToken ct)
    {
        var entry = (await GetAsync(refresh: false, ct)).Plugins.FirstOrDefault(p => p.Id == id)
                    ?? throw new InvalidOperationException($"Plugin „{id}“ steht nicht im Katalog.");
        if (!Uri.TryCreate(entry.DownloadUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            throw new InvalidOperationException("Ungültige Download-Adresse im Katalog.");

        var temp = Path.Combine(Path.GetTempPath(), $"deck-plugin-{Guid.NewGuid():N}.zip");
        try
        {
            using (var client = http.CreateClient("catalog"))
            using (var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, ct))
            {
                response.EnsureSuccessStatusCode();
                await using var source = await response.Content.ReadAsStreamAsync(ct);
                await using var file = File.Create(temp);
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await source.ReadAsync(buffer, ct)) > 0)
                {
                    total += read;
                    if (total > PluginPackage.MaxZipBytes) throw new InvalidOperationException("Das Plugin-Paket ist zu groß (max. 25 MB).");
                    await file.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }

            // Integritaet: Paket muss exakt dem entsprechen, was der Katalog ankuendigt.
            await using (var check = File.OpenRead(temp))
            {
                var hash = Convert.ToHexString(await SHA256.HashDataAsync(check, ct));
                if (!string.Equals(hash, entry.Sha256, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Die Prüfsumme des heruntergeladenen Pakets stimmt nicht – Installation abgebrochen.");
            }

            var manifest = PluginPackage.Inspect(temp);
            if (manifest.Id != entry.Id) throw new InvalidOperationException("Das Paket passt nicht zum Katalogeintrag (andere Plugin-ID).");
            return await manager.InstallAsync(temp, "catalog", ct);
        }
        catch (HttpRequestException ex)
        {
            throw new InvalidOperationException($"Download fehlgeschlagen: {ex.Message}");
        }
        finally
        {
            try { File.Delete(temp); } catch { }
        }
    }
}
