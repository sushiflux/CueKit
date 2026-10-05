using System.Text.Json.Nodes;
using Deck.Server.Auth;
using Deck.Server.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Deck.Server.Obs;

/// <summary>
/// Leistungswerte von OBS waehrend einer Aufnahme (obs-websocket "GetStats"): CPU-Last, Bildrate, verworfene Frames
/// (Encoding- und Render-Lag) und freier Speicher auf dem Aufnahme-Laufwerk.
/// </summary>
public record ObsStats(
    double CpuUsage,
    double MemoryUsageMb,
    double AvailableDiskSpaceMb,
    double ActiveFps,
    double AverageFrameRenderTimeMs,
    int RenderSkippedFrames,
    int RenderTotalFrames,
    int OutputSkippedFrames,
    int OutputTotalFrames,
    /// <summary>Bisher geschriebene Bytes der laufenden Aufnahme (GetRecordStatus).</summary>
    long OutputBytes = 0,
    /// <summary>Aufnahmeordner laut OBS (GetRecordDirectory).</summary>
    string? RecordDirectory = null,
    /// <summary>Datei, in die gerade aufgenommen wird: exakt per RecordFileChanged, sonst die neueste Datei im Aufnahmeordner (nur wenn der Ordner hier lesbar ist).</summary>
    string? RecordPath = null,
    /// <summary>Leinwand (Basis-Aufloesung) und Ausgabe-Aufloesung sowie Soll-Bildrate laut OBS (GetVideoSettings).</summary>
    int BaseWidth = 0,
    int BaseHeight = 0,
    int OutputWidth = 0,
    int OutputHeight = 0,
    double TargetFps = 0,
    /// <summary>Aufnahme-Einstellungen (Codec, Format, Audiospuren) - nur waehrend einer Aufnahme.</summary>
    RecordSettingsInfo? Record = null,
    /// <summary>Stream-Einstellungen (Codec bzw. Enhanced Broadcasting, Bandbreiten-Limit) - nur waehrend eines Streams.</summary>
    StreamSettingsInfo? StreamSettings = null,
    /// <summary>Tatsaechlich gesendete Bitrate des Streams in kbit/s (aus den gesendeten Bytes) und Netzwerk-Stau 0-1 (GetStreamStatus).</summary>
    double StreamKbps = 0,
    double StreamCongestion = 0)
{
    /// <summary>Liest die Antwort von "GetStats"; fehlende Felder werden zu 0 (aeltere OBS-Versionen).</summary>
    public static ObsStats? FromJson(JsonNode? node)
    {
        if (node is null) return null;
        double D(string key) => node[key] is JsonValue v && v.TryGetValue<double>(out var d) ? d : 0;
        int I(string key) => (int)D(key);
        return new ObsStats(
            Math.Round(D("cpuUsage"), 1),
            Math.Round(D("memoryUsage"), 0),
            Math.Round(D("availableDiskSpace"), 0),
            Math.Round(D("activeFps"), 1),
            Math.Round(D("averageFrameRenderTime"), 1),
            I("renderSkippedFrames"), I("renderTotalFrames"),
            I("outputSkippedFrames"), I("outputTotalFrames"));
    }
}

/// <summary>Frame-Zaehler von OBS zu einem Zeitpunkt (GetStats). OBS zaehlt diese seit dem PROGRAMMSTART, nicht seit Aufnahmebeginn.</summary>
public record ObsCounters(int RenderSkipped, int RenderTotal, int OutputSkipped, int OutputTotal)
{
    public static ObsCounters From(ObsStats s) => new(s.RenderSkippedFrames, s.RenderTotalFrames, s.OutputSkippedFrames, s.OutputTotalFrames);

    /// <summary>Zaehler dieser Aufnahme = aktuell minus Stand beim Aufnahmestart (ist ein Zaehler kleiner als die Basis, hat OBS ihn zurueckgesetzt).</summary>
    public static ObsStats Relative(ObsStats current, ObsCounters baseline)
    {
        static int Delta(int now, int start) => now >= start ? now - start : now;
        return current with
        {
            RenderSkippedFrames = Delta(current.RenderSkippedFrames, baseline.RenderSkipped),
            RenderTotalFrames = Delta(current.RenderTotalFrames, baseline.RenderTotal),
            OutputSkippedFrames = Delta(current.OutputSkippedFrames, baseline.OutputSkipped),
            OutputTotalFrames = Delta(current.OutputTotalFrames, baseline.OutputTotal),
        };
    }
}

