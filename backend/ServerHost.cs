using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Data;
using Deck.Server.Hotkeys;
using Deck.Server.Hubs;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server;

/// <summary>
/// Baut den kompletten Dienst. Wird von Program.cs (headless, z.B. Docker) und spaeter von der
/// Windows-Desktop-Huelle (Tray + WebView2) im selben Prozess aufgerufen.
/// </summary>
public static class ServerHost
{
    /// <summary>Standard-Port der installierten App (siehe ports.json, Eintrag "baton" -> "live").</summary>
    public const int DefaultPort = 5202;

    public static WebApplication Build(string[] args, Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(args);
        configure?.Invoke(builder);

        var dataDir = builder.Configuration["Deck:DataDir"] is { Length: > 0 } configured
            ? configured
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SushiFluxDevelop", "Deck");
        Directory.CreateDirectory(dataDir);

        if (string.IsNullOrEmpty(builder.Configuration["ASPNETCORE_URLS"]) && string.IsNullOrEmpty(builder.Configuration["urls"]))
        {
            var port = int.TryParse(builder.Configuration["Deck:Port"], out var p) ? p : DefaultPort;
            // Im ganzen LAN erreichbar - Handys/Tablets verbinden sich direkt.
            builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
        }

        builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={Path.Combine(dataDir, "deck.db")}"));
        var dataProtection = builder.Services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDir, "keys")))
            .SetApplicationName("Deck");
        // Installierte Windows-App: Schluesselring zusaetzlich an das Windows-Benutzerkonto binden.
        if (OperatingSystem.IsWindows()) dataProtection.ProtectKeysWithDpapi();

        builder.Services.AddSingleton<AppInfo>();
        builder.Services.AddSingleton<SettingsService>();
        builder.Services.AddSingleton<NetworkInfo>();
        builder.Services.AddSingleton<PairingService>();
        builder.Services.AddSingleton<BootstrapPolicy>();
        builder.Services.AddSingleton<DeviceTokenCache>();
        builder.Services.AddSingleton<PluginHost>();
        builder.Services.AddSingleton<PreviewSubscribers>();
        builder.Services.AddSingleton<ActionExecutor>();
        builder.Services.AddSingleton<ObsDiscovery>();
        builder.Services.AddSingleton(new DataPaths(dataDir));
        builder.Services.AddSingleton<PluginCatalog>();
        builder.Services.AddHttpClient("catalog", c =>
        {
            c.Timeout = TimeSpan.FromSeconds(30);
            c.DefaultRequestHeaders.UserAgent.ParseAdd("Deck-PluginCatalog/1");
        });
        AddHostedSingleton<PluginManager>(builder.Services);

        // Systemweite Tastenkuerzel (wie OBS) nur, wenn der Dienst direkt unter Windows in der
        // Benutzersitzung laeuft - im Docker-/Linux-Betrieb bleibt es bei Browser-Kuerzeln.
        if (OperatingSystem.IsWindows() && builder.Configuration["Deck:GlobalHotkeys"] != "false")
            AddWindowsHotkeys(builder.Services);
        else
        {
            builder.Services.AddSingleton<IGlobalHotkeys, NoGlobalHotkeys>();
        }
        AddHostedSingleton<ObsService>(builder.Services);
        AddHostedSingleton<AutomationEngine>(builder.Services);
        AddHostedSingleton<HubNotifier>(builder.Services);

        builder.Services.AddAuthentication(DeviceAuth.Scheme)
            .AddScheme<AuthenticationSchemeOptions, DeviceAuthHandler>(DeviceAuth.Scheme, null);
        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(DeviceAuth.OwnerPolicy, p => p.AddAuthenticationSchemes(DeviceAuth.Scheme).RequireRole(nameof(DeviceRole.Owner)));

        // Kopplung/Ersteinrichtung gegen Durchprobieren von Codes schuetzen: 10 Versuche pro Minute
        // und IP, sofort 429 statt Warteschlange (siehe globale CLAUDE.md "Rate limiter").
        builder.Services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (ctx, ct) =>
                await ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "Zu viele Versuche. Bitte eine Minute warten." }, ct);
            o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });

        builder.Services.AddControllers().AddJsonOptions(o => ConfigureJson(o.JsonSerializerOptions));
        builder.Services.AddSignalR().AddJsonProtocol(o => ConfigureJson(o.PayloadSerializerOptions));
        builder.Services.ConfigureHttpJsonOptions(o => ConfigureJson(o.SerializerOptions));

        var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            var h = ctx.Response.Headers;
            h.XContentTypeOptions = "nosniff";
            h.XFrameOptions = "DENY";
            h["Referrer-Policy"] = "no-referrer";
            h.ContentSecurityPolicy = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
                                      "font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
            await next();
        });

        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapControllers();
        app.MapHub<DeckHub>("/hub/deck");
        // Bewusst unter /ws/: "/plugins" ist eine Seite der Oberflaeche (sonst antwortet beim Neuladen der Dienst).
        app.Map("/ws/plugins", HandlePluginSocket);

        // SPA-Routen (/, /edit, /pair ...) liefern die gebaute Oberflaeche aus wwwroot.
        app.MapFallbackToFile("index.html");

        return app;
    }

    private static async Task HandlePluginSocket(HttpContext ctx)
    {
        if (!ctx.WebSockets.IsWebSocketRequest)
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsJsonAsync(new { error = "Plugins verbinden sich per WebSocket." });
            return;
        }
        var settings = ctx.RequestServices.GetRequiredService<SettingsService>();
        var expected = settings.Get(SettingKeys.PluginKey) ?? "";
        var given = ctx.Request.Query["key"].ToString();
        if (expected.Length == 0 || !TokenUtil.FixedTimeEquals(given, expected))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await ctx.Response.WriteAsJsonAsync(new { error = "Ungültiger Plugin-Schlüssel (siehe Einstellungen > Plugins)." });
            return;
        }
        using var socket = await ctx.WebSockets.AcceptWebSocketAsync();
        await ctx.RequestServices.GetRequiredService<PluginHost>().HandleAsync(socket, ctx.RequestAborted);
    }

    /// <summary>
    /// Migrationen + Grunddaten + Einstellungen laden. Bewusst nicht in Build(), damit
    /// Design-Time-Werkzeuge (dotnet ef) keine echte Datenbank anlegen.
    /// </summary>
    public static async Task InitializeAsync(IServiceProvider services)
    {
        using (var scope = services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync();
            if (!await db.Decks.AnyAsync())
            {
                db.Decks.Add(new DeckEntity { Name = "Mein Deck", Rows = 3, Columns = 5, Pages = [new PageEntity { Name = "Start" }] });
                await db.SaveChangesAsync();
            }
        }
        await services.GetRequiredService<SettingsService>().LoadAsync();
        // Erster Start: OBS auf diesem PC ohne jede Eingabe verbinden (Port + Passwort aus OBS' Konfiguration).
        await services.GetRequiredService<ObsDiscovery>().AutoConfigureOnFirstRunAsync();
    }

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    private static void AddWindowsHotkeys(IServiceCollection services)
    {
        services.AddSingleton<GlobalHotkeyService>();
        services.AddSingleton<IGlobalHotkeys>(sp => sp.GetRequiredService<GlobalHotkeyService>());
        services.AddHostedService(sp => sp.GetRequiredService<GlobalHotkeyService>());
    }

    private static void AddHostedSingleton<T>(IServiceCollection services) where T : class, IHostedService
    {
        services.AddSingleton<T>();
        services.AddHostedService(sp => sp.GetRequiredService<T>());
    }

    private static void ConfigureJson(JsonSerializerOptions o)
    {
        o.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    }
}
