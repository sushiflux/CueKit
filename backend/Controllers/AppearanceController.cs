using Deck.Server.Auth;
using Deck.Server.Hubs;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Deck.Server.Controllers;

public record AppearanceDto(string PressBehavior, string VolumeIndicator, string Plate);

public record AppearanceInput(string PressBehavior, string VolumeIndicator, string? Plate);

/// <summary>
/// App-weite (nicht Pro-Deck) Aussehen-Einstellungen: Tastendruckverhalten, Lautstaerkeanzeige und
/// die gewaehlte Gehaeuse-Plate (Rahmen ums Tastenraster). Lesen darf jedes gekoppelte Geraet,
/// Aendern bleibt wie die uebrigen Einstellungen dem Besitzer vorbehalten.
/// </summary>
[ApiController]
[Route("api/settings/appearance")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class AppearanceController(SettingsService settings, HubNotifier notifier) : ControllerBase
{
    private static readonly HashSet<string> ValidPressBehaviors = ["spring", "stay"];
    private static readonly HashSet<string> ValidVolumeIndicators = ["led", "level"];

    [HttpGet]
    public AppearanceDto Get() => ToDto();

    private AppearanceDto ToDto() =>
        new(settings.AppearancePressBehavior, settings.AppearanceVolumeIndicator, settings.AppearancePlate);

    [HttpPut]
    [Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> Save(AppearanceInput input, CancellationToken ct)
    {
        if (input.PressBehavior is null || !ValidPressBehaviors.Contains(input.PressBehavior))
            return BadRequest(new { error = "Ungültiges Tastendruckverhalten – erlaubt sind „spring“ oder „stay“." });
        if (input.VolumeIndicator is null || !ValidVolumeIndicators.Contains(input.VolumeIndicator))
            return BadRequest(new { error = "Ungültige Lautstärkeanzeige – erlaubt sind „led“ oder „level“." });

        // Leerer Plate-Wert ist gueltig (= kein Gehaeuse, nur die normale App-Flaeche) - ein konkret
        // gewaehlter Wert muss aber dem "house:<key>"-Namensschema folgen, siehe frontend housePlates.ts.
        var plate = input.Plate?.Trim() ?? "";
        if (plate.Length > 0 && !plate.StartsWith("house:", StringComparison.Ordinal))
            return BadRequest(new { error = "Ungültige Gehäuse-Plate." });

        await settings.SetManyAsync(new Dictionary<string, string>
        {
            [SettingKeys.AppearancePressBehavior] = input.PressBehavior,
            [SettingKeys.AppearanceVolumeIndicator] = input.VolumeIndicator,
            [SettingKeys.AppearancePlate] = plate,
        }, ct);

        notifier.AppearanceChanged();
        return Ok(ToDto());
    }
}
