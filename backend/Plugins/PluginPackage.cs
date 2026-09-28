using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Deck.Server.Plugins;

public class PluginPackageException(string message) : Exception(message);

/// <summary>Inhalt von manifest.json eines Plugin-Pakets.</summary>
public record PluginManifest(
    string Id,
    string Name,
    string Version,
    string? Author,
    string? Description,
    string? Icon,
    string Entry,
    string? Runtime,
    string? Homepage);

/// <summary>
/// Prueft und entpackt ein Plugin-ZIP. Bewusst streng, weil die Datei aus beliebiger Quelle stammen
/// kann: keine Pfade ausserhalb des Zielordners (Zip-Slip), Obergrenzen fuer Dateianzahl und
/// entpackte Groesse (Zip-Bombe), Pflicht-Manifest mit gueltiger ID und vorhandener Startdatei.
/// </summary>
public static partial class PluginPackage
{
    public const long MaxZipBytes = 25 * 1024 * 1024;
    private const long MaxExtractedBytes = 150 * 1024 * 1024;
    private const int MaxEntries = 5000;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [GeneratedRegex("^[a-z0-9][a-z0-9.-]{2,63}$")]
    private static partial Regex IdPattern();

    [GeneratedRegex(@"^\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.-]+)?$")]
    private static partial Regex VersionPattern();

    /// <summary>Entpackt nach <paramref name="targetDir"/> (muss leer/neu sein) und liefert das Manifest.</summary>
    public static PluginManifest Extract(string zipPath, string targetDir)
    {
        using var zip = OpenZip(zipPath);
        if (zip.Entries.Count > MaxEntries) throw new PluginPackageException($"Das Paket enthält zu viele Dateien (max. {MaxEntries}).");

        // Viele Autoren zippen den Plugin-Ordner selbst - dann liegt alles unter genau einem Unterordner.
        var prefix = CommonRootFolder(zip);
        var manifestEntry = zip.GetEntry(prefix + "manifest.json")
                            ?? throw new PluginPackageException("Im Paket fehlt die Datei manifest.json – ist das wirklich ein Baton-Plugin?");
        var manifest = ReadManifest(manifestEntry);

        var root = Path.GetFullPath(targetDir) + Path.DirectorySeparatorChar;
        long total = 0;
        foreach (var entry in zip.Entries)
        {
            if (!entry.FullName.StartsWith(prefix, StringComparison.Ordinal)) continue;
            var relative = entry.FullName[prefix.Length..];
            if (relative.Length == 0) continue;

            var destination = Path.GetFullPath(Path.Combine(root, relative));
            if (!destination.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new PluginPackageException($"Ungültiger Pfad im Paket: „{entry.FullName}“.");

            if (entry.FullName.EndsWith('/'))
            {
                Directory.CreateDirectory(destination);
                continue;
            }

            total += entry.Length;
            if (total > MaxExtractedBytes) throw new PluginPackageException("Das Paket ist entpackt zu groß (max. 150 MB).");
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            entry.ExtractToFile(destination, overwrite: false);
        }

        var entryFile = Path.GetFullPath(Path.Combine(root, manifest.Entry));
        if (!entryFile.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(entryFile))
            throw new PluginPackageException($"Die Startdatei „{manifest.Entry}“ aus manifest.json fehlt im Paket.");
        return manifest;
    }

    /// <summary>Liest nur das Manifest (z.B. fuer eine Vorschau), ohne zu entpacken.</summary>
    public static PluginManifest Inspect(string zipPath)
    {
        using var zip = OpenZip(zipPath);
        var entry = zip.GetEntry(CommonRootFolder(zip) + "manifest.json")
                    ?? throw new PluginPackageException("Im Paket fehlt die Datei manifest.json – ist das wirklich ein Baton-Plugin?");
        return ReadManifest(entry);
    }

    private static ZipArchive OpenZip(string path)
    {
        try { return ZipFile.OpenRead(path); }
        catch (InvalidDataException) { throw new PluginPackageException("Die Datei ist kein gültiges ZIP-Archiv."); }
    }

    private static string CommonRootFolder(ZipArchive zip)
    {
        if (zip.GetEntry("manifest.json") is not null) return "";
        var firstSegments = zip.Entries.Select(e => e.FullName.Split('/')[0]).Distinct().ToList();
        return firstSegments.Count == 1 && zip.Entries.Any(e => e.FullName.Contains('/')) ? firstSegments[0] + "/" : "";
    }

    private static PluginManifest ReadManifest(ZipArchiveEntry entry)
    {
        if (entry.Length > 64 * 1024) throw new PluginPackageException("manifest.json ist zu groß.");
        PluginManifest? m;
        try
        {
            using var stream = entry.Open();
            m = JsonSerializer.Deserialize<PluginManifest>(stream, Json);
        }
        catch (JsonException ex)
        {
            throw new PluginPackageException($"manifest.json ist kein gültiges JSON: {ex.Message}");
        }

        if (m is null) throw new PluginPackageException("manifest.json ist leer.");
        if (string.IsNullOrWhiteSpace(m.Id) || !IdPattern().IsMatch(m.Id))
            throw new PluginPackageException("manifest.json: „id“ fehlt oder ist ungültig (erlaubt: a-z, 0-9, '.', '-', z.B. „com.example.photoshop“).");
        if (string.IsNullOrWhiteSpace(m.Name)) throw new PluginPackageException("manifest.json: „name“ fehlt.");
        if (string.IsNullOrWhiteSpace(m.Version) || !VersionPattern().IsMatch(m.Version))
            throw new PluginPackageException("manifest.json: „version“ fehlt oder ist ungültig (z.B. „1.0.0“).");
        if (string.IsNullOrWhiteSpace(m.Entry) || Path.IsPathRooted(m.Entry) || !(m.Entry.EndsWith(".js") || m.Entry.EndsWith(".mjs") || m.Entry.EndsWith(".cjs") || m.Entry.EndsWith(".ts")))
            throw new PluginPackageException("manifest.json: „entry“ muss eine relative .js-/.mjs-/.ts-Datei sein, z.B. „index.js“.");
        if (m.Runtime is { Length: > 0 } rt && rt != "node")
            throw new PluginPackageException($"Laufzeit „{rt}“ wird nicht unterstützt – Baton-Plugins laufen mit Node.js (JavaScript/TypeScript).");

        return m with
        {
            Name = Limit(m.Name, 60)!,
            Version = Limit(m.Version, 30)!,
            Author = Limit(m.Author, 60),
            Description = Limit(m.Description, 300),
            Icon = Limit(m.Icon, 120),
            Homepage = Limit(m.Homepage, 300),
        };
    }

    private static string? Limit(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim().Length > max ? s.Trim()[..max] : s.Trim();
}
