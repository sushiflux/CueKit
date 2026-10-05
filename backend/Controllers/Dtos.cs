using System.ComponentModel.DataAnnotations;
using Deck.Server.Actions;
using Deck.Server.Automation;
using Deck.Server.Data;

namespace Deck.Server.Controllers;

public record ButtonDto(int Id, int PageId, int Row, int Column, string Label, string? Icon, string Color, IReadOnlyList<ActionStep> Actions, string? Hotkey);

public record PageDto(int Id, int? ParentPageId, string Name, IReadOnlyList<ButtonDto> Buttons);

/// <summary>Seitliches OLED-Display. Source: "system" (Windows-Master) oder "obs:Eingangsname". Side: "left" | "right".</summary>
public record SideDisplayDto(
    [Required, StringLength(40, MinimumLength = 1)] string Id,
    [Required] string Side,
    [Required, StringLength(210, MinimumLength = 1)] string Source,
    [StringLength(40)] string? Label = null);

public record SideDisplaysInput([Required] List<SideDisplayDto> Displays);

public record OledInput([Required] string Size);

public record DeckDto(int Id, string Name, int Rows, int Columns, int SortOrder, IReadOnlyList<PageDto> Pages, IReadOnlyList<SideDisplayDto> SideDisplays, string OledSize = "normal");

public record DeckInput(
    [Required, StringLength(80, MinimumLength = 1)] string Name,
    [Range(1, 12)] int Rows,
    [Range(1, 12)] int Columns);

public record PageInput([Required, StringLength(80, MinimumLength = 1)] string Name);

public record FolderInput(
    [Required, StringLength(60, MinimumLength = 1)] string Name,
    [Range(0, 11)] int Row,
    [Range(0, 11)] int Column,
    string? Icon,
    string? Color);

public record ButtonInput(
    [Range(0, 11)] int Row,
    [Range(0, 11)] int Column,
    [StringLength(60)] string? Label,
    [StringLength(120)] string? Icon,
    [StringLength(24)] string? Color,
    List<ActionStep>? Actions,
    // Tastenkuerzel: null = unveraendert lassen, "" = Kuerzel entfernen.
    [StringLength(60)] string? Hotkey = null);

public record MoveInput(int? PageId, [Range(0, 11)] int Row, [Range(0, 11)] int Column);

public record AutomationDto(int Id, string Name, bool Enabled, int? ButtonId, AutomationPart Trigger, IReadOnlyList<AutomationPart> Conditions, IReadOnlyList<ActionStep> Actions, AutomationRunInfo? LastRun);

public record AutomationInput(
    [Required, StringLength(80, MinimumLength = 1)] string Name,
    bool Enabled,
    // Gesetzt = diese Automation gehoert zur angegebenen Taste (nur zusammen mit Trigger "button.pressed" erlaubt).
    int? ButtonId,
    [Required] AutomationPart Trigger,
    List<AutomationPart>? Conditions,
    List<ActionStep>? Actions);

public record DeviceDto(int Id, string Name, DeviceRole Role, DateTimeOffset CreatedAt, DateTimeOffset? LastSeenAt, bool IsCurrent);

public record DeviceUpdateInput([StringLength(60, MinimumLength = 1)] string? Name, DeviceRole? Role);

public record BootstrapInput([Required, StringLength(60, MinimumLength = 1)] string DeviceName);

public record PairInput([Required, StringLength(20)] string Code, [Required, StringLength(60, MinimumLength = 1)] string DeviceName);

public record ObsSettingsInput([Required, StringLength(253, MinimumLength = 1)] string Host, [Range(1, 65535)] int Port, [StringLength(200)] string? Password, bool ClearPassword);

public record GeneralSettingsInput([StringLength(253)] string? PublicHost);

public record SystemVolumeInput([Range(0, 100)] int Percent);
