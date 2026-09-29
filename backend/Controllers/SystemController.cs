using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Hardware;
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
public class CatalogController(PluginHost plugins, Hotkeys.IGlobalHotkeys globalHotkeys) : ControllerBase
{
    /// <summary>Laufen Tastenkuerzel systemweit (Windows), und welche sind von anderen Programmen belegt?</summary>
    [HttpGet("hotkeys/status")]
    public Hotkeys.HotkeyStatus HotkeyStatus() => globalHotkeys.Status;

    /// <summary>Alles, was der Editor fuer Formulare braucht: Aktionen (inkl. Plugins), Ausloeser, Bedingungen.</summary>
    [HttpGet("catalog")]
    public object Catalog() => new
    {
        actions = ActionCatalog.BuiltIn.Concat(plugins.ActionDefinitions),
        triggers = AutomationCatalog.Triggers,
        conditions = AutomationCatalog.Conditions,
    };
}

/// <summary>Windows-Systemlautstaerke (Master, nicht OBS-Audio) + Live-Sensoren (CPU/GPU/RAM) - nur
/// nativ unter Windows verfuegbar, siehe Hardware/SystemVolumeService.cs und Hardware/SystemMonitorService.cs.
/// Systemweite Aenderungen bleiben Owner vorbehalten, wie die uebrigen Settings-Endpunkte.</summary>
[ApiController]
[Route("api/system")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
public class SystemHardwareController(ISystemVolume volume, ISystemMonitor monitor) : ControllerBase
{
    [HttpGet("volume")]
    public SystemVolumeStatus GetVolume() => volume.Status;

    [HttpPut("volume")]
    public IActionResult SetVolume(SystemVolumeInput input)
    {
        try { volume.SetPercent(input.Percent); }
        catch (InvalidOperationException ex) { return UnprocessableEntity(new { error = ex.Message }); }
        return Ok(volume.Status);
    }

    [HttpPost("volume/mute")]
    public IActionResult ToggleMute()
    {
        try { volume.ToggleMuted(); }
        catch (InvalidOperationException ex) { return UnprocessableEntity(new { error = ex.Message }); }
        return Ok(volume.Status);
    }

    /// <summary>Aktueller Sensor-Schnappschuss fuer den ersten Ladezustand einer Anzeige-Kachel -
    /// danach kommen laufende Werte per SignalR-Event "systemState" (siehe SystemMonitorBroadcaster).</summary>
    [HttpGet("monitor")]
    public SystemMonitorSnapshot GetMonitor()
    {
        monitor.Refresh();
        return monitor.Current;
    }
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
        // Typische Eingaben wie "ws://192.168.1.5:4455/" oder "localhost:4455" freundlich zerlegen,
        // statt eine ungueltige Adresse zu speichern.
        var host = input.Host.Trim();
        var port = input.Port;
        foreach (var scheme in new[] { "ws://", "wss://", "http://", "https://" })
            if (host.StartsWith(scheme, StringComparison.OrdinalIgnoreCase)) host = host[scheme.Length..];
        host = host.TrimEnd('/');
        if (host.StartsWith('[') && host.IndexOf("]:", StringComparison.Ordinal) is var close and > 0)
        {
            // IPv6 mit Port: [fe80::1]:4455
            if (int.TryParse(host[(close + 2)..], out var v6Port)) port = v6Port;
            host = host[1..close];
        }
        else
        {
            host = host.Trim('[', ']');
            var colon = host.LastIndexOf(':');
            // Genau ein Doppelpunkt = "host:port" (IPv6-Adressen haben mehrere und bleiben unangetastet).
            if (colon > 0 && host.IndexOf(':') == colon && int.TryParse(host[(colon + 1)..], out var embeddedPort))
            {
                host = host[..colon];
                port = embeddedPort;
            }
        }
        if (host.Length == 0 || host.Contains('/') || host.Contains(' ') || Uri.CheckHostName(host) == UriHostNameType.Unknown)
            return BadRequest(new { error = $"„{input.Host}“ ist keine gültige Adresse. Bitte nur IP oder Rechnernamen eintragen, z.B. 127.0.0.1." });
        if (port is < 1 or > 65535)
            return BadRequest(new { error = "Der Port muss zwischen 1 und 65535 liegen (OBS-Standard: 4455)." });

        await settings.SetAsync(SettingKeys.ObsHost, host);
        await settings.SetAsync(SettingKeys.ObsPort, port.ToString());
        if (input.ClearPassword) await settings.SetObsPasswordAsync(null);
        else if (!string.IsNullOrEmpty(input.Password)) await settings.SetObsPasswordAsync(input.Password);
        obs.Reconnect();
        return NoContent();
    }

    /// <summary>OBS automatisch finden: lokale OBS-Konfiguration uebernehmen, sonst im Netzwerk suchen.</summary>
    [HttpPost("obs/discover")]
    public async Task<DiscoveryResult> DiscoverObs([FromServices] ObsDiscovery discovery, CancellationToken ct)
    {
        var result = await discovery.DiscoverAsync(ct);
        if (result.Applied) obs.Reconnect();
        return result;
    }

    /// <summary>Filter einer Quelle/Szene - fuer die Auswahl im Editor ("Filter ein/aus").</summary>
    [HttpGet("obs/filters")]
    public async Task<IActionResult> GetFilters([FromQuery] string source, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(source)) return BadRequest(new { error = "Bitte zuerst eine Quelle wählen." });
        try
        {
            var result = await obs.RequestAsync("GetSourceFilterList", new { sourceName = source }, ct);
            var filters = result?["filters"]?.AsArray()
                .Select(f => new { name = f!["filterName"]!.GetValue<string>(), enabled = f["filterEnabled"]?.GetValue<bool>() ?? false })
                .ToList();
            return Ok(filters ?? []);
        }
        catch (Exception ex) when (ex is ObsRequestException or InvalidOperationException)
        {
            return UnprocessableEntity(new { error = $"Filter von „{source}“ konnten nicht geladen werden: {ex.Message}" });
        }
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
        return new { plugins = plugins.Plugins, connectUrl = $"{baseUrl}/ws/plugins", key = settings.Get(SettingKeys.PluginKey) };
    }

    [HttpPost("plugins/rotate-key")]
    public async Task<object> RotatePluginKey()
    {
        var key = TokenUtil.NewToken(24);
        await settings.SetAsync(SettingKeys.PluginKey, key);
        return new { key };
    }
}
