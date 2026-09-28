namespace Deck.Server.Actions;

/// <summary>Alle eingebauten Aktionen. Plugin-Aktionen kommen zur Laufzeit ueber den PluginHost dazu.</summary>
public static class ActionCatalog
{
    private static readonly FieldOption[] ToggleModes =
    [
        new("toggle", "Umschalten"), new("on", "Einschalten"), new("off", "Ausschalten"),
    ];

    private static readonly FieldOption[] OutputModes =
    [
        new("toggle", "Start/Stopp umschalten"), new("on", "Starten"), new("off", "Stoppen"),
    ];

    private static readonly FieldOption[] VisibilityModes =
    [
        new("toggle", "Umschalten"), new("on", "Einblenden"), new("off", "Ausblenden"),
    ];

    private static readonly FieldOption[] MuteModes =
    [
        new("toggle", "Umschalten"), new("on", "Stummschalten"), new("off", "Ton an"),
    ];

    public static readonly IReadOnlyList<ActionDefinition> BuiltIn =
    [
        // --- OBS: Szenen ---
        new("obs.scene.switch", "OBS", "Szene wechseln", "Schaltet live auf eine Szene um.", "tabler:layout-board",
            [new("scene", "Szene", FieldKind.Scene)], "violet"),
        new("obs.scene.preview", "OBS", "Szene in Vorschau", "Legt eine Szene im Studio-Modus in die Vorschau.", "tabler:eye",
            [new("scene", "Szene", FieldKind.Scene)], "indigo"),
        new("obs.studio.transition", "OBS", "Übergang auslösen", "Bringt die Vorschau im Studio-Modus live.", "tabler:arrows-exchange",
            [], "indigo"),
        new("obs.studio", "OBS", "Studio-Modus", "Studio-Modus ein- oder ausschalten.", "tabler:layout-columns",
            [new("mode", "Modus", FieldKind.Select, Options: ToggleModes, Default: "toggle")], "indigo"),

        // --- OBS: Quellen & Audio ---
        new("obs.source.visibility", "OBS", "Quelle ein/aus", "Blendet eine Quelle in einer Szene ein oder aus.", "tabler:photo",
            [new("scene", "Szene", FieldKind.Scene), new("source", "Quelle", FieldKind.SceneItem),
             new("mode", "Modus", FieldKind.Select, Options: VisibilityModes, Default: "toggle")], "sky"),
        new("obs.audio.mute", "OBS", "Audio stumm", "Schaltet eine Audioquelle stumm oder laut.", "tabler:microphone",
            [new("input", "Audioquelle", FieldKind.AudioInput),
             new("mode", "Modus", FieldKind.Select, Options: MuteModes, Default: "toggle")], "emerald"),

        // --- OBS: Ausgaben ---
        new("obs.stream", "OBS", "Stream", "Stream starten oder beenden.", "tabler:broadcast",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "red"),
        new("obs.record", "OBS", "Aufnahme", "Aufnahme starten oder beenden.", "tabler:player-record",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "rose"),
        new("obs.record.pause", "OBS", "Aufnahme pausieren", "Pausiert die laufende Aufnahme oder setzt sie fort.", "tabler:player-pause",
            [], "amber"),
        new("obs.replay", "OBS", "Replay-Puffer", "Replay-Puffer starten oder beenden.", "tabler:history",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "orange"),
        new("obs.replay.save", "OBS", "Replay speichern", "Speichert die letzten Sekunden des Replay-Puffers.", "tabler:device-floppy",
            [], "orange"),
        new("obs.vcam", "OBS", "Virtuelle Kamera", "Virtuelle Kamera starten oder beenden.", "tabler:camera",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "teal"),
        new("obs.hotkey", "OBS", "OBS-Hotkey", "Löst einen OBS-Hotkey über seinen internen Namen aus.", "tabler:keyboard",
            [new("name", "Hotkey-Name", FieldKind.Text)], "slate"),

        // --- Deck-Navigation (wird im Client ausgefuehrt) ---
        new("deck.openPage", "Deck", "Ordner öffnen", "Öffnet einen Ordner bzw. eine andere Seite.", "tabler:folder",
            [new("page", "Seite", FieldKind.Page)], "amber"),
        new("deck.back", "Deck", "Zurück", "Geht eine Ordner-Ebene zurück.", "tabler:arrow-back-up", [], "slate"),
        new("deck.home", "Deck", "Startseite", "Springt zur Startseite des Decks.", "tabler:home", [], "slate"),

        // --- Ablauf ---
        new("flow.delay", "Ablauf", "Warten", "Wartet eine Zeit, bevor der nächste Schritt läuft.", "tabler:hourglass",
            [new("ms", "Millisekunden", FieldKind.Number, Default: "1000")], "slate"),
    ];

    /// <summary>Aktionen, die nur im Client (Navigation) wirken und serverseitig ignoriert werden.</summary>
    public static bool IsClientSide(string type) => type.StartsWith("deck.", StringComparison.Ordinal);
}
