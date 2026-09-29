using Deck.Server.Hardware;

namespace Deck.Server.Actions;

/// <summary>
/// Alle eingebauten Aktionen. Die Kategorie ("OBS · Audio" usw.) steuert die Gruppierung im Editor.
/// Plugin-Aktionen kommen zur Laufzeit ueber den PluginHost dazu (Kategorie = Plugin-Name).
/// </summary>
public static class ActionCatalog
{
    public const string ObsScenes = "OBS · Szenen";
    public const string ObsSources = "OBS · Quellen";
    public const string ObsAudio = "OBS · Audio";
    public const string ObsMedia = "OBS · Medien";
    public const string ObsOutputs = "OBS · Ausgaben";
    public const string ObsStudio = "OBS · Studio & Übergänge";
    public const string ObsProfiles = "OBS · Profile & Sammlungen";
    public const string ObsAdvanced = "OBS · Erweitert";
    public const string Deck = "Deck";
    public const string Automation = "Automation";
    public const string Flow = "Ablauf";
    public const string System = "System";

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

    private static readonly FieldOption[] VolumeModes =
    [
        new("up", "Lauter"), new("down", "Leiser"), new("set", "Auf festen Wert setzen"),
    ];

    private static readonly FieldOption[] MediaModes =
    [
        new("playpause", "Abspielen/Pause"), new("play", "Abspielen"), new("pause", "Pause"), new("stop", "Stopp"),
        new("restart", "Von vorn"), new("next", "Nächstes"), new("previous", "Vorheriges"),
    ];

    private static readonly FieldOption[] SystemMonitorMetrics =
    [
        new(SystemMetric.CpuLoad, "CPU-Auslastung"),
        new(SystemMetric.CpuTemp, "CPU-Temperatur"),
        new(SystemMetric.GpuLoad, "GPU-Auslastung"),
        new(SystemMetric.GpuTemp, "GPU-Temperatur"),
        new(SystemMetric.RamLoad, "RAM-Auslastung"),
    ];

