using Deck.Server.Auth;
using Deck.Server.Data;
using Deck.Server.Plugins;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Controllers;

public record InstalledPluginDto(
    string Id,
    string Name,
    string Version,
    string? Author,
    string? Description,
    string Icon,
    bool Enabled,
    string Source,
    DateTimeOffset InstalledAt,
    string State,
    string? Message,
    int Restarts,
    bool Connected,
    int ActionCount);

public record PluginEnabledInput(bool Enabled);

/// <summary>Installierte Plugin-Pakete verwalten: aus ZIP-Datei oder dem offiziellen Katalog.</summary>
[ApiController]
[Route("api/plugins")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
public class PluginsController(AppDbContext db, PluginManager manager, PluginCatalog catalog, PluginHost host) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<InstalledPluginDto>> List()
    {
        var installed = await db.InstalledPlugins.AsNoTracking().OrderBy(p => p.Name).ToListAsync();
        var connected = host.Plugins.ToDictionary(p => p.Id);
        return installed.Select(p =>
        {
            var status = manager.StatusOf(p.Id);
            connected.TryGetValue(p.Id, out var live);
            return new InstalledPluginDto(p.Id, p.Name, p.Version, p.Author, p.Description, p.Icon, p.Enabled, p.Source, p.InstalledAt,
                status.State.ToString().ToLowerInvariant(), status.Message, status.Restarts, live is not null, live?.Actions.Count ?? 0);
        }).ToList();
    }

    /// <summary>Plugin-Paket (ZIP) hochladen und installieren bzw. aktualisieren.</summary>
    [HttpPost("install")]
    [RequestSizeLimit(PluginPackage.MaxZipBytes + 1024 * 1024)]
    public async Task<IActionResult> Install(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Keine Datei empfangen." });
        if (file.Length > PluginPackage.MaxZipBytes) return BadRequest(new { error = "Das Paket ist zu groß (max. 25 MB)." });
        if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = $"„{file.FileName}“ ist keine ZIP-Datei. Plugins werden als .zip installiert." });

        var temp = Path.Combine(Path.GetTempPath(), $"deck-upload-{Guid.NewGuid():N}.zip");
        try
        {
            await using (var stream = System.IO.File.Create(temp)) await file.CopyToAsync(stream, ct);
            var plugin = await manager.InstallAsync(temp, "file", ct);
            return Ok(new { plugin.Id, plugin.Name, plugin.Version });
        }
        catch (PluginPackageException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        finally
        {
            try { System.IO.File.Delete(temp); } catch { }
        }
    }

    [HttpPatch("{id}")]
    public async Task<IActionResult> SetEnabled(string id, PluginEnabledInput input, CancellationToken ct) =>
        await manager.SetEnabledAsync(id, input.Enabled, ct) ? NoContent() : NotFound(new { error = "Plugin nicht gefunden." });

    [HttpPost("{id}/restart")]
    public async Task<IActionResult> Restart(string id, CancellationToken ct) =>
        await manager.RestartAsync(id, ct) ? NoContent() : NotFound(new { error = "Plugin nicht gefunden." });

    [HttpDelete("{id}")]
    public async Task<IActionResult> Uninstall(string id, CancellationToken ct) =>
        await manager.UninstallAsync(id, ct) ? NoContent() : NotFound(new { error = "Plugin nicht gefunden." });

    [HttpGet("{id}/log")]
    public object Log(string id) => new { lines = manager.StatusOf(id).Log };

    // ---------- Katalog ----------

    [HttpGet("catalog")]
    public async Task<IActionResult> Catalog([FromQuery] bool refresh, CancellationToken ct)
    {
        if (catalog.Url is null) return Ok(new { available = false, plugins = Array.Empty<object>() });
        try
        {
            var index = await catalog.GetAsync(refresh, ct);
            var installed = await db.InstalledPlugins.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Version, ct);
            return Ok(new
            {
                available = true,
                plugins = index.Plugins.Select(p => new
                {
                    p.Id, p.Name, p.Version, p.Author, p.Description, Icon = p.Icon ?? "tabler:puzzle", p.Homepage,
                    InstalledVersion = installed.GetValueOrDefault(p.Id),
                }),
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(502, new { error = ex.Message });
        }
    }

    [HttpPost("catalog/{id}/install")]
    public async Task<IActionResult> InstallFromCatalog(string id, CancellationToken ct)
    {
        try
        {
            var plugin = await catalog.InstallAsync(id, ct);
            return Ok(new { plugin.Id, plugin.Name, plugin.Version });
        }
        catch (Exception ex) when (ex is InvalidOperationException or PluginPackageException)
        {
            return UnprocessableEntity(new { error = ex.Message });
        }
    }
}
