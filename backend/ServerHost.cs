using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Data;
using Deck.Server.Hardware;
using Deck.Server.Hotkeys;
using Deck.Server.Hubs;
using Deck.Server.Media;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Deck.Server.Twitch;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Deck.Server;

/// <summary>
/// Baut den kompletten Dienst. Wird von Program.cs (headless, z.B. Docker) und spaeter von der
/// Windows-Desktop-Huelle (Tray + WebView2) im selben Prozess aufgerufen.
/// </summary>
public static class ServerHost
{
    /// <summary>Standard-Port der installierten App (siehe ports.json, Eintrag "cuekit" -> "live").</summary>
    public const int DefaultPort = 5202;

    /// <summary>Datenordner (Datenbank, Schluessel, Plugins): <c>Deck:DataDir</c> oder <c>%LOCALAPPDATA%\SushiFluxDevelop\Deck</c>.
    /// Oeffentlich, damit die Desktop-Huelle vor dem Dienststart dieselben Dateien (z.B. EULA-Zustimmung) dort ablegen kann.</summary>
    public static string ResolveDataDir(IConfiguration configuration) =>
        configuration["Deck:DataDir"] is { Length: > 0 } configured
            ? configured
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SushiFluxDevelop", "Deck");

    public static WebApplication Build(string[] args, Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(args);
        configure?.Invoke(builder);

        var dataDir = ResolveDataDir(builder.Configuration);
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
        builder.Services.AddSingleton<ActionExecutor>();
        builder.Services.AddSingleton<ObsDiscovery>();
        builder.Services.AddSingleton(new DataPaths(dataDir));
        builder.Services.AddSingleton<SwitchStateService>();
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

        // Systemlautstaerke + Sensoren (CPU/GPU/RAM): nur nativ unter Windows verfuegbar, siehe
        // Hardware/SystemVolumeService.cs und Hardware/SystemMonitorService.cs.
        builder.Services.AddSingleton<SystemMonitorSubscribers>();
        if (OperatingSystem.IsWindows())
        {
            AddWindowsHardware(builder.Services);
        }
        else
        {
            builder.Services.AddSingleton<ISystemVolume, NoSystemVolume>();
            // Entwickler-Notbehelf nur im Docker-Dev-Stack: Container-eigene CPU/RAM-Werte statt
            // "nicht verfuegbar", damit Anzeige-Kacheln ueberhaupt Live-Zahlen zeigen (siehe
            // Hardware/ContainerSystemMonitor.cs - das sind Container-, nicht PC-Werte). In
            // Production/Live bleibt es bei NoSystemMonitor, auch ohne natives Windows.
            if (builder.Environment.IsDevelopment())
                builder.Services.AddSingleton<ISystemMonitor, ContainerSystemMonitor>();
            else
                builder.Services.AddSingleton<ISystemMonitor, NoSystemMonitor>();
        }
        AddHostedSingleton<SystemMonitorBroadcaster>(builder.Services);
        builder.Services.AddSingleton<MeterSubscribers>();
        AddHostedSingleton<MeterBroadcaster>(builder.Services);

        // Laufende Wiedergabe (Spotify o.a.): die Windows-Quelle liefert die Desktop-Huelle ueber `configure`; sonst keine.
        builder.Services.TryAddSingleton<INowPlayingProvider, NoNowPlaying>();
        AddHostedSingleton<NowPlayingBroadcaster>(builder.Services);

        // Twitch: Live-Zahlen + Aktionen; Anmeldung pro Nutzer ueber den Device-Code-Ablauf (kein Client-Secret in der App).
        builder.Services.AddHttpClient("twitch", c => { c.Timeout = TimeSpan.FromSeconds(15); c.DefaultRequestHeaders.UserAgent.ParseAdd("CueKit"); });
        AddHostedSingleton<TwitchService>(builder.Services);

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

        // Controller ausdruecklich aus dieser Assembly laden: standardmaessig sucht ASP.NET nur in der
        // Start-Assembly - und die ist beim Einbetten (Desktop-Huelle) nicht Deck.Server.
        builder.Services.AddControllers()
            .AddApplicationPart(typeof(ServerHost).Assembly)
            .AddJsonOptions(o => ConfigureJson(o.JsonSerializerOptions));
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

        // Unbehandelte Fehler als {error}-JSON statt einer HTML-Fehlerseite (Development-Modus zeigt
        // sonst die DeveloperExceptionPage, die keine {error}-Property hat - das Frontend faellt dann
        // auf eine generische Meldung zurueck, siehe api/client.ts readError()/STATUS_FALLBACK). Ganz
        // vorn in der Pipeline, damit sie jeden Endpunkt abdeckt, nicht nur Controller-Aktionen.
        app.Use(async (ctx, next) =>
        {
            try
            {
                await next();
            }
            catch (Exception ex)
            {
                app.Logger.LogError(ex, "Unbehandelter Fehler bei {Path}", ctx.Request.Path);
                if (!ctx.Response.HasStarted)
                {
                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        error = builder.Environment.IsDevelopment()
                            ? $"Unerwarteter Fehler im Dienst: {ex.GetType().Name} – {ex.Message}"
                            : "Unerwarteter Fehler im Dienst. Bitte die Seite neu laden; hält das Problem an, hilft meist ein Neustart des Dienstes.",
                    });
                }
            }
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
            // WAL statt des SQLite-Default-Rollback-Journals: erlaubt gleichzeitige Leser neben einem
            // Schreiber, statt jeden Schreibzugriff alle anderen Verbindungen blockieren zu lassen.
            // Mehrere BackgroundServices/Controller oeffnen hier im selben Prozess unabhaengige
            // Scopes/Connections (siehe SettingsService) - ohne WAL fuehrten kollidierende Zugriffe
            // zu spuerbaren Wartezeiten (bis zum SQLite-Default-Timeout von 30s). WAL ist eine
            // dauerhafte Dateieigenschaft, das Setzen hier beim Start reicht.
            await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
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

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    private static void AddWindowsHardware(IServiceCollection services)
    {
        services.AddSingleton<ISystemVolume, SystemVolumeService>();
        services.AddSingleton<SystemMonitorService>();
        services.AddSingleton<ISystemMonitor>(sp => sp.GetRequiredService<SystemMonitorService>());
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