    public static readonly IReadOnlyList<ActionDefinition> BuiltIn =
    [
        // --- Szenen ---
        new("obs.scene.switch", ObsScenes, "Szene wechseln", "Schaltet live auf eine Szene um.", "tabler:layout-board",
            [new("scene", "Szene", FieldKind.Scene)], "violet"),
        new("obs.scene.preview", ObsScenes, "Szene in Vorschau", "Legt eine Szene im Studio-Modus in die Vorschau.", "tabler:eye",
            [new("scene", "Szene", FieldKind.Scene)], "indigo"),

        // --- Quellen ---
        new("obs.source.visibility", ObsSources, "Quelle ein/aus", "Blendet eine Quelle in einer Szene ein oder aus.", "tabler:photo",
            [new("scene", "Szene", FieldKind.Scene), new("source", "Quelle", FieldKind.SceneItem),
             new("mode", "Modus", FieldKind.Select, Options: VisibilityModes, Default: "toggle")], "sky"),
        new("obs.filter", ObsSources, "Filter ein/aus", "Schaltet einen Filter einer Quelle oder Szene an oder aus.", "tabler:filter",
            [new("source", "Quelle/Szene", FieldKind.Source), new("filter", "Filter", FieldKind.Filter),
             new("mode", "Modus", FieldKind.Select, Options: ToggleModes, Default: "toggle")], "sky"),
        new("obs.source.refresh", ObsSources, "Browserquelle neu laden", "Lädt eine Browserquelle neu (z.B. Alerts, Overlays).", "tabler:refresh",
            [new("input", "Browserquelle", FieldKind.BrowserInput)], "sky"),

        // --- Audio ---
        new("obs.audio.mute", ObsAudio, "Stumm / Ton an", "Schaltet eine Audioquelle stumm oder laut.", "tabler:microphone",
            [new("input", "Audioquelle", FieldKind.AudioInput),
             new("mode", "Modus", FieldKind.Select, Options: MuteModes, Default: "toggle")], "emerald"),
        new("obs.audio.volume", ObsAudio, "Lautstärke", "Macht eine Audioquelle lauter, leiser oder setzt sie auf einen festen Wert.", "tabler:volume",
            [new("input", "Audioquelle", FieldKind.AudioInput),
             new("mode", "Modus", FieldKind.Select, Options: VolumeModes, Default: "up"),
             new("step", "Schritt in dB (lauter/leiser)", FieldKind.Number, Required: false, Default: "3"),
             new("value", "Zielwert in dB (0 = voll, -60 = sehr leise)", FieldKind.Number, Required: false, Default: "-10")], "emerald"),

        // --- Medien ---
        new("obs.media", ObsMedia, "Medien steuern", "Abspielen, Pause, Stopp, von vorn - für Medien- und VLC-Quellen.", "tabler:player-play",
            [new("input", "Medienquelle", FieldKind.MediaInput),
             new("mode", "Aktion", FieldKind.Select, Options: MediaModes, Default: "playpause")], "pink"),

        // --- Ausgaben ---
        new("obs.stream", ObsOutputs, "Stream", "Stream starten oder beenden.", "tabler:broadcast",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "red"),
        new("obs.record", ObsOutputs, "Aufnahme", "Aufnahme starten oder beenden.", "tabler:player-record",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "rose"),
        new("obs.record.pause", ObsOutputs, "Aufnahme pausieren", "Pausiert die laufende Aufnahme oder setzt sie fort.", "tabler:player-pause",
            [], "amber"),
        new("obs.record.chapter", ObsOutputs, "Kapitelmarke setzen", "Setzt eine Kapitelmarke in der laufenden Aufnahme (Hybrid-MP4, OBS ≥ 30.2).", "tabler:bookmark",
            [new("name", "Kapitelname (optional)", FieldKind.Text, Required: false)], "rose"),
        new("obs.record.split", ObsOutputs, "Aufnahme teilen", "Beginnt eine neue Aufnahmedatei, ohne die Aufnahme zu stoppen.", "tabler:scissors",
            [], "rose"),
        new("obs.replay", ObsOutputs, "Replay-Puffer", "Replay-Puffer starten oder beenden.", "tabler:history",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "orange"),
        new("obs.replay.save", ObsOutputs, "Replay speichern", "Speichert die letzten Sekunden des Replay-Puffers.", "tabler:device-floppy",
            [], "orange"),
        new("obs.vcam", ObsOutputs, "Virtuelle Kamera", "Virtuelle Kamera starten oder beenden.", "tabler:camera",
            [new("mode", "Modus", FieldKind.Select, Options: OutputModes, Default: "toggle")], "teal"),

        // --- Studio & Uebergaenge ---
        new("obs.studio", ObsStudio, "Studio-Modus", "Studio-Modus ein- oder ausschalten.", "tabler:layout-columns",
            [new("mode", "Modus", FieldKind.Select, Options: ToggleModes, Default: "toggle")], "indigo"),
        new("obs.studio.transition", ObsStudio, "Übergang auslösen", "Bringt die Vorschau im Studio-Modus live.", "tabler:arrows-exchange",
            [], "indigo"),
        new("obs.transition.set", ObsStudio, "Übergang wählen", "Legt den Szenenübergang fest (z.B. Schnitt, Überblenden).", "tabler:transition-right",
            [new("transition", "Übergang", FieldKind.Transition),
             new("duration", "Dauer in ms (optional)", FieldKind.Number, Required: false)], "indigo"),

        // --- Profile & Sammlungen ---
        new("obs.collection", ObsProfiles, "Szenensammlung wechseln", "Lädt eine andere Szenensammlung.", "tabler:stack-2",
            [new("collection", "Szenensammlung", FieldKind.SceneCollection)], "teal"),
        new("obs.profile", ObsProfiles, "Profil wechseln", "Wechselt das OBS-Profil (Ausgabe-/Stream-Einstellungen).", "tabler:user-cog",
            [new("profile", "Profil", FieldKind.Profile)], "teal"),

        // --- Erweitert ---
        new("obs.hotkey", ObsAdvanced, "OBS-Hotkey", "Löst einen OBS-Hotkey über seinen internen Namen aus.", "tabler:keyboard",
            [new("name", "Hotkey-Name", FieldKind.Text)], "slate"),

        // --- Deck-Navigation (wird im Client ausgefuehrt) ---
        new("deck.openPage", Deck, "Ordner öffnen", "Öffnet einen Ordner bzw. eine andere Seite.", "tabler:folder",
            [new("page", "Seite", FieldKind.Page)], "amber"),
        new("deck.back", Deck, "Zurück", "Geht eine Ordner-Ebene zurück.", "tabler:arrow-back-up", [], "slate"),
        new("deck.home", Deck, "Startseite", "Springt zur Startseite des Decks.", "tabler:home", [], "slate"),

        // --- Automation ---
        new("automation.toggle", Automation, "Automation an/aus", "Schaltet eine Automation ein oder aus.", "tabler:route",
            [new("automation", "Automation", FieldKind.Automation),
             new("mode", "Modus", FieldKind.Select, Options: ToggleModes, Default: "toggle")], "violet"),

        // --- Ablauf ---
        new("flow.delay", Flow, "Warten", "Wartet eine Zeit, bevor der nächste Schritt läuft.", "tabler:hourglass",
            [new("ms", "Millisekunden", FieldKind.Number, Default: "1000")], "slate"),

        // --- System (nur nativ unter Windows - siehe Hardware/SystemVolumeService.cs, Hardware/SystemMonitorService.cs) ---
        new("system.volume", System, "Systemlautstärke", "Windows-Master-Lautstärke lauter, leiser oder auf einen festen Wert (nicht die OBS-Audioquellen).", "tabler:volume",
            [new("mode", "Modus", FieldKind.Select, Options: VolumeModes, Default: "up"),
             new("step", "Schritt in % (lauter/leiser)", FieldKind.Number, Required: false, Default: "5"),
             new("value", "Zielwert in % (0-100)", FieldKind.Number, Required: false, Default: "50")], "cyan"),
        new("system.mute", System, "Systemlautstärke stumm", "Schaltet die Windows-Master-Lautstärke stumm oder laut.", "tabler:volume-3",
            [new("mode", "Modus", FieldKind.Select, Options: MuteModes, Default: "toggle")], "cyan"),
        new("system.browser.open", System, "Browser öffnen", "Öffnet eine fest hinterlegte Adresse im Standardbrowser.", "tabler:world",
            [new("url", "Adresse (http/https)", FieldKind.Url)], "cyan"),
        new("system.monitor.display", System, "System-Wert anzeigen", "Zeigt einen Live-Systemwert auf der Kachel an (kein Auslöser).", "tabler:activity",
            [new("metric", "Kennwert", FieldKind.Select, Options: SystemMonitorMetrics, Default: SystemMetric.CpuLoad)], "cyan", DisplayOnly: true),
    ];

    /// <summary>Aktionen, die nur im Client (Navigation) wirken und serverseitig ignoriert werden.</summary>
    public static bool IsClientSide(string type) => type.StartsWith("deck.", StringComparison.Ordinal);

    /// <summary>Reine Anzeige-Kacheln ohne Ausloese-Verhalten - der Client rendert einen Live-Wert
    /// statt eines Klick-Buttons; serverseitig gibt es dafuer nichts auszufuehren. Liest das
    /// DisplayOnly-Flag aus der ActionDefinition, damit es nur eine Quelle der Wahrheit gibt.</summary>
    public static bool IsDisplayOnly(string type) => BuiltIn.FirstOrDefault(d => d.Type == type)?.DisplayOnly ?? false;
}
