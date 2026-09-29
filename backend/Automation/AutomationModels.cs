using System.Text.Json.Nodes;
using Deck.Server.Actions;

namespace Deck.Server.Automation;

/// <summary>Ausloeser bzw. Bedingung - gleicher Aufbau wie ein Aktionsschritt (Typ + Parameter).</summary>
public record AutomationPart(string Type, JsonObject? Params)
{
    public ActionStep AsStep() => new(Type, Params);
}

public record AutomationRunInfo(DateTimeOffset At, bool Ok, string? Error);

public static class AutomationCatalog
{
    private static readonly FieldOption[] YesNo = [new("true", "Ja"), new("false", "Nein")];

    public static readonly IReadOnlyList<ActionDefinition> Triggers =
    [
        new("button.pressed", "Auslöser", "Diese Taste wurde gedrückt", "Feuert, nachdem die Sofort-Aktionen dieser Taste vollständig ausgeführt wurden. Nur für Automationen, die an eine Taste gebunden sind.", "tabler:hand-click",
            []),
        new("obs.sceneChanged", "Auslöser", "Szene wurde gewechselt", "Wenn live auf eine bestimmte (oder beliebige) Szene gewechselt wird.", "tabler:layout-board",
            [new("scene", "Szene (leer = jede)", FieldKind.Scene, Required: false)]),
        new("obs.sceneActiveFor", "Auslöser", "Szene läuft seit …", "Wenn eine Szene eine bestimmte Zeit ununterbrochen live ist - z.B. nach 5 Minuten automatisch weiterschalten.", "tabler:clock-play",
            [new("scene", "Szene", FieldKind.Scene), new("seconds", "Sekunden", FieldKind.Number, Default: "300")]),
        new("obs.streamStarted", "Auslöser", "Stream gestartet", "Sobald der Stream live geht.", "tabler:broadcast", []),
        new("obs.streamStopped", "Auslöser", "Stream beendet", "Sobald der Stream endet.", "tabler:broadcast-off", []),
        new("obs.recordStarted", "Auslöser", "Aufnahme gestartet", "Sobald eine Aufnahme startet.", "tabler:player-record", []),
        new("obs.recordStopped", "Auslöser", "Aufnahme beendet", "Sobald eine Aufnahme endet.", "tabler:player-stop", []),
        new("schedule.interval", "Auslöser", "Regelmäßig", "Wiederholt sich in einem festen Abstand.", "tabler:repeat",
            [new("seconds", "Alle … Sekunden", FieldKind.Number, Default: "600")]),
    ];

    public static readonly IReadOnlyList<ActionDefinition> Conditions =
    [
        new("obs.currentSceneIs", "Bedingung", "Aktuelle Szene ist", "Nur ausführen, wenn gerade diese Szene live ist.", "tabler:layout-board",
            [new("scene", "Szene", FieldKind.Scene)]),
        new("obs.currentSceneIsNot", "Bedingung", "Aktuelle Szene ist nicht", "Nur ausführen, wenn gerade NICHT diese Szene live ist.", "tabler:layout-board-split",
            [new("scene", "Szene", FieldKind.Scene)]),
        new("obs.isStreaming", "Bedingung", "Stream läuft", "Nur ausführen, wenn der Stream (nicht) läuft.", "tabler:broadcast",
            [new("value", "Stream läuft", FieldKind.Select, Options: YesNo, Default: "true")]),
        new("obs.isRecording", "Bedingung", "Aufnahme läuft", "Nur ausführen, wenn (k)eine Aufnahme läuft.", "tabler:player-record",
            [new("value", "Aufnahme läuft", FieldKind.Select, Options: YesNo, Default: "true")]),
    ];
}
