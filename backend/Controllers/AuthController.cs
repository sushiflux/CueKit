using System.Security.Claims;
using Deck.Server.Auth;
using Deck.Server.Data;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, PairingService pairing, BootstrapPolicy bootstrap, DeviceTokenCache cache) : ControllerBase
{
    /// <summary>Oeffentlich: muss noch ein Besitzer eingerichtet werden, und darf dieses Geraet das?</summary>
    [HttpGet("status")]
    public async Task<object> Status()
    {
        var needsSetup = !await db.Devices.AnyAsync(d => d.Role == DeviceRole.Owner);
        return new { needsSetup, canBootstrap = needsSetup && bootstrap.IsAllowed(HttpContext.Connection.RemoteIpAddress) };
    }

    /// <summary>
    /// Richtet das allererste Geraet als Besitzer ein - nur direkt am PC (Loopback), solange es
    /// noch keinen Besitzer gibt. Danach laufen alle weiteren Geraete ueber Kopplungscodes.
    /// </summary>
    [HttpPost("bootstrap")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Bootstrap(BootstrapInput input)
    {
        if (!bootstrap.IsAllowed(HttpContext.Connection.RemoteIpAddress))
            return StatusCode(403, new { error = "Die Ersteinrichtung ist nur direkt am PC möglich, auf dem der Dienst läuft (z.B. über die Desktop-App oder http://localhost)." });
        if (await db.Devices.AnyAsync(d => d.Role == DeviceRole.Owner))
            return Conflict(new { error = "Es gibt bereits ein Besitzer-Gerät. Neue Geräte bitte über einen Kopplungscode hinzufügen." });

        return Ok(await IssueDeviceAsync(input.DeviceName, DeviceRole.Owner));
    }

    [HttpPost("pair")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Pair(PairInput input)
    {
        if (!pairing.TryRedeem(input.Code))
            return BadRequest(new { error = "Der Kopplungscode ist ungültig oder abgelaufen (5 Minuten gültig, nur einmal verwendbar). Bitte in der Desktop-App einen neuen QR-Code erzeugen." });
        return Ok(await IssueDeviceAsync(input.DeviceName, DeviceRole.Controller));
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
    public object Me() => new
    {
        id = User.DeviceId(),
        name = User.FindFirstValue(ClaimTypes.Name),
        role = User.FindFirstValue(ClaimTypes.Role)?.ToLowerInvariant(),
    };

    private async Task<object> IssueDeviceAsync(string name, DeviceRole role)
    {
        var token = TokenUtil.NewToken();
        var device = new DeviceEntity { Name = name.Trim(), Role = role, TokenHash = TokenUtil.Hash(token), LastSeenAt = DateTimeOffset.UtcNow };
        db.Devices.Add(device);
        await db.SaveChangesAsync();
        cache.Invalidate();
        return new { token, device = new { device.Id, device.Name, role = device.Role.ToString().ToLowerInvariant() } };
    }
}
