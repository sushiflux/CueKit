namespace Deck.Server.Obs;

public enum ObsConnectionStatus { Disconnected, Connecting, Connected }

public record ObsSceneItem(int Id, string SourceName, bool Enabled, bool IsGroup);

public record ObsScene(string Name, IReadOnlyList<ObsSceneItem> Items);

/// <summary>Audiofaehige Quelle. VolumeDb: -100 (stumm/Regler ganz unten) bis 0 (voll).</summary>
public record ObsAudioInput(string Name, bool Muted, double VolumeDb);

/// <summary>Jede Quelle (Input) mit ihrer Art, z.B. "browser_source", "ffmpeg_source".</summary>
public record ObsInput(string Name, string Kind);

public record ObsMediaInput(string Name, bool Playing);

/// <summary>Ein Filter einer Quelle oder Szene ("obs.filter"-Aktion) mit seinem Live-Ein/Aus-Zustand.</summary>
public record ObsSourceFilter(string Source, string FilterName, bool Enabled);

/// <summary>
/// Unveraenderlicher Schnappschuss des OBS-Zustands - wird komplett an alle Clients gepusht,
/// sobald sich etwas aendert (klein genug, dass Diffs den Aufwand nicht lohnen).
/// </summary>
public record ObsSnapshot(
    ObsConnectionStatus Status,
    string? Error,
    string? ObsVersion,
    string? ProgramScene,
    DateTimeOffset? ProgramSceneSince,
    string? PreviewScene,
    bool StudioMode,
    IReadOnlyList<ObsScene> Scenes,
    IReadOnlyList<ObsAudioInput> AudioInputs,
    IReadOnlyList<ObsInput> Inputs,
    IReadOnlyList<ObsMediaInput> MediaInputs,
    IReadOnlyList<ObsSourceFilter> Filters,
    IReadOnlyList<string> Transitions,
    string? CurrentTransition,
    IReadOnlyList<string> SceneCollections,
    string? CurrentSceneCollection,
    IReadOnlyList<string> Profiles,
    string? CurrentProfile,
    bool Streaming,
    DateTimeOffset? StreamStartedAt,
    bool Recording,
    bool RecordPaused,
    DateTimeOffset? RecordStartedAt,
    bool ReplayBuffer,
    bool VirtualCam)
{
    public static readonly ObsSnapshot Empty = new(
        ObsConnectionStatus.Disconnected, null, null, null, null, null, false,
        [], [], [], [], [], [], null, [], null, [], null,
        false, null, false, false, null, false, false);
}
