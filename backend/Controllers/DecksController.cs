using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Data;
using Deck.Server.Hubs;
using Deck.Server.Obs;
using Deck.Server.Plugins;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Deck.Server.Services;

namespace Deck.Server.Controllers;

[ApiController]
[Route("api")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public partial class DecksController(AppDbContext db, HubNotifier notifier, ObsService obs, ActionExecutor executor, AutomationEngine automationEngine, SwitchStateService switchStates) : ControllerBase
{
    private const int MaxSteps = 20;

    // ---------- Lesen (alle Geraete) ----------

    [HttpGet("decks")]
    public async Task<IReadOnlyList<DeckDto>> GetDecks()
    {
        var decks = await db.Decks.AsNoTracking()
            .Include(d => d.Pages).ThenInclude(p => p.Buttons)
            .OrderBy(d => d.SortOrder).ThenBy(d => d.Id)
            .AsSplitQuery()
            .ToListAsync();
        return decks.Select(ToDto).ToList();
    }

    [HttpPost("buttons/{id:int}/press")]
    public async Task<IActionResult> Press(int id, CancellationToken ct)
    {
        var button = await db.Buttons.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id, ct);
        if (button is null) return NotFound(new { error = "Button nicht gefunden." });
        try
        {
            var steps = ParseSteps(button.ActionsJson);
            if (steps.Count == 1 && steps[0].Type == "deck.multiSwitch")
            {
                var res = await switchStates.ExecuteSwitchPressAsync(button, steps[0], executor, ct);
                if (!res.Ok) return UnprocessableEntity(new { error = res.Error });
                automationEngine.NotifyButtonPressed(id);
                return NoContent();
            }

            await executor.ExecuteAsync(steps, $"Button '{button.Label}'", ct);
            // Erst NACH erfolgreichem Abschluss der Sofort-Aktionen - feuert selbst im Hintergrund
            // (Task.Run in AutomationEngine.Fire) und blockiert diese Antwort nicht.
            automationEngine.NotifyButtonPressed(id);
            return NoContent();
        }
        catch (ActionExecutionException ex)
        {
            return UnprocessableEntity(new { error = ex.Message });
        }
    }

    // ---------- Decks ----------

    [HttpPost("decks")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<ActionResult<DeckDto>> CreateDeck(DeckInput input)
    {
        var deck = new DeckEntity
        {
            Name = input.Name.Trim(),
            Rows = input.Rows,
            Columns = input.Columns,
            SortOrder = (await db.Decks.MaxAsync(d => (int?)d.SortOrder) ?? -1) + 1,
            Pages = [new PageEntity { Name = "Start" }],
        };
        db.Decks.Add(deck);
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return ToDto(deck);
    }

    [HttpPut("decks/{id:int}")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> UpdateDeck(int id, DeckInput input)
    {
        var deck = await db.Decks.Include(d => d.Pages).ThenInclude(p => p.Buttons).FirstOrDefaultAsync(d => d.Id == id);
        if (deck is null) return NotFound(new { error = "Deck nicht gefunden." });

        var cutOff = deck.Pages.SelectMany(p => p.Buttons).Where(b => b.Row >= input.Rows || b.Column >= input.Columns).ToList();
        if (cutOff.Count > 0)
        {
            var names = string.Join(", ", cutOff.Take(5).Select(b => $"'{(b.Label.Length > 0 ? b.Label : "ohne Namen")}'"));
            return Conflict(new { error = $"Das Raster {input.Rows}×{input.Columns} ist zu klein: {cutOff.Count} Button(s) lägen außerhalb ({names}{(cutOff.Count > 5 ? " …" : "")}). Verschiebe oder lösche sie zuerst." });
        }

        deck.Name = input.Name.Trim();
        deck.Rows = input.Rows;
        deck.Columns = input.Columns;
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    /// <summary>Stellt die Groesse des oberen OLED-Displays ein ("normal" | "large").</summary>
    [HttpPut("decks/{id:int}/oled")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> UpdateOled(int id, OledInput input)
    {
        if (input.Size is not ("normal" or "large")) return BadRequest(new { error = $"Ungültige OLED-Größe '{input.Size}' - erlaubt sind 'normal' und 'large'." });
        var deck = await db.Decks.FirstOrDefaultAsync(d => d.Id == id);
        if (deck is null) return NotFound(new { error = "Deck nicht gefunden." });
        deck.OledSize = input.Size;
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    private const int MaxSideDisplaysPerSide = 3;

    /// <summary>Ersetzt die seitlichen OLED-Displays eines Decks komplett (Reihenfolge = von innen nach aussen).</summary>
    [HttpPut("decks/{id:int}/side-displays")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> UpdateSideDisplays(int id, SideDisplaysInput input)
    {
        var deck = await db.Decks.FirstOrDefaultAsync(d => d.Id == id);
        if (deck is null) return NotFound(new { error = "Deck nicht gefunden." });

        var clean = new List<SideDisplayDto>();
        foreach (var d in input.Displays)
        {
            if (d.Side is not ("left" or "right")) return BadRequest(new { error = $"Ungültige Seite '{d.Side}' - erlaubt sind 'left' und 'right'." });
            var source = d.Source.Trim();
            if (source != "system" && !(source.StartsWith("obs:", StringComparison.Ordinal) && source.Length > 4) && !(source.StartsWith("win:", StringComparison.Ordinal) && source.Length > 4))
                return BadRequest(new { error = $"Ungültige Quelle '{d.Source}' - erwartet 'system', 'obs:<Audioquelle>' oder 'win:<Windows-Gerät>'." });
            var displayId = d.Id.Trim();
            if (clean.Any(c => c.Id == displayId)) return BadRequest(new { error = $"Display-ID '{displayId}' ist doppelt vergeben." });
            clean.Add(new SideDisplayDto(displayId, d.Side, source, string.IsNullOrWhiteSpace(d.Label) ? null : d.Label.Trim()));
        }
        foreach (var side in new[] { "left", "right" })
            if (clean.Count(c => c.Side == side) > MaxSideDisplaysPerSide)
                return BadRequest(new { error = $"Pro Seite sind höchstens {MaxSideDisplaysPerSide} Displays möglich." });

        deck.SideDisplaysJson = JsonSerializer.Serialize(clean, JsonSerializerOptions.Web);
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    /// <summary>Klick auf ein seitliches Display: schaltet dessen Audioquelle stumm bzw. wieder laut.</summary>
    [HttpPost("decks/{id:int}/side-displays/{displayId}/mute")]
    public async Task<IActionResult> ToggleSideDisplayMute(int id, string displayId, CancellationToken ct)
    {
        var deck = await db.Decks.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
        if (deck is null) return NotFound(new { error = "Deck nicht gefunden." });
        var display = ParseSideDisplays(deck.SideDisplaysJson).FirstOrDefault(d => d.Id == displayId);
        if (display is null) return NotFound(new { error = "Display nicht gefunden." });

        var step = display.Source switch
        {
            "system" => Step("system.mute", ("mode", "toggle")),
            var s when s.StartsWith("win:", StringComparison.Ordinal) => Step("system.mute", ("device", s[4..]), ("mode", "toggle")),
            var s => Step("obs.audio.mute", ("input", s[4..]), ("mode", "toggle")),
        };
        try
        {
            await executor.ExecuteAsync([step], $"Display '{display.Label ?? display.Source}'", ct);
            return NoContent();
        }
        catch (ActionExecutionException ex)
        {
            return UnprocessableEntity(new { error = ex.Message });
        }
    }

    [HttpDelete("decks/{id:int}")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> DeleteDeck(int id)
    {
        if (await db.Decks.CountAsync() <= 1)
            return Conflict(new { error = "Das letzte Deck kann nicht gelöscht werden." });
        var deleted = await db.Decks.Where(d => d.Id == id).ExecuteDeleteAsync();
        if (deleted == 0) return NotFound(new { error = "Deck nicht gefunden." });
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    /// <summary>
    /// Fuellt die Startseite eines Decks automatisch aus OBS: Stream, Aufnahme, alle Szenen und
    /// alle Audioquellen - in freie Slots, bestehende Buttons bleiben unangetastet.
    /// </summary>
    [HttpPost("decks/{id:int}/generate-from-obs")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> GenerateFromObs(int id)
    {
        var state = obs.State;
        if (state.Status != ObsConnectionStatus.Connected)
            return Conflict(new { error = "OBS ist nicht verbunden - erst unter Einstellungen > OBS verbinden, dann automatisch befüllen." });

        var deck = await db.Decks.Include(d => d.Pages).ThenInclude(p => p.Buttons).FirstOrDefaultAsync(d => d.Id == id);
        var root = deck?.Pages.FirstOrDefault(p => p.ParentPageId is null);
        if (deck is null || root is null) return NotFound(new { error = "Deck nicht gefunden." });

        var wanted = new List<(string Label, string Icon, string Color, ActionStep Step)>
        {
            ("Stream", "tabler:broadcast", "red", Step("obs.stream", ("mode", "toggle"))),
            ("Aufnahme", "tabler:player-record", "rose", Step("obs.record", ("mode", "toggle"))),
        };
        wanted.AddRange(state.Scenes.Select(s => (s.Name, "tabler:layout-board", "violet", Step("obs.scene.switch", ("scene", s.Name)))));
        wanted.AddRange(state.AudioInputs.Select(a => (a.Name, "tabler:microphone", "emerald", Step("obs.audio.mute", ("input", a.Name), ("mode", "toggle")))));

        var occupied = root.Buttons.Select(b => (b.Row, b.Column)).ToHashSet();
        var free = Enumerable.Range(0, deck.Rows).SelectMany(r => Enumerable.Range(0, deck.Columns).Select(c => (r, c)))
            .Where(slot => !occupied.Contains(slot)).ToList();

        var added = 0;
        foreach (var ((label, icon, color, step), (row, col)) in wanted.Zip(free))
        {
            root.Buttons.Add(new ButtonEntity
            {
                Row = row, Column = col, Label = Truncate(label, 60), Icon = icon, Color = color,
                ActionsJson = JsonSerializer.Serialize(new[] { step }, JsonSerializerOptions.Web),
            });
            added++;
        }

        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        var skipped = wanted.Count - added;
        return Ok(new { added, skipped, message = skipped > 0 ? $"{added} Buttons angelegt, {skipped} passten nicht mehr ins Raster." : $"{added} Buttons angelegt." });
    }

    // ---------- Seiten / Ordner ----------

    [HttpPost("decks/{deckId:int}/pages")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<ActionResult<PageDto>> CreatePage(int deckId, PageInput input)
    {
        var deck = await db.Decks.FirstOrDefaultAsync(d => d.Id == deckId);
        if (deck is null) return NotFound(new { error = "Deck nicht gefunden." });

        var name = string.IsNullOrWhiteSpace(input.Name) ? "Neue Seite" : input.Name.Trim();
        var page = new PageEntity
        {
            DeckId = deckId,
            ParentPageId = null,
            Name = name,
        };
        db.Pages.Add(page);
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return ToDto(page);
    }

    [HttpPost("pages/{parentId:int}/folders")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<ActionResult<ButtonDto>> CreateFolder(int parentId, FolderInput input)
    {
        var parent = await db.Pages.Include(p => p.Deck).FirstOrDefaultAsync(p => p.Id == parentId);
        if (parent?.Deck is null) return NotFound(new { error = "Seite nicht gefunden." });
        if (await SlotProblem(parent.Deck, parentId, input.Row, input.Column, null) is { } problem) return Conflict(new { error = problem });

        var page = new PageEntity { DeckId = parent.DeckId, ParentPageId = parentId, Name = input.Name.Trim() };
        db.Pages.Add(page);
        await db.SaveChangesAsync();

        // Ordner bekommt automatisch "Zurueck" oben links und "Startseite" mittig in der letzten
        // Reihe - beide lassen sich danach frei verschieben.
        page.Buttons.Add(new ButtonEntity { Row = 0, Column = 0, Label = "Zurück", Icon = "tabler:arrow-back-up", Color = "slate", ActionsJson = Serialize([Step("deck.back")]) });
        var (homeRow, homeCol) = (parent.Deck.Rows - 1, parent.Deck.Columns / 2);
        if (homeRow != 0 || homeCol != 0)
            page.Buttons.Add(new ButtonEntity { Row = homeRow, Column = homeCol, Label = "Startseite", Icon = "tabler:home", Color = "slate", ActionsJson = Serialize([Step("deck.home")]) });
        var button = new ButtonEntity
        {
            PageId = parentId, Row = input.Row, Column = input.Column, Label = input.Name.Trim(),
            Icon = input.Icon ?? "tabler:folder", Color = input.Color ?? "amber",
            ActionsJson = Serialize([Step("deck.openPage", ("page", page.Id))]),
        };
        db.Buttons.Add(button);
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return ToDto(button);
    }

    [HttpPut("pages/{id:int}")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> RenamePage(int id, PageInput input)
    {
        var updated = await db.Pages.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.Name, input.Name.Trim()));
        if (updated == 0) return NotFound(new { error = "Seite nicht gefunden." });
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    [HttpDelete("pages/{id:int}")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> DeletePage(int id)
    {
        var page = await db.Pages.FirstOrDefaultAsync(p => p.Id == id);
        if (page is null) return NotFound(new { error = "Seite nicht gefunden." });

        if (page.ParentPageId is null)
        {
            var rootPagesCount = await db.Pages.CountAsync(p => p.DeckId == page.DeckId && p.ParentPageId == null);
            if (rootPagesCount <= 1)
                return Conflict(new { error = "Die letzte Hauptseite eines Decks kann nicht gelöscht werden." });
        }

        // Unterordner rekursiv einsammeln, damit keine verwaisten Seiten zurueckbleiben.
        var all = await db.Pages.Where(p => p.DeckId == page.DeckId).Select(p => new { p.Id, p.ParentPageId }).ToListAsync();
        var toDelete = new HashSet<int> { id };
        bool grew;
        do
        {
            grew = false;
            foreach (var p in all.Where(p => p.ParentPageId is { } parent && toDelete.Contains(parent) && !toDelete.Contains(p.Id)))
                grew |= toDelete.Add(p.Id);
        } while (grew);

        // Ordner-Buttons, die auf eine geloeschte Seite zeigen, ebenfalls entfernen.
        var deckButtons = await db.Buttons.Where(b => b.Page!.DeckId == page.DeckId && !toDelete.Contains(b.PageId)).ToListAsync();
        db.Buttons.RemoveRange(deckButtons.Where(b => ParseSteps(b.ActionsJson).Any(s => s.Type == "deck.openPage" && s.Int("page") is { } target && toDelete.Contains(target))));

        await db.Pages.Where(p => toDelete.Contains(p.Id)).ExecuteDeleteAsync();
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    // ---------- Buttons ----------

    [HttpPost("pages/{pageId:int}/buttons")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<ActionResult<ButtonDto>> CreateButton(int pageId, ButtonInput input)
    {
        var page = await db.Pages.Include(p => p.Deck).FirstOrDefaultAsync(p => p.Id == pageId);
        if (page?.Deck is null) return NotFound(new { error = "Seite nicht gefunden." });
        if (await SlotProblem(page.Deck, pageId, input.Row, input.Column, null) is { } problem) return Conflict(new { error = problem });
        if (ValidateInput(input) is { } invalid) return BadRequest(new { error = invalid });
        if (await HotkeyConflict(input.Hotkey, null) is { } taken) return Conflict(new { error = taken });

        var button = new ButtonEntity { PageId = pageId, Row = input.Row, Column = input.Column };
        Apply(button, input);
        db.Buttons.Add(button);
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return ToDto(button);
    }

    [HttpPut("buttons/{id:int}")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<ActionResult<ButtonDto>> UpdateButton(int id, ButtonInput input)
    {
        var button = await db.Buttons.FirstOrDefaultAsync(b => b.Id == id);
        if (button is null) return NotFound(new { error = "Button nicht gefunden." });
        if (ValidateInput(input) is { } invalid) return BadRequest(new { error = invalid });
        if (await HotkeyConflict(input.Hotkey, id) is { } taken) return Conflict(new { error = taken });
        Apply(button, input);
        await db.SaveChangesAsync();
        await notifier.DecksChangedAsync();
        return ToDto(button);
    }

    /// <summary>Verschiebt einen Button; ist der Ziel-Slot belegt, tauschen beide die Plaetze.</summary>
    [HttpPost("buttons/{id:int}/move")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> MoveButton(int id, MoveInput input)
    {
        var button = await db.Buttons.Include(b => b.Page).ThenInclude(p => p!.Deck).FirstOrDefaultAsync(b => b.Id == id);
        if (button?.Page?.Deck is null) return NotFound(new { error = "Button nicht gefunden." });

        var targetPageId = input.PageId ?? button.PageId;
        var targetPage = targetPageId == button.PageId ? button.Page : await db.Pages.Include(p => p.Deck).FirstOrDefaultAsync(p => p.Id == targetPageId);
        if (targetPage?.Deck is null) return NotFound(new { error = "Zielseite nicht gefunden." });
        if (input.Row >= targetPage.Deck.Rows || input.Column >= targetPage.Deck.Columns)
            return BadRequest(new { error = "Ziel liegt außerhalb des Rasters." });

        var other = await db.Buttons.FirstOrDefaultAsync(b => b.PageId == targetPageId && b.Row == input.Row && b.Column == input.Column && b.Id != id);

        await using var tx = await db.Database.BeginTransactionAsync();
        var (oldPage, oldRow, oldCol) = (button.PageId, button.Row, button.Column);
        if (other is not null)
        {
            // Unique-Index (PageId, Row, Column): erst in einen Parkplatz ausserhalb des Rasters.
            other.Row = -1; other.Column = -1;
            await db.SaveChangesAsync();
        }
        button.PageId = targetPageId; button.Row = input.Row; button.Column = input.Column;
        await db.SaveChangesAsync();
        if (other is not null)
        {
            other.PageId = oldPage; other.Row = oldRow; other.Column = oldCol;
            await db.SaveChangesAsync();
        }
        await tx.CommitAsync();
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    [HttpDelete("buttons/{id:int}")]
    [Authorize(Policy = DeviceAuth.OwnerPolicy)]
    public async Task<IActionResult> DeleteButton(int id)
    {
        var deleted = await db.Buttons.Where(b => b.Id == id).ExecuteDeleteAsync();
        if (deleted == 0) return NotFound(new { error = "Button nicht gefunden." });
        switchStates.Remove(id);
        // Eine an diese Taste gebundene Automation faellt per DB-Cascade mit weg (siehe AppDbContext) -
        // die Engine muss das mitbekommen, sonst haelt sie einen veralteten "button.pressed"-Trigger vor.
        automationEngine.Invalidate();
        notifier.AutomationsChanged();
        await notifier.DecksChangedAsync();
        return NoContent();
    }

    // ---------- Hilfen ----------

    [GeneratedRegex("^[a-z0-9-]{1,24}$")]
    private static partial Regex ColorPattern();

    [GeneratedRegex("^[a-z0-9-]{1,40}:[a-z0-9-]{1,80}$")]
    private static partial Regex IconPattern();

    // Modifikatoren in fester Reihenfolge + KeyboardEvent.code, z.B. "Ctrl+Shift+KeyF", "F13", "Numpad7".
    [GeneratedRegex(@"^(Ctrl\+)?(Alt\+)?(Shift\+)?(Meta\+)?[A-Za-z0-9]{1,24}$")]
    private static partial Regex HotkeyPattern();

    [GeneratedRegex(@"^(F([1-9]|1[0-9]|2[0-4])|Numpad[A-Za-z0-9]+|Media[A-Za-z]+|AudioVolume[A-Za-z]+)$")]
    private static partial Regex StandaloneKeyPattern();

    /// <summary>Welche Taste nutzt dieses Kuerzel schon? Liefert eine konkrete Meldung oder null.</summary>
    private async Task<string?> HotkeyConflict(string? hotkey, int? ignoreButtonId)
    {
        if (string.IsNullOrEmpty(hotkey)) return null;
        var other = await db.Buttons.AsNoTracking().Include(b => b.Page).ThenInclude(p => p!.Deck)
            .FirstOrDefaultAsync(b => b.Hotkey == hotkey && b.Id != ignoreButtonId);
        if (other is null) return null;
        var label = other.Label.Length > 0 ? other.Label : "ohne Namen";
        return $"Dieses Tastenkürzel ist schon der Taste „{label}“ im Deck „{other.Page?.Deck?.Name}“ zugewiesen.";
    }

    private static string? ValidateInput(ButtonInput input)
    {
        if (input.Color is { } c && !ColorPattern().IsMatch(c)) return "Ungültige Farbe.";
        if (input.Icon is { Length: > 0 } i && !IconPattern().IsMatch(i)) return "Ungültiger Icon-Name (erwartet z.B. 'tabler:video').";
        if (input.Hotkey is { Length: > 0 } hk)
        {
            if (!HotkeyPattern().IsMatch(hk)) return "Ungültiges Tastenkürzel.";
            if (!hk.Contains('+') && !StandaloneKeyPattern().IsMatch(hk))
                return "Einzelne Tasten gehen nur für F1–F24, den Ziffernblock und Medientasten – sonst bitte mit Strg, Alt oder Umschalt kombinieren.";
        }
        var steps = input.Actions ?? [];
        if (steps.Count > MaxSteps) return $"Höchstens {MaxSteps} Schritte pro Button.";

        if (steps.Count == 1 && steps[0].Type == "deck.multiSwitch")
        {
            var onSteps = SwitchStateService.GetSubSteps(steps[0].Params, "onSteps");
            var offSteps = SwitchStateService.GetSubSteps(steps[0].Params, "offSteps");
            if (onSteps.Count > MaxSteps || offSteps.Count > MaxSteps) return $"Höchstens {MaxSteps} Schritte pro Zustand.";
            var unknownOn = onSteps.FirstOrDefault(s => !ActionCatalog.BuiltIn.Any(d => d.Type == s.Type) && !PluginHost.TryParseActionType(s.Type, out _, out _));
            if (unknownOn is not null) return $"Unbekannte Aktion in Zustand 1 '{unknownOn.Type}'.";
            var unknownOff = offSteps.FirstOrDefault(s => !ActionCatalog.BuiltIn.Any(d => d.Type == s.Type) && !PluginHost.TryParseActionType(s.Type, out _, out _));
            if (unknownOff is not null) return $"Unbekannte Aktion in Zustand 2 '{unknownOff.Type}'.";
            return null;
        }

        var unknown = steps.FirstOrDefault(s => !ActionCatalog.BuiltIn.Any(d => d.Type == s.Type) && !PluginHost.TryParseActionType(s.Type, out _, out _));
        return unknown is null ? null : $"Unbekannte Aktion '{unknown.Type}'.";
    }

    private static void Apply(ButtonEntity b, ButtonInput input)
    {
        b.Label = input.Label?.Trim() ?? "";
        b.Icon = string.IsNullOrWhiteSpace(input.Icon) ? null : input.Icon;
        b.Color = input.Color ?? "slate";
        b.ActionsJson = Serialize(input.Actions ?? []);
        if (input.Hotkey is not null) b.Hotkey = input.Hotkey.Length == 0 ? null : input.Hotkey;
    }

    private async Task<string?> SlotProblem(DeckEntity deck, int pageId, int row, int col, int? ignoreButtonId)
    {
        if (row >= deck.Rows || col >= deck.Columns) return $"Position liegt außerhalb des {deck.Rows}×{deck.Columns}-Rasters.";
        var taken = await db.Buttons.AnyAsync(b => b.PageId == pageId && b.Row == row && b.Column == col && b.Id != ignoreButtonId);
        return taken ? "Dieser Platz ist schon belegt." : null;
    }

    private static ActionStep Step(string type, params (string Key, object Value)[] p)
    {
        var obj = new JsonObject();
        foreach (var (k, v) in p) obj[k] = JsonValue.Create(v);
        return new ActionStep(type, obj);
    }

    private static string Serialize(IEnumerable<ActionStep> steps) => JsonSerializer.Serialize(steps, JsonSerializerOptions.Web);

    internal static List<ActionStep> ParseSteps(string json)
    {
        try { return JsonSerializer.Deserialize<List<ActionStep>>(json, JsonSerializerOptions.Web) ?? []; }
        catch (JsonException) { return []; }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    private static ButtonDto ToDto(ButtonEntity b) => new(b.Id, b.PageId, b.Row, b.Column, b.Label, b.Icon, b.Color, ParseSteps(b.ActionsJson), b.Hotkey);

    private static PageDto ToDto(PageEntity p) => new(p.Id, p.ParentPageId, p.Name, p.Buttons.OrderBy(b => b.Row).ThenBy(b => b.Column).Select(ToDto).ToList());

    private static DeckDto ToDto(DeckEntity d) => new(d.Id, d.Name, d.Rows, d.Columns, d.SortOrder,
        d.Pages.OrderBy(p => p.ParentPageId.HasValue).ThenBy(p => p.Id)
            .Select(ToDto)
            .ToList(),
        ParseSideDisplays(d.SideDisplaysJson),
        d.OledSize);

    private static List<SideDisplayDto> ParseSideDisplays(string json)
    {
        try { return JsonSerializer.Deserialize<List<SideDisplayDto>>(json, JsonSerializerOptions.Web) ?? []; }
        catch (JsonException) { return []; }
    }
}
