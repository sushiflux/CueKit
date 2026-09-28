using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Deck.Server.Controllers;

[ApiController]
[Route("api")]
public class SystemController(AppInfo app) : ControllerBase
{
    [HttpGet("version")]
    public object Version() => new { version = app.Version };

    [HttpGet("health")]
    public object Health() => new { status = "ok" };

    [HttpGet("info")]
    public object Info() => new { version = app.Version, branding = app.Brand };

    /// <summary>PWA-Manifest aus branding.json - "Zum Startbildschirm hinzufuegen" startet dann randlos im Vollbild.</summary>
    [HttpGet("/manifest.webmanifest")]
    public IActionResult Manifest() => new JsonResult(new
    {
        name = app.Brand.ProductName,
        short_name = app.Brand.ProductName,
        description = app.Brand.Tagline,
        start_url = "/",
        display = "fullscreen",
        orientation = "any",
        background_color = "#0b0d12",
        theme_color = "#0b0d12",
        icons = new[] { new { src = "/logo.svg", sizes = "any", type = "image/svg+xml", purpose = "any" } },
    }) { ContentType = "application/manifest+json" };
}

[ApiController]
[Route("api")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class CatalogController(PluginHost plugins) : ControllerBase
{
    /// <summary>Alles, was der Editor fuer Formulare braucht: Aktionen (inkl. Plugins), Ausloeser, Bedingungen.</summary>
    [HttpGet("catalog")]
    public object Catalog() => new
    {
        actions = ActionCatalog.BuiltIn.Concat(plugins.ActionDefinitions),
        triggers = AutomationCatalog.Triggers,
        conditions = AutomationCatalog.Conditions,
    };
}

[ApiController]
[Route("api/settings")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
public class SettingsController(SettingsService settings, ObsService obs, PluginHost plugins) : ControllerBase
{
    [HttpGet("obs")]
    public object GetObs() => new
    {
        host = settings.ObsHost,
        port = settings.ObsPort,
        hasPassword = settings.HasObsPassword,
        status = obs.State.Status,
        error = obs.State.Error,
        obsVersion = obs.State.ObsVersion,
    };

    [HttpPut("obs")]
    public async Task<IActionResult> SaveObs(ObsSettingsInput input)
    {
        var host = input.Host.Trim();
        if (host.Contains('/') || host.Contains(' '))
            return BadRequest(new { error = "Bitte nur den Rechnernamen oder die IP eintragen (z.B. 127.0.0.1), ohne ws:// und ohne Pfad." });

        await settings.SetAsync(SettingKeys.ObsHost, host);
        await settings.SetAsync(SettingKeys.ObsPort, input.Port.ToString());
        if (input.ClearPassword) await settings.SetObsPasswordAsync(null);
        else if (!string.IsNullOrEmpty(input.Password)) await settings.SetObsPasswordAsync(input.Password);
        obs.Reconnect();
        return NoContent();
    }

    [HttpPost("obs/reconnect")]
    public IActionResult Reconnect()
    {
        obs.Reconnect();
        return NoContent();
    }

    [HttpGet("general")]
    public object GetGeneral() => new
    {
        publicHost = settings.Get(SettingKeys.PublicHost) ?? "",
        previewFps = settings.PreviewFps,
        lanAddresses = NetworkInfo.LanAddresses(),
    };

    [HttpPut("general")]
    public async Task<IActionResult> SaveGeneral(GeneralSettingsInput input)
    {
        await settings.SetAsync(SettingKeys.PublicHost, input.PublicHost?.Trim() ?? "");
        await settings.SetAsync(SettingKeys.PreviewFps, input.PreviewFps.ToString());
        return NoContent();
    }

    [HttpGet("plugins")]
    public object GetPlugins()
    {
        var baseUrl = $"ws://{Request.Host}";
        return new { plugins = plugins.Plugins, connectUrl = $"{baseUrl}/plugins", key = settings.Get(SettingKeys.PluginKey) };
    }

    [HttpPost("plugins/rotate-key")]
    public async Task<object> RotatePluginKey()
    {
        var key = TokenUtil.NewToken(24);
        await settings.SetAsync(SettingKeys.PluginKey, key);
        return new { key };
    }
}
