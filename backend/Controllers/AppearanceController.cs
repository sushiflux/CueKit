using Deck.Server.Auth;
using Deck.Server.Hubs;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Deck.Server.Controllers;

public record AppearanceDto(string PressBehavior, string VolumeIndicator, string Plate, string StateStyle, bool DisplayMesh, string[] SushiFluxColors);

public record AppearanceInput(string PressBehavior, string VolumeIndicator, string? Plate, string? StateStyle = null, bool? DisplayMesh = null, string[]? SushiFluxColors = null);

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
    private static readonly HashSet<string> ValidVolumeIndicators = ["led", "level", "corner", "glow", "none"];
    private static readonly HashSet<string> ValidStateStyles = ["fill", "glow", "corner", "led", "level", "icon"];

    [HttpGet]
    public AppearanceDto Get() => ToDto();

    private AppearanceDto ToDto() =>
        new(settings.AppearancePressBehavior, settings.AppearanceVolumeIndicator, settings.AppearancePlate, settings.AppearanceStateStyle, settings.AppearanceDisplayMesh, settings.AppearanceSushiFluxColors.Split(','));

    [HttpPut]
    [Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> Save(AppearanceInput input, CancellationToken ct)
    {
        if (input.PressBehavior is null || !ValidPressBehaviors.Contains(input.PressBehavior))
            return BadRequest(new { error = "Ungültiges Tastendruckverhalten – erlaubt sind „spring“ oder „stay“." });
        if (input.VolumeIndicator is not null && !ValidVolumeIndicators.Contains(input.VolumeIndicator))
            return BadRequest(new { error = "Ungültige Lautstärkeanzeige." });

        // Zustandsdarstellung
        var stateStyle = input.StateStyle ?? settings.AppearanceStateStyle;
        if (!ValidStateStyles.Contains(stateStyle))
            return BadRequest(new { error = "Ungültige Zustandsdarstellung." });

        // Es bleibt immer ein Gehaeuse gewaehlt (Fallback: house:studiopro).
        var plate = string.IsNullOrWhiteSpace(input.Plate) ? "house:studiopro" : input.Plate.Trim();
        if (!plate.StartsWith("house:", StringComparison.Ordinal))
            return BadRequest(new { error = "Ungültige Gehäuse-Plate." });

        var displayMesh = input.DisplayMesh ?? settings.AppearanceDisplayMesh;

        await settings.SetManyAsync(new Dictionary<string, string>
        {
            [SettingKeys.AppearancePressBehavior] = input.PressBehavior,
            [SettingKeys.AppearanceVolumeIndicator] = input.VolumeIndicator ?? settings.AppearanceVolumeIndicator,
            [SettingKeys.AppearancePlate] = plate,
            [SettingKeys.AppearanceStateStyle] = stateStyle,
            [SettingKeys.AppearanceDisplayMesh] = displayMesh ? "true" : "false",
            [SettingKeys.AppearanceSushiFluxColors] = input.SushiFluxColors is not null ? string.Join(",", input.SushiFluxColors) : settings.AppearanceSushiFluxColors,
        }, ct);

        notifier.AppearanceChanged();
        return Ok(ToDto());
    }
}