/// <summary>
/// Fragt waehrend einer Aufnahme ODER eines Streams alle 2 s die OBS-Leistungswerte (GetStats), die geschriebene Dateigroesse (GetRecordStatus) ab und
/// sendet Aenderungen als "obsStats" an alle Geraete (null, sobald die Aufnahme endet). Aufloesung und Aufnahmeordner werden einmal
/// pro Aufnahme gelesen. Ausserhalb einer Aufnahme wird nichts abgefragt.
/// </summary>
public sealed class ObsStatsService(ObsService obs, IHubContext<DeckHub> hub, ILogger<ObsStatsService> log) : BackgroundService
{
    private static readonly string[] RecordingExtensions = [".mp4", ".mkv", ".mov", ".flv", ".ts", ".m3u8", ".webm", ".fmp4"];

    private volatile ObsStats? _latest;
    private (DateTimeOffset? Record, DateTimeOffset? Stream) _sessionKey;
    private bool _wasActive;
    private RecordSettingsInfo? _recordSettings;
    private StreamSettingsInfo? _streamSettings;
    private (long Bytes, long Ticks)? _lastStreamSample;
    private ObsCounters? _baseline;
    private string? _directory;
    private (int BaseW, int BaseH, int OutW, int OutH, double Fps) _video;

    public ObsStats? Latest => _latest;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var recording = obs.IsConnected && obs.State.Recording;
                var streaming = obs.IsConnected && obs.State.Streaming;
                var active = recording || streaming;
                ObsStats? next = null;
                if (active)
                {
                    var key = (recording ? obs.State.RecordStartedAt : null, streaming ? obs.State.StreamStartedAt : null);
                    if (!_wasActive) _baseline = null; // neue Sitzung (vorher lief nichts): Zaehler-Basis beim ersten Messwert neu setzen
                    if (key != _sessionKey || !_wasActive)
                    {
                        _sessionKey = key;
                        await LoadSessionInfoAsync(recording, streaming, stoppingToken);
                    }
                    _wasActive = true;

                    next = ObsStats.FromJson(await obs.RequestAsync("GetStats", ct: stoppingToken));
                    if (next is not null)
                    {
                        // OBS-Zaehler laufen seit dem Programmstart - fuer diese Sitzung nur die Aenderung seit ihrem Beginn zeigen.
                        _baseline ??= ObsCounters.From(next);
                        next = ObsCounters.Relative(next, _baseline);
                        next = next with { BaseWidth = _video.BaseW, BaseHeight = _video.BaseH, OutputWidth = _video.OutW, OutputHeight = _video.OutH, TargetFps = _video.Fps };

                        if (recording)
                        {
                            var status = await obs.RequestAsync("GetRecordStatus", ct: stoppingToken);
                            var recordPath = obs.RecordPath ?? FindRecordingFile(_directory, obs.State.RecordStartedAt);
                            var encodedBytes = status?["outputBytes"] is JsonValue bytes && bytes.TryGetValue<long>(out var l) ? l : 0;
                            next = next with
                            {
                                // Echte Dateigroesse, wenn die Datei hier lesbar ist; sonst die von OBS gemeldeten Ausgabe-Bytes.
                                OutputBytes = FileLength(recordPath) is { } fileBytes and > 0 ? fileBytes : encodedBytes,
                                RecordDirectory = _directory,
                                RecordPath = recordPath,
                                Record = _recordSettings,
                            };
                        }

                        if (streaming)
                        {
                            var status = await obs.RequestAsync("GetStreamStatus", ct: stoppingToken);
                            var sentBytes = status?["outputBytes"] is JsonValue sb && sb.TryGetValue<long>(out var sl) ? sl : 0;
                            var congestion = status?["outputCongestion"] is JsonValue cv && cv.TryGetValue<double>(out var cd) ? cd : 0;
                            var now = Environment.TickCount64;
                            var kbps = 0d;
                            if (_lastStreamSample is { } last && now > last.Ticks && sentBytes >= last.Bytes)
                                kbps = Math.Round((sentBytes - last.Bytes) * 8d / ((now - last.Ticks) / 1000d) / 1000d);
                            _lastStreamSample = (sentBytes, now);
                            next = next with { StreamSettings = _streamSettings, StreamKbps = kbps, StreamCongestion = Math.Round(congestion, 3) };
                        }
                        else _lastStreamSample = null;
                    }
                }
                else
                {
                    _sessionKey = default;
                    _wasActive = false;
                    _lastStreamSample = null;
                }

