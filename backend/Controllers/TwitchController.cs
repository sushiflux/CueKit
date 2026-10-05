using System.ComponentModel.DataAnnotations;
using Deck.Server.Auth;
using Deck.Server.Twitch;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Deck.Server.Controllers;

public record TwitchClientIdInput([Required, StringLength(80)] string ClientId);

public record TwitchDisplayInput(bool ShowViewers, bool ShowSubs, bool ShowCategory, bool ShowTitle);

/// <summary>
/// Twitch-Anbindung. Lesen (Live-Zahlen) duerfen alle gekoppelten Geraete; Einrichten/Verbinden/Trennen nur der Besitzer.
/// Es werden NIE Token, Nutzer-ID oder die vollstaendige Client-ID ausgeliefert - jeder meldet sich mit seinem eigenen
/// Twitch-Konto an, die Zugangsdaten bleiben verschluesselt auf dem Rechner, auf dem der Dienst laeuft.
/// </summary>
[ApiController]
[Route("api/twitch")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class TwitchController(TwitchService twitch) : ControllerBase
{
    [HttpGet]
    public TwitchSnapshot Get() => twitch.Snapshot;

    /// <summary>Status fuer die Einstellungen: Snapshot + laufende Anmeldung (Code, Adresse). Nur Besitzer - der Code verknuepft ein Twitch-Konto mit diesem Dienst.</summary>
    [HttpGet("status")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public TwitchStatus GetStatus() => new(twitch.Snapshot, twitch.Flow, twitch.ClientIdHint);

    [HttpPut("client-id")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> SetClientId(TwitchClientIdInput input, CancellationToken ct)
    {
        try { await twitch.SetClientIdAsync(input.ClientId, ct); }
        catch (TwitchException ex) { return BadRequest(new { error = ex.Message }); }
        return Ok(new TwitchStatus(twitch.Snapshot, twitch.Flow, twitch.ClientIdHint));
    }

    /// <summary>Welche Twitch-Angaben im oberen OLED erscheinen sollen - jede einzeln abschaltbar (gilt fuer alle Geraete).</summary>
    [HttpPut("display")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<TwitchSnapshot> SetDisplay(TwitchDisplayInput input, CancellationToken ct)
    {
        await twitch.SetDisplayAsync(input.ShowViewers, input.ShowSubs, input.ShowCategory, input.ShowTitle, ct);
        return twitch.Snapshot;
    }

    [HttpPost("connect")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> Connect(CancellationToken ct)
    {
        try { return Ok(await twitch.StartConnectAsync(ct)); }
        catch (TwitchException ex) { return StatusCode(ex.Status is 409 ? 409 : 502, new { error = ex.Message }); }
        catch (HttpRequestException ex) { return StatusCode(502, new { error = $"Twitch ist nicht erreichbar: {ex.Message}" }); }
    }

    [HttpPost("disconnect")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> Disconnect(CancellationToken ct)
    {
        await twitch.DisconnectAsync(ct);
        return NoContent();
    }
}
