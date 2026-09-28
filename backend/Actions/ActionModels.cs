using System.Text.Json.Nodes;

namespace Deck.Server.Actions;

/// <summary>Ein einzelner Schritt einer (Multi-)Aktion, z.B. { type: "obs.scene.switch", params: { scene: "Pause" } }.</summary>
public record ActionStep(string Type, JsonObject? Params)
{
    public string? Str(string key) => Params?[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    public int? Int(string key) => Params?[key] switch
    {
        JsonValue v when v.TryGetValue<int>(out var i) => i,
        JsonValue v when v.TryGetValue<double>(out var d) => (int)d,
        JsonValue v when v.TryGetValue<string>(out var s) && int.TryParse(s, out var p) => p,
        _ => null,
    };

    /// <summary>"toggle" (Standard), "on"/"start" oder "off"/"stop".</summary>
    public string Mode => Str("mode") ?? "toggle";
}

/// <summary>Feldtypen, die der Editor generisch als Formular rendert.</summary>
public static class FieldKind
{
    public const string Scene = "scene";
    public const string SceneItem = "sceneItem";   // benoetigt ein "scene"-Feld im selben Formular
    public const string AudioInput = "audioInput";
    public const string Page = "page";
    public const string Text = "text";
    public const string Number = "number";
    public const string Select = "select";
}

public record FieldOption(string Value, string Label);

public record ActionField(string Key, string Label, string Kind, bool Required = true, IReadOnlyList<FieldOption>? Options = null, string? Default = null);

/// <summary>
/// Beschreibung einer Aktion fuer den Editor. Kommt fuer eingebaute Aktionen aus
/// <see cref="ActionCatalog"/> und fuer Plugin-Aktionen aus der Registrierung des Plugins.
/// </summary>
public record ActionDefinition(
    string Type,
    string Category,
    string Name,
    string Description,
    string Icon,
    IReadOnlyList<ActionField> Fields,
    string? SuggestedColor = null);
