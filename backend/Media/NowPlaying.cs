using Deck.Server.Auth;
using Deck.Server.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Media;

/// <summary>
/// Aktuell laufende Wiedergabe (z.B. Spotify als Desktop-App oder im Browser). Die Position gilt zum Zeitpunkt
/// <see cref="PositionAt"/> - der Client rechnet waehrend der Wiedergabe selbst weiter, damit nicht jede Sekunde
/// etwas gesendet werden muss.
/// </summary>
public record NowPlayingInfo(
    string App,
    string Title,
    string Artist,
    string? Album,
    bool Playing,
    double PositionSeconds,
    double DurationSeconds,
    DateTimeOffset PositionAt,
    string? CoverId = null)
{
    /// <summary>Position auf "jetzt" hochgerechnet (waehrend der Wiedergabe) - der Client rechnet ab Empfang selbst weiter und ist so
    /// unabhaengig von seiner eigenen Uhr (Handy/Tablet).</summary>
    public NowPlayingInfo AtNow()
    {
        var now = DateTimeOffset.UtcNow;
        var position = Playing ? PositionSeconds + Math.Max(0, (now - PositionAt).TotalSeconds) : PositionSeconds;
        if (DurationSeconds > 0) position = Math.Min(position, DurationSeconds);
        return this with { PositionSeconds = position, PositionAt = now };
    }
}

/// <summary>Albumcover der laufenden Wiedergabe (Bytes + Medientyp); <see cref="Id"/> aendert sich mit dem Bild.</summary>
public record NowPlayingCover(string Id, byte[] Data, string ContentType);

/// <summary>
/// Quelle fuer die laufende Wiedergabe. Auf dem Windows-Desktop liefert sie die Windows-Mediensteuerung
/// (siehe Deck.Desktop, WindowsNowPlayingProvider) - die kennt Spotify (App und Browser) ohne Anmeldung;
/// im Docker-/Headless-Betrieb gibt es keine Quelle (<see cref="NoNowPlaying"/>).
/// </summary>
public interface INowPlayingProvider
{
    NowPlayingInfo? Current { get; }

    /// <summary>Cover zum aktuellen Titel, falls der Player eins liefert (Spotify ja, Browser nur mit gesetztem Artwork).</summary>
    NowPlayingCover? Cover { get; }

    /// <summary>Wird ausgeloest, wenn sich Titel, Wiedergabezustand oder die Position sprunghaft (Vor-/Zurueckspulen) geaendert hat.</summary>
    event Action? Changed;
}

public sealed class NoNowPlaying : INowPlayingProvider
{
    public NowPlayingInfo? Current => null;
    public NowPlayingCover? Cover => null;
    public event Action? Changed { add { } remove { } }
}

/// <summary>Sendet Aenderungen der Wiedergabe als SignalR-Event "nowPlaying" (null = nichts laeuft) an alle Geraete.</summary>
public sealed class NowPlayingBroadcaster(IHubContext<DeckHub> hub, INowPlayingProvider provider, ILogger<NowPlayingBroadcaster> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var signal = new SemaphoreSlim(0);
        void OnChanged() { if (signal.CurrentCount == 0) signal.Release(); }
        provider.Changed += OnChanged;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await signal.WaitAsync(stoppingToken);
                // Kurz sammeln: beim Titelwechsel feuern mehrere Ereignisse hintereinander.
                await Task.Delay(150, stoppingToken);
                try { await hub.Clients.All.SendAsync("nowPlaying", provider.Current?.AtNow(), stoppingToken); }
                catch (Exception ex) when (ex is not OperationCanceledException) { log.LogDebug(ex, "Wiedergabe konnte nicht gesendet werden."); }
            }
        }
        catch (OperationCanceledException) { }
        finally { provider.Changed -= OnChanged; }
    }
}

[ApiController]
[Route("api/now-playing")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class NowPlayingController(INowPlayingProvider provider) : ControllerBase
{
    /// <summary>Aktueller Stand fuer den ersten Ladezustand - danach kommen Aenderungen per Event "nowPlaying". 204 = nichts laeuft.</summary>
    [HttpGet]
    public IActionResult Get() => provider.Current is { } current ? Ok(current.AtNow()) : NoContent();

    /// <summary>Cover als Bild. Der Client holt es mit seinem Token (ein img-Tag koennte keinen Authorization-Header senden)
    /// und haelt es unter der CoverId im Speicher; 404 = kein Cover.</summary>
    [HttpGet("cover")]
    public IActionResult GetCover()
    {
        if (provider.Cover is not { } cover) return NotFound(new { error = "Zur laufenden Wiedergabe gibt es kein Cover." });
        Response.Headers.CacheControl = "private, max-age=3600";
        return File(cover.Data, cover.ContentType);
    }
}
