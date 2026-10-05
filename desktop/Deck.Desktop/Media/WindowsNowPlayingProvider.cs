using Deck.Server.Media;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using Windows.Storage.Streams;
using Windows.Media.Control;

namespace Deck.Desktop.Media;

/// <summary>
/// Liest die laufende Wiedergabe aus der Windows-Mediensteuerung (System Media Transport Controls, dieselbe Quelle
/// wie das Lautstaerke-/Medien-Flyout von Windows). Spotify meldet sich dort sowohl als Desktop-App als auch im Browser
/// an - ohne Anmeldung, ohne API-Schluessel. Gleiches gilt fuer andere Player (Apple Music, YouTube Music, VLC ...).
/// Bevorzugt wird eine laufende Spotify-Sitzung, dann jede andere laufende, zuletzt eine pausierte.
/// </summary>
public sealed class WindowsNowPlayingProvider : BackgroundService, INowPlayingProvider
{
    private readonly ILogger<WindowsNowPlayingProvider> _log;
    private GlobalSystemMediaTransportControlsSessionManager? _manager;
    private readonly List<GlobalSystemMediaTransportControlsSession> _hooked = [];
    private readonly SemaphoreSlim _refreshSignal = new(0);
    private volatile NowPlayingInfo? _current;
    private volatile NowPlayingCover? _cover;
    private string _coverKey = "";

    public WindowsNowPlayingProvider(ILogger<WindowsNowPlayingProvider> log) => _log = log;

