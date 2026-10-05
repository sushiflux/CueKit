using Deck.Server;
using Deck.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Deck.Desktop;

/// <summary>Startet und beendet den kompletten Dienst (Deck.Server) im Prozess der Huelle.</summary>
internal sealed class ServiceHost : IAsyncDisposable
{
    private WebApplication? _app;

    /// <summary>Adresse, unter der dieser PC den Dienst erreicht (immer Loopback - auch fuer die Ersteinrichtung).</summary>
    public Uri LocalUri { get; private set; } = new("http://127.0.0.1/");

    /// <summary>Datenordner (Datenbank, Schluessel, Plugins) - dort liegen auch Fenstergroesse und WebView2-Profil.</summary>
    public string DataDir { get; private set; } = "";

    /// <summary>Konfiguration des laufenden Dienstes (Kommandozeile, Umgebung, appsettings).</summary>
    public IConfiguration? Configuration { get; private set; }

    public async Task StartAsync(string[] args)
    {
        // Auf dem Threadpool: Datenbank-Migration und erster Verbindungsversuch sollen die Oberflaeche nicht einfrieren.
        var app = await Task.Run(async () =>
        {
            var built = ServerHost.Build(args, builder =>
            {
                // Laufende Wiedergabe (Spotify/Browser) aus der Windows-Mediensteuerung - nur in der Desktop-Huelle.
                builder.Services.AddSingleton<Deck.Desktop.Media.WindowsNowPlayingProvider>();
                builder.Services.AddSingleton<Deck.Server.Media.INowPlayingProvider>(sp => sp.GetRequiredService<Deck.Desktop.Media.WindowsNowPlayingProvider>());
                builder.Services.AddHostedService(sp => sp.GetRequiredService<Deck.Desktop.Media.WindowsNowPlayingProvider>());
            });
            try
            {
                await ServerHost.InitializeAsync(built.Services);
                await built.StartAsync();
                return built;
            }
            catch
            {
                await built.DisposeAsync();
                throw;
            }
        });

        _app = app;
        DataDir = app.Services.GetRequiredService<DataPaths>().DataDir;
        Configuration = app.Services.GetRequiredService<IConfiguration>();
        var address = app.Urls.First().Replace("0.0.0.0", "127.0.0.1").Replace("[::]", "127.0.0.1").Replace("+", "127.0.0.1");
        LocalUri = new Uri($"http://127.0.0.1:{new Uri(address).Port}/");
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null) return;
        var app = _app;
        _app = null;
        using var shutdownTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try { await app.StopAsync(shutdownTimeout.Token); }
        finally { await app.DisposeAsync(); }
    }
}
