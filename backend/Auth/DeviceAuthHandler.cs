using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Deck.Server.Data;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Deck.Server.Auth;

public static class DeviceAuth
{
    public const string Scheme = "Device";
    public const string OwnerPolicy = "Owner";
}

/// <summary>Cache Token-Hash -> Geraet, damit nicht jeder Tastendruck die Datenbank trifft.</summary>
public class DeviceTokenCache(IServiceScopeFactory scopes)
{
    public record Entry(int Id, string Name, DeviceRole Role);

    private readonly ConcurrentDictionary<string, Entry?> _byHash = new();
    private readonly ConcurrentDictionary<int, DateTimeOffset> _lastSeenWritten = new();

    public void Invalidate() => _byHash.Clear();

    public async Task<Entry?> ResolveAsync(string token)
    {
        var hash = TokenUtil.Hash(token);
        if (_byHash.TryGetValue(hash, out var cached)) return cached;

        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var d = await db.Devices.AsNoTracking().FirstOrDefaultAsync(x => x.TokenHash == hash);
        var entry = d is null ? null : new Entry(d.Id, d.Name, d.Role);
        _byHash[hash] = entry;
        return entry;
    }

    /// <summary>"Zuletzt gesehen" hoechstens einmal pro Minute schreiben.</summary>
    public async Task TouchAsync(int deviceId)
    {
        var now = DateTimeOffset.UtcNow;
        if (_lastSeenWritten.TryGetValue(deviceId, out var last) && now - last < TimeSpan.FromMinutes(1)) return;
        _lastSeenWritten[deviceId] = now;
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Devices.Where(x => x.Id == deviceId).ExecuteUpdateAsync(s => s.SetProperty(x => x.LastSeenAt, now));
    }
}

public class DeviceAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    DeviceTokenCache cache) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? token = null;
        var header = Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            token = header["Bearer ".Length..].Trim();
        // Browser-WebSockets (SignalR) koennen keine Header setzen -> Token per Query, nur fuer den Hub.
        else if (Request.Path.StartsWithSegments("/hub") && Request.Query.TryGetValue("access_token", out var q))
            token = q.ToString();
        // Das Hintergrundbild wird als CSS "background-image"/<img src> geladen - der Browser setzt
        // dort keinen Authorization-Header, daher hier ebenfalls Token per Query erlaubt (nur GET,
        // nur dieser eine Endpunkt - Upload/Loeschen bleiben strikt Header-Bearer + Owner-Policy).
        else if (Request.Path.StartsWithSegments("/api/settings/appearance/background-image") && Request.Method == HttpMethods.Get
                 && Request.Query.TryGetValue("access_token", out var iq))
            token = iq.ToString();

        if (string.IsNullOrEmpty(token)) return AuthenticateResult.NoResult();

        var device = await cache.ResolveAsync(token);
        if (device is null) return AuthenticateResult.Fail("Unbekanntes oder entferntes Gerät.");

        _ = cache.TouchAsync(device.Id);

        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, device.Id.ToString()),
            new Claim(ClaimTypes.Name, device.Name),
            new Claim(ClaimTypes.Role, device.Role.ToString()),
        ], DeviceAuth.Scheme);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), DeviceAuth.Scheme));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Response.WriteAsJsonAsync(new { error = "Dieses Gerät ist nicht (mehr) gekoppelt. Bitte neu koppeln." });
    }

    protected override Task HandleForbiddenAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status403Forbidden;
        return Response.WriteAsJsonAsync(new { error = "Nur Besitzer-Geräte dürfen das. Bearbeiten geht in der Desktop-App oder auf einem Besitzer-Gerät." });
    }
}

public static class ClaimsExtensions
{
    public static int DeviceId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
}