                if (next != _latest)
                {
                    _latest = next;
                    await hub.Clients.All.SendAsync("obsStats", next, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                log.LogDebug(ex, "OBS-Leistungswerte konnten nicht gelesen werden.");
            }

            try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task LoadSessionInfoAsync(bool recording, bool streaming, CancellationToken ct)
    {
        var param = ObsOutputInfo.ProfileReader(obs, ct);
        try { _recordSettings = recording ? await ObsOutputInfo.ReadRecordAsync(param) : null; }
        catch (Exception ex) when (ex is not OperationCanceledException) { log.LogDebug(ex, "Aufnahme-Einstellungen konnten nicht gelesen werden."); _recordSettings = null; }
        try { _streamSettings = streaming ? await ObsOutputInfo.ReadStreamAsync(param) : null; }
        catch (Exception ex) when (ex is not OperationCanceledException) { log.LogDebug(ex, "Stream-Einstellungen konnten nicht gelesen werden."); _streamSettings = null; }

        try
        {
            var video = await obs.RequestAsync("GetVideoSettings", ct: ct);
            if (video is not null)
            {
                int I(string k) => video[k] is JsonValue v && v.TryGetValue<double>(out var d) ? (int)d : 0;
                var den = Math.Max(1, I("fpsDenominator"));
                _video = (I("baseWidth"), I("baseHeight"), I("outputWidth"), I("outputHeight"), Math.Round((double)I("fpsNumerator") / den, 2));
            }
        }
        catch (Exception ex) { log.LogDebug(ex, "Videoeinstellungen konnten nicht gelesen werden."); _video = default; }

        try { _directory = (await obs.RequestAsync("GetRecordDirectory", ct: ct))?["recordDirectory"]?.GetValue<string>(); }
        catch (Exception ex) { log.LogDebug(ex, "Aufnahmeordner konnte nicht gelesen werden."); _directory = null; }
    }

    private static long? FileLength(string? path)
    {
        try { return !string.IsNullOrEmpty(path) && File.Exists(path) ? new FileInfo(path).Length : null; }
        catch { return null; }
    }

    /// <summary>
    /// Best effort, wenn OBS den Dateipfad nicht meldet: die neueste Aufnahmedatei im Ordner, die nach dem Start der Aufnahme angelegt wurde.
    /// Funktioniert nur, wenn der Ordner auf diesem Rechner lesbar ist (OBS und CueKit auf demselben PC); sonst null.
    /// </summary>
    public static string? FindRecordingFile(string? directory, DateTimeOffset? startedAt)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory) || startedAt is null) return null;
            var since = startedAt.Value.UtcDateTime.AddSeconds(-10);
            return new DirectoryInfo(directory).EnumerateFiles()
                .Where(f => RecordingExtensions.Contains(f.Extension, StringComparer.OrdinalIgnoreCase) && f.CreationTimeUtc >= since)
                .OrderByDescending(f => f.CreationTimeUtc)
                .FirstOrDefault()?.FullName;
        }
        catch { return null; }
    }
}

[ApiController]
[Route("api/obs-stats")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class ObsStatsController(ObsStatsService stats) : ControllerBase
{
    /// <summary>Aktueller Stand fuer den ersten Ladezustand; 204 = es laeuft keine Aufnahme.</summary>
    [HttpGet]
    public IActionResult Get() => stats.Latest is { } latest ? Ok(latest) : NoContent();
}
