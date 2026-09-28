using Deck.Server.Auth;
using Deck.Server.Data;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Controllers;

[ApiController]
[Route("api/devices")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
public class DevicesController(AppDbContext db, DeviceTokenCache cache, PairingService pairing, NetworkInfo network) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<DeviceDto>> List()
    {
        var me = User.DeviceId();
        var devices = await db.Devices.AsNoTracking().OrderBy(d => d.Id).ToListAsync();
        return devices.Select(d => new DeviceDto(d.Id, d.Name, d.Role, d.CreatedAt, d.LastSeenAt, d.Id == me)).ToList();
    }

    /// <summary>Erzeugt einen Kopplungscode + URL fuer den QR-Code.</summary>
    [HttpPost("pairing")]
    public object CreatePairing()
    {
        var (code, expiresAt) = pairing.Create();
        var baseUrl = network.PublicBaseUrl(Request);
        return new { code, expiresAt, url = $"{baseUrl}/pair?code={code}", baseUrl, addresses = NetworkInfo.LanAddresses() };
    }

    [HttpPatch("{id:int}")]
    public async Task<IActionResult> Update(int id, DeviceUpdateInput input)
    {
        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == id);
        if (device is null) return NotFound(new { error = "Gerät nicht gefunden." });

        if (input.Role is { } role && role != device.Role)
        {
            if (device.Role == DeviceRole.Owner && await db.Devices.CountAsync(d => d.Role == DeviceRole.Owner) <= 1)
                return Conflict(new { error = "Das ist das einzige Besitzer-Gerät - erst ein anderes Gerät zum Besitzer machen." });
            device.Role = role;
        }
        if (input.Name is { } name) device.Name = name.Trim();

        await db.SaveChangesAsync();
        cache.Invalidate();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == id);
        if (device is null) return NotFound(new { error = "Gerät nicht gefunden." });
        if (device.Role == DeviceRole.Owner && await db.Devices.CountAsync(d => d.Role == DeviceRole.Owner) <= 1)
            return Conflict(new { error = "Das einzige Besitzer-Gerät kann nicht entfernt werden." });

        db.Devices.Remove(device);
        await db.SaveChangesAsync();
        cache.Invalidate();
        return NoContent();
    }
}
