namespace Deck.Server.Obs;

public enum ObsConnectionStatus { Disconnected, Connecting, Connected }

public record ObsSceneItem(int Id, string SourceName, bool Enabled, bool IsGroup);

public record ObsScene(string Name, IReadOnlyList<ObsSceneItem> Items);

public record ObsAudioInput(string Name, bool Muted);

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
    bool Streaming,
    DateTimeOffset? StreamStartedAt,
    bool Recording,
    bool RecordPaused,
    DateTimeOffset? RecordStartedAt,
    bool ReplayBuffer,
    bool VirtualCam)
{
    public static readonly ObsSnapshot Empty = new(
        ObsConnectionStatus.Disconnected, null, null, null, null, null, false, [], [], false, null, false, false, null, false, false);
}
