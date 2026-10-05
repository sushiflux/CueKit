using System.Text.Json.Nodes;

namespace Deck.Server.Obs;

/// <summary>Eine aufgenommene Audiospur (1-6); Name nur, wenn in OBS ein eigener vergeben wurde.</summary>
public record AudioTrackInfo(int Number, string? Name);

/// <summary>Aufnahme-Einstellungen des aktiven OBS-Profils: Codec, Container-Format und aufgenommene Audiospuren.</summary>
public record RecordSettingsInfo(string Codec, string Format, IReadOnlyList<AudioTrackInfo> Tracks);

/// <summary>
/// Stream-Einstellungen des aktiven OBS-Profils. Bei Enhanced Broadcasting waehlt der Dienst (Twitch) Codec und Videospuren selbst -
/// dann gibt es keinen festen Codec, nur das Bandbreiten-Limit (null = automatisch).
/// </summary>
public record StreamSettingsInfo(string? Codec, bool Enhanced, int? MaxKbps, int? MaxVideoTracks);

/// <summary>Liest Aufnahme-/Stream-Einstellungen aus dem OBS-Profil (obs-websocket "GetProfileParameter") und uebersetzt Encoder-Kennungen.</summary>
public static class ObsOutputInfo
{
    public static async Task<RecordSettingsInfo?> ReadRecordAsync(Func<string, string, Task<string?>> param)
    {
        var advanced = string.Equals(await param("Output", "Mode"), "Advanced", StringComparison.OrdinalIgnoreCase);
        string? encoderId, format;
        int mask;
        if (advanced)
        {
            var ffmpeg = string.Equals(await param("AdvOut", "RecType"), "FFmpeg", StringComparison.OrdinalIgnoreCase);
            if (ffmpeg)
            {
                encoderId = await param("AdvOut", "FFVEncoder");
                format = await param("AdvOut", "FFFormat");
                mask = ParseInt(await param("AdvOut", "FFAudioMixes"), 1);
                if (string.IsNullOrWhiteSpace(encoderId)) encoderId = "FFmpeg";
            }
            else
            {
                encoderId = await param("AdvOut", "RecEncoder");
                // "none" = dieselbe Kodierung wie der Stream
                if (string.IsNullOrWhiteSpace(encoderId) || encoderId.Equals("none", StringComparison.OrdinalIgnoreCase)) encoderId = await param("AdvOut", "Encoder");
                format = await param("AdvOut", "RecFormat2") ?? await param("AdvOut", "RecFormat");
                mask = ParseInt(await param("AdvOut", "RecTracks"), 1);
            }
        }
        else
        {
            // Einfacher Modus: "Wie Stream" nutzt den Stream-Encoder, sonst den Aufnahme-Encoder.
            var quality = await param("SimpleOutput", "RecQuality");
            encoderId = string.Equals(quality, "Stream", StringComparison.OrdinalIgnoreCase)
                ? await param("SimpleOutput", "StreamEncoder")
                : await param("SimpleOutput", "RecEncoder");
            if (string.Equals(quality, "Lossless", StringComparison.OrdinalIgnoreCase)) encoderId = "Lossless";
            format = await param("SimpleOutput", "RecFormat2") ?? await param("SimpleOutput", "RecFormat");
            mask = ParseInt(await param("SimpleOutput", "RecTracks"), 1);
        }

        var tracks = new List<AudioTrackInfo>();
        for (var n = 1; n <= 6; n++)
        {
            if ((mask & (1 << (n - 1))) == 0) continue;
            string? name = advanced ? await param("AdvOut", $"Track{n}Name") : null;
            tracks.Add(new AudioTrackInfo(n, string.IsNullOrWhiteSpace(name) ? null : name.Trim()));
        }
        return new RecordSettingsInfo(EncoderName(encoderId), FormatName(format), tracks);
    }

    public static async Task<StreamSettingsInfo> ReadStreamAsync(Func<string, string, Task<string?>> param)
    {
        var enhanced = string.Equals(await param("Stream1", "EnableMultitrackVideo"), "true", StringComparison.OrdinalIgnoreCase);
        var advanced = string.Equals(await param("Output", "Mode"), "Advanced", StringComparison.OrdinalIgnoreCase);
        var encoderId = advanced ? await param("AdvOut", "Encoder") : await param("SimpleOutput", "StreamEncoder");
        int? maxKbps = null, maxTracks = null;
        if (enhanced)
        {
            if (!string.Equals(await param("Stream1", "MultitrackVideoMaximumAggregateBitrateAuto"), "true", StringComparison.OrdinalIgnoreCase))
                maxKbps = ParseInt(await param("Stream1", "MultitrackVideoMaximumAggregateBitrate"), 0) is > 0 and var k ? k : null;
            if (!string.Equals(await param("Stream1", "MultitrackVideoMaximumVideoTracksAuto"), "true", StringComparison.OrdinalIgnoreCase))
                maxTracks = ParseInt(await param("Stream1", "MultitrackVideoMaximumVideoTracks"), 0) is > 0 and var t ? t : null;
        }
        return new StreamSettingsInfo(enhanced || string.IsNullOrWhiteSpace(encoderId) ? null : EncoderName(encoderId), enhanced, maxKbps, maxTracks);
    }

    /// <summary>Liest einen Profilwert; ein nicht vorhandener Wert (oder ein Fehler) ergibt null.</summary>
    public static Func<string, string, Task<string?>> ProfileReader(ObsService obs, CancellationToken ct) => async (category, name) =>
    {
        try
        {
            var response = await obs.RequestAsync("GetProfileParameter", new { parameterCategory = category, parameterName = name }, ct);
            return response?["parameterValue"] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
        }
        catch (OperationCanceledException) { throw; }
        catch { return null; }
    };

    private static int ParseInt(string? s, int fallback) => int.TryParse(s, out var n) ? n : fallback;

    /// <summary>Encoder-Kennung (z.B. "obs_nvenc_av1_tex", "nvenc_hevc", "obs_x264") als "AV1 · NVIDIA NVENC".</summary>
    public static string EncoderName(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return "unbekannt";
        var s = id.ToLowerInvariant();
        if (s is "lossless") return "Verlustfrei";
        var codec = s.Contains("av1") ? "AV1" : s.Contains("hevc") || s.Contains("h265") ? "HEVC" : "H.264";
        string? backend =
            s.Contains("nvenc") ? "NVIDIA NVENC" :
            s.Contains("amf") || s.StartsWith("amd") ? "AMD AMF" :
            s.Contains("qsv") ? "Intel QSV" :
            s.Contains("apple") || s.Contains("videotoolbox") ? "Apple VideoToolbox" :
            s.Contains("x264") ? "x264 (Software)" :
            s.Contains("svt") || s.Contains("aom") || s.Contains("rav1e") ? "Software" :
            null;
        if (backend is null) return id; // unbekannter (z.B. FFmpeg-)Encoder: Kennung unveraendert
        return s.Contains("x264") ? "H.264 · x264" : $"{codec} · {backend}";
    }

    public static string FormatName(string? format) => (format ?? "").Trim().ToLowerInvariant() switch
    {
        "" => "—",
        "hybrid_mp4" => "Hybrid MP4",
        "fragmented_mp4" => "Fragmentiertes MP4",
        "fragmented_mov" => "Fragmentiertes MOV",
        "mkv" or "matroska" => "MKV",
        "mp4" => "MP4",
        "mov" => "MOV",
        "flv" => "FLV",
        "ts" or "mpegts" => "MPEG-TS",
        "m3u8" or "hls" => "HLS",
        var other => other.ToUpperInvariant(),
    };
}