    public NowPlayingInfo? Current => _current;
    public NowPlayingCover? Cover => _cover;
    public event Action? Changed;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            _manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Windows-Mediensteuerung nicht verfuegbar - die Wiedergabe-Anzeige bleibt leer.");
            return;
        }

        _manager.SessionsChanged += (_, _) => Signal();
        _manager.CurrentSessionChanged += (_, _) => Signal();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshAsync();
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "Wiedergabe konnte nicht gelesen werden.");
            }

            try
            {
                // Ereignisse (Titel-/Statuswechsel, Spulen) wecken sofort; zusaetzlich alle 5 s als Sicherheitsnetz
                // gegen verpasste Ereignisse. Kurz sammeln, weil beim Titelwechsel mehrere Ereignisse kurz nacheinander kommen.
                await _refreshSignal.WaitAsync(TimeSpan.FromSeconds(5), stoppingToken);
                await Task.Delay(200, stoppingToken);
                while (_refreshSignal.CurrentCount > 0) _refreshSignal.Wait(0);
            }
            catch (OperationCanceledException) { break; }
        }
    }

    private void Signal()
    {
        if (_refreshSignal.CurrentCount == 0) _refreshSignal.Release();
    }

    private async Task RefreshAsync()
    {
        if (_manager is null) return;
        var sessions = _manager.GetSessions();

        // Neue Sitzungen abonnieren, damit Titel-/Statuswechsel sofort ankommen (nicht erst im 5-s-Takt).
        foreach (var s in sessions)
        {
            if (_hooked.Any(h => h.SourceAppUserModelId == s.SourceAppUserModelId)) continue;
            _hooked.Add(s);
            s.MediaPropertiesChanged += (_, _) => Signal();
            s.PlaybackInfoChanged += (_, _) => Signal();
            s.TimelinePropertiesChanged += (_, _) => Signal();
        }
        _hooked.RemoveAll(h => sessions.All(s => s.SourceAppUserModelId != h.SourceAppUserModelId));

        NowPlayingInfo? best = null;
        GlobalSystemMediaTransportControlsSessionMediaProperties? bestProps = null;
        var bestRank = int.MaxValue;
        foreach (var session in sessions)
        {
            var playing = session.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            var isSpotify = session.SourceAppUserModelId.Contains("spotify", StringComparison.OrdinalIgnoreCase);
            // 0 = Spotify spielt, 1 = anderes spielt, 2 = Spotify pausiert, 3 = anderes pausiert
            var rank = playing ? (isSpotify ? 0 : 1) : (isSpotify ? 2 : 3);
            if (rank >= bestRank) continue;

            var props = await session.TryGetMediaPropertiesAsync();
            if (string.IsNullOrWhiteSpace(props.Title)) continue;

            var timeline = session.GetTimelineProperties();
            var duration = (timeline.EndTime - timeline.StartTime).TotalSeconds;
            var position = (timeline.Position - timeline.StartTime).TotalSeconds;
            best = new NowPlayingInfo(
                FriendlyAppName(session.SourceAppUserModelId),
                props.Title.Trim(),
                (props.Artist ?? "").Trim(),
                string.IsNullOrWhiteSpace(props.AlbumTitle) ? null : props.AlbumTitle.Trim(),
                playing,
                Math.Max(0, position),
                Math.Max(0, duration),
                timeline.LastUpdatedTime);
            bestRank = rank;
            bestProps = props;
        }

        // Cover nur neu laden, wenn der Titel wechselt - oder solange noch keins da ist (Spotify liefert es oft einen Moment nach dem Titel).
        var coverId = await UpdateCoverAsync(best, bestProps);
        if (best is not null) best = best with { CoverId = coverId };

        if (!Differs(_current, best)) return;
        _current = best;
        Changed?.Invoke();
    }

    private string _previousTrackCoverId = "";
    private DateTimeOffset _trackChangedAt = DateTimeOffset.MinValue;

    /// <summary>So lange nach einem Titelwechsel gilt ein unveraendertes Bild als das noch alte Cover des vorherigen Titels.</summary>
    private static readonly TimeSpan StaleCoverWindow = TimeSpan.FromSeconds(8);

    /// <summary>
    /// Aktualisiert das Cover des aktuellen Titels. Das Bild wird bei jeder Aktualisierung neu gelesen (klein, billig): Browser
    /// (Spotify im Browser) liefern das neue Cover oft erst einige Sekunden NACH dem neuen Titel - wer nur einmal beim Titelwechsel liest,
    /// bleibt sonst beim Bild des vorherigen Titels haengen. Kommt direkt nach dem Wechsel noch das alte Bild, wird es nicht gezeigt
    /// (lieber kurz kein Cover als ein falsches); nach <see cref="StaleCoverWindow"/> gilt es als echt (gleiches Album).
    /// </summary>
    private async Task<string?> UpdateCoverAsync(NowPlayingInfo? info, GlobalSystemMediaTransportControlsSessionMediaProperties? props)
    {
        if (info is null || props is null)
        {
            _cover = null;
            _coverKey = "";
            _previousTrackCoverId = "";
            return null;
        }

        var key = $"{info.App}|{info.Title}|{info.Artist}|{info.Album}";
        if (key != _coverKey)
        {
            _previousTrackCoverId = _cover?.Id ?? _previousTrackCoverId;
            _cover = null;
            _coverKey = key;
            _trackChangedAt = DateTimeOffset.UtcNow;
        }

        var fresh = await ReadThumbnailAsync(props);
        if (fresh is not null)
        {
            var stale = fresh.Id == _previousTrackCoverId && DateTimeOffset.UtcNow - _trackChangedAt < StaleCoverWindow;
            if (!stale) _cover = fresh;
        }
        return _cover?.Id;
    }

    private async Task<NowPlayingCover?> ReadThumbnailAsync(GlobalSystemMediaTransportControlsSessionMediaProperties props)
    {
        try
        {
            if (props.Thumbnail is null) return null;
            using var stream = await props.Thumbnail.OpenReadAsync();
            if (stream.Size is 0 or > 6_000_000) return null;
            var buffer = new byte[(int)stream.Size];
            using var reader = new DataReader(stream.GetInputStreamAt(0));
            await reader.LoadAsync((uint)buffer.Length);
            reader.ReadBytes(buffer);
            var contentType = string.IsNullOrWhiteSpace(stream.ContentType) ? Sniff(buffer) : stream.ContentType;
            return new NowPlayingCover(Convert.ToHexString(SHA256.HashData(buffer))[..12], buffer, contentType);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Cover konnte nicht gelesen werden.");
            return null;
        }
    }

    private static string Sniff(byte[] data) =>
        data.Length > 3 && data[0] == 0x89 && data[1] == 0x50 ? "image/png" : data.Length > 2 && data[0] == 0xFF && data[1] == 0xD8 ? "image/jpeg" : "application/octet-stream";

    /// <summary>Aenderung, die gesendet werden muss: anderer Titel/Zustand/Dauer oder ein Positionssprung (Spulen) von mehr als 2 s
    /// gegenueber dem, was der Client aus der letzten Meldung selbst weiterrechnet.</summary>
    private static bool Differs(NowPlayingInfo? a, NowPlayingInfo? b)
    {
        if (a is null || b is null) return a is null != b is null;
        if (a.App != b.App || a.Title != b.Title || a.Artist != b.Artist || a.CoverId != b.CoverId || a.Playing != b.Playing || Math.Abs(a.DurationSeconds - b.DurationSeconds) > 0.5) return true;
        var expected = a.PositionSeconds + (a.Playing ? (DateTimeOffset.UtcNow - a.PositionAt).TotalSeconds : 0);
        var actual = b.PositionSeconds + (b.Playing ? (DateTimeOffset.UtcNow - b.PositionAt).TotalSeconds : 0);
        return Math.Abs(expected - actual) > 2;
    }

    private static string FriendlyAppName(string appUserModelId)
    {
        var id = appUserModelId.ToLowerInvariant();
        if (id.Contains("spotify")) return "Spotify";
        if (id.Contains("msedge")) return "Edge";
        if (id.Contains("chrome")) return "Chrome";
        if (id.Contains("firefox")) return "Firefox";
        if (id.Contains("brave")) return "Brave";
        if (id.Contains("opera")) return "Opera";
        var name = appUserModelId.Split('!', '\\', '/').Last();
        return name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name;
    }
}
