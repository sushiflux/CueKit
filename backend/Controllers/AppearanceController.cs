using System.Text.RegularExpressions;
using Deck.Server.Auth;
using Deck.Server.Hubs;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Deck.Server.Controllers;

public record AppearanceBackgroundDto(
    string Kind, string Solid, string GradientFrom, string GradientTo, int GradientAngle,
    string Preset, string? ImageUrl, int ImageX, int ImageY, int ImageZoom);

public record AppearanceDto(string PressBehavior, string VolumeIndicator, AppearanceBackgroundDto Background);

public record AppearanceBackgroundInput(
    string Kind, string? Solid, string? GradientFrom, string? GradientTo, int GradientAngle,
    string? Preset, int ImageX, int ImageY, int ImageZoom);

public record AppearanceInput(string PressBehavior, string VolumeIndicator, AppearanceBackgroundInput Background);

/// <summary>
/// App-weite (nicht Pro-Deck) Aussehen-Einstellungen: Tastendruckverhalten, Lautstaerkeanzeige und
/// Deck-Hintergrundflaeche. Lesen darf jedes gekoppelte Geraet, Aendern bleibt wie die uebrigen
/// Einstellungen dem Besitzer vorbehalten.
/// </summary>
[ApiController]
[Route("api/settings/appearance")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public partial class AppearanceController(SettingsService settings, DataPaths paths, HubNotifier notifier) : ControllerBase
{
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColorPattern();

    private static readonly HashSet<string> ValidPressBehaviors = ["spring", "stay"];
    private static readonly HashSet<string> ValidVolumeIndicators = ["led", "level"];
    private static readonly HashSet<string> ValidBackgroundKinds = ["solid", "gradient", "preset", "image"];

    [HttpGet]
    public AppearanceDto Get() => ToDto();

    internal static string? ImageUrl(SettingsService settings, DataPaths paths)
    {
        var relative = settings.Get(SettingKeys.AppearanceBackgroundImagePath);
        if (string.IsNullOrEmpty(relative)) return null;
        var full = Path.Combine(paths.DataDir, relative);
        // Cache-Busting per Query-Parameter statt kurzer Cache-Header, da sich das Bild aendern kann,
        // aber selten - "LastWriteTimeUtc" reicht als Versionsstempel und bleibt stabil, solange die
        // Datei unveraendert ist (kein staendig wechselnder Wert wie bei "jetzt").
        var stamp = System.IO.File.Exists(full) ? System.IO.File.GetLastWriteTimeUtc(full).Ticks : 0;
        return $"/api/settings/appearance/background-image?v={stamp}";
    }

    private AppearanceDto ToDto()
    {
        var background = new AppearanceBackgroundDto(
            settings.AppearanceBackgroundKind,
            settings.Get(SettingKeys.AppearanceBackgroundSolid) is { Length: > 0 } s ? s : "#12151c",
            settings.Get(SettingKeys.AppearanceBackgroundGradientFrom) is { Length: > 0 } gf ? gf : "#12151c",
            settings.Get(SettingKeys.AppearanceBackgroundGradientTo) is { Length: > 0 } gt ? gt : "#2a3140",
            int.TryParse(settings.Get(SettingKeys.AppearanceBackgroundGradientAngle), out var angle) ? angle : 135,
            settings.Get(SettingKeys.AppearanceBackgroundPreset) ?? "",
            ImageUrl(settings, paths),
            int.TryParse(settings.Get(SettingKeys.AppearanceBackgroundImageX), out var x) ? x : 50,
            int.TryParse(settings.Get(SettingKeys.AppearanceBackgroundImageY), out var y) ? y : 50,
            int.TryParse(settings.Get(SettingKeys.AppearanceBackgroundImageZoom), out var zoom) ? zoom : 100);
        return new AppearanceDto(settings.AppearancePressBehavior, settings.AppearanceVolumeIndicator, background);
    }

    [HttpPut]
    [Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> Save(AppearanceInput input, CancellationToken ct)
    {
        if (input.PressBehavior is null || !ValidPressBehaviors.Contains(input.PressBehavior))
            return BadRequest(new { error = "Ungültiges Tastendruckverhalten – erlaubt sind „spring“ oder „stay“." });
        if (input.VolumeIndicator is null || !ValidVolumeIndicators.Contains(input.VolumeIndicator))
            return BadRequest(new { error = "Ungültige Lautstärkeanzeige – erlaubt sind „led“ oder „level“." });

        var bg = input.Background;
        if (bg is null || string.IsNullOrEmpty(bg.Kind) || !ValidBackgroundKinds.Contains(bg.Kind))
            return BadRequest(new { error = "Ungültige Hintergrundart – erlaubt sind „solid“, „gradient“, „preset“ oder „image“." });

        var solid = bg.Solid ?? "#12151c";
        if (!HexColorPattern().IsMatch(solid))
            return BadRequest(new { error = $"„{solid}“ ist keine gültige Hex-Farbe (Format #rrggbb)." });

        var gradientFrom = bg.GradientFrom ?? "#12151c";
        if (!HexColorPattern().IsMatch(gradientFrom))
            return BadRequest(new { error = $"„{gradientFrom}“ ist keine gültige Hex-Farbe (Format #rrggbb)." });

        var gradientTo = bg.GradientTo ?? "#2a3140";
        if (!HexColorPattern().IsMatch(gradientTo))
            return BadRequest(new { error = $"„{gradientTo}“ ist keine gültige Hex-Farbe (Format #rrggbb)." });

        if (bg.GradientAngle is < 0 or > 360)
            return BadRequest(new { error = "Der Winkel muss zwischen 0 und 360 liegen." });

        if (bg.Kind == "preset" && string.IsNullOrWhiteSpace(bg.Preset))
            return BadRequest(new { error = "Bitte ein Hintergrundmuster auswählen." });

        if (bg.Kind == "image" && string.IsNullOrEmpty(settings.Get(SettingKeys.AppearanceBackgroundImagePath)))
            return BadRequest(new { error = "Es wurde noch kein Hintergrundbild hochgeladen." });

        if (bg.ImageX is < 0 or > 100) return BadRequest(new { error = "Die horizontale Bildposition muss zwischen 0 und 100 liegen." });
        if (bg.ImageY is < 0 or > 100) return BadRequest(new { error = "Die vertikale Bildposition muss zwischen 0 und 100 liegen." });
        if (bg.ImageZoom is < 100 or > 400) return BadRequest(new { error = "Der Zoom muss zwischen 100 und 400 liegen." });

        await settings.SetAsync(SettingKeys.AppearancePressBehavior, input.PressBehavior, ct);
        await settings.SetAsync(SettingKeys.AppearanceVolumeIndicator, input.VolumeIndicator, ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundKind, bg.Kind, ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundSolid, solid, ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundGradientFrom, gradientFrom, ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundGradientTo, gradientTo, ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundGradientAngle, bg.GradientAngle.ToString(), ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundPreset, bg.Preset?.Trim() ?? "", ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundImageX, bg.ImageX.ToString(), ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundImageY, bg.ImageY.ToString(), ct);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundImageZoom, bg.ImageZoom.ToString(), ct);

        notifier.AppearanceChanged();
        return Ok(ToDto());
    }
}

/// <summary>
/// Eigener, kleiner Controller fuer das Hintergrundbild-Datei-Handling (Upload/Ausliefern/Loeschen) -
/// getrennt von <see cref="AppearanceController"/> wegen des abweichenden multipart-Content-Type und
/// weil das Ausliefern (GET) bewusst nicht am JSON-Format der uebrigen Einstellungen haengt.
/// </summary>
[ApiController]
[Route("api/settings/appearance/background-image")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class AppearanceImageController(SettingsService settings, DataPaths paths, HubNotifier notifier) : ControllerBase
{
    public const long MaxImageBytes = 8 * 1024 * 1024;

    // Erkannter Dateityp anhand der tatsächlichen Datei-Signatur (Magic Bytes) - nie dem vom Client
    // gemeldeten Content-Type/Dateinamen vertrauen. Reihenfolge relevant: WebP beginnt wie ein
    // generisches RIFF-Container, daher zusätzlich auf "WEBP" ab Offset 8 prüfen.
    private static (string Ext, string ContentType)? DetectImageType(byte[] head)
    {
        if (head.Length >= 8 && head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E && head[3] == 0x47
            && head[4] == 0x0D && head[5] == 0x0A && head[6] == 0x1A && head[7] == 0x0A)
            return ("png", "image/png");
        if (head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF)
            return ("jpg", "image/jpeg");
        if (head.Length >= 12 && head[0] == 0x52 && head[1] == 0x49 && head[2] == 0x46 && head[3] == 0x46
            && head[8] == 0x57 && head[9] == 0x45 && head[10] == 0x42 && head[11] == 0x50)
            return ("webp", "image/webp");
        return null;
    }

    /// <summary>Liefert das gespeicherte Hintergrundbild aus. Lange Cache-Header sind unproblematisch,
    /// weil der Aufrufer die URL mit einem "v"-Zeitstempel versieht (siehe AppearanceController.ImageUrl) -
    /// aendert sich das Bild, aendert sich auch die URL, ein alter gecachter Eintrag wird nie zurueckgegeben.</summary>
    [HttpGet]
    public IActionResult GetImage()
    {
        var relative = settings.Get(SettingKeys.AppearanceBackgroundImagePath);
        if (string.IsNullOrEmpty(relative)) return NotFound(new { error = "Es ist kein Hintergrundbild hinterlegt." });
        var full = Path.Combine(paths.DataDir, relative);
        if (!System.IO.File.Exists(full)) return NotFound(new { error = "Das hinterlegte Hintergrundbild wurde nicht gefunden." });
        var contentType = Path.GetExtension(full).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg",
        };
        Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return PhysicalFile(full, contentType);
    }

    [HttpPost]
    [Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
    [RequestSizeLimit(MaxImageBytes + 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Keine Datei empfangen." });
        if (file.Length > MaxImageBytes) return BadRequest(new { error = "Das Bild ist zu groß (max. 8 MB)." });

        byte[] head;
        await using (var stream = file.OpenReadStream())
        {
            head = new byte[Math.Min(16, (int)file.Length)];
            var read = 0;
            while (read < head.Length)
            {
                var n = await stream.ReadAsync(head.AsMemory(read, head.Length - read), ct);
                if (n == 0) break;
                read += n;
            }
        }

        var detected = DetectImageType(head);
        if (detected is null)
            return BadRequest(new { error = "Die Datei ist kein unterstütztes Bildformat (erkannt werden PNG, JPEG und WebP anhand des Dateiinhalts, nicht der Endung)." });

        Directory.CreateDirectory(paths.AppearanceDir);

        // Fester, selbst vergebener Dateiname (nie der vom Client gemeldete) - kein Pfad-Traversal-Risiko.
        // Alte Datei mit evtl. anderer Endung zuerst entfernen, damit nicht zwei Versionen liegen bleiben.
        foreach (var old in Directory.EnumerateFiles(paths.AppearanceDir, "background.*"))
        {
            try { System.IO.File.Delete(old); } catch { }
        }

        var fileName = $"background.{detected.Value.Ext}";
        var destination = Path.Combine(paths.AppearanceDir, fileName);
        await using (var outStream = System.IO.File.Create(destination))
        {
            await using var inStream = file.OpenReadStream();
            await inStream.CopyToAsync(outStream, ct);
        }

        var relative = Path.Combine("appearance", fileName);
        await settings.SetAsync(SettingKeys.AppearanceBackgroundImagePath, relative, ct);
        notifier.AppearanceChanged();

        return Ok(new { imageUrl = AppearanceController.ImageUrl(settings, paths) });
    }

    [HttpDelete]
    [Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> DeleteImage(CancellationToken ct)
    {
        var relative = settings.Get(SettingKeys.AppearanceBackgroundImagePath);
        if (!string.IsNullOrEmpty(relative))
        {
            var full = Path.Combine(paths.DataDir, relative);
            try { if (System.IO.File.Exists(full)) System.IO.File.Delete(full); } catch { }
        }
        await settings.SetAsync(SettingKeys.AppearanceBackgroundImagePath, "", ct);

        // Kein haengender Zustand: war "image" gerade aktiv, faellt die Quelle automatisch auf "solid" zurueck.
        if (settings.AppearanceBackgroundKind == "image")
            await settings.SetAsync(SettingKeys.AppearanceBackgroundKind, "solid", ct);

        notifier.AppearanceChanged();
        return NoContent();
    }
}
