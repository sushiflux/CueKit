using System.Text.Json;
using System.Text.Json.Nodes;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Data;
using Deck.Server.Hubs;
using Deck.Server.Plugins;
using Deck.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Controllers;

// ---------- Dateiformat (versioniert, damit spaetere Versionen alte Dateien lesen koennen) ----------

public record ExportButton(int Row, int Column, string Label, string? Icon, string Color, string? Hotkey, List<ActionStep> Actions);

/// <summary>Key = urspruengliche Seiten-ID; nur fuer die Zuordnung von Ordnern innerhalb der Datei.</summary>
public record ExportPage(int Key, int? ParentKey, string Name, List<ExportButton> Buttons);

public record ExportDeck(string Name, int Rows, int Columns, List<ExportPage> Pages);

public record ExportAutomation(int Key, string Name, bool Enabled, AutomationPart Trigger, List<AutomationPart> Conditions, List<ActionStep> Actions);

public record DeckExportFile(string Format, int FormatVersion, string? AppVersion, DateTimeOffset ExportedAt, List<ExportDeck> Decks, List<ExportAutomation> Automations);

public record ImportResult(int Decks, int Buttons, int Automations, int SkippedHotkeys, int DroppedActions, string Message);

/// <summary>Decks sichern und wiederherstellen - z.B. vor einer PC-Neuinstallation.</summary>
[ApiController]
[Route("api/backup")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
public class BackupController(AppDbContext db, HubNotifier notifier, AutomationEngine engine, AppInfo app) : ControllerBase
{
    public const string FormatName = "baton-decks";
    public const int FormatVersion = 1;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    /// <summary>Exportiert alle Decks - oder nur eines (?deckId=).</summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] int? deckId)
    {
        var decks = await db.Decks.AsNoTracking().Include(d => d.Pages).ThenInclude(p => p.Buttons)
            .Where(d => deckId == null || d.Id == deckId).OrderBy(d => d.SortOrder).ThenBy(d => d.Id).AsSplitQuery().ToListAsync();
        if (decks.Count == 0) return NotFound(new { error = "Deck nicht gefunden." });

        var exportDecks = decks.Select(d => new ExportDeck(d.Name, d.Rows, d.Columns,
            d.Pages.OrderBy(p => p.ParentPageId.HasValue).ThenBy(p => p.Id).Select(p => new ExportPage(p.Id, p.ParentPageId, p.Name,
                p.Buttons.OrderBy(b => b.Row).ThenBy(b => b.Column)
                    .Select(b => new ExportButton(b.Row, b.Column, b.Label, b.Icon, b.Color, b.Hotkey, DecksController.ParseSteps(b.ActionsJson))).ToList())).ToList())).ToList();

        // Nur Automationen mitnehmen, auf die eine exportierte Taste verweist.
        var automationIds = exportDecks.SelectMany(d => d.Pages).SelectMany(p => p.Buttons).SelectMany(b => b.Actions)
            .Where(a => a.Type == "automation.toggle").Select(a => a.Int("automation")).OfType<int>().ToHashSet();
        var automations = await db.Automations.AsNoTracking().Where(a => automationIds.Contains(a.Id)).ToListAsync();
        var exportAutomations = automations.Select(a => new ExportAutomation(a.Id, a.Name, a.Enabled,
            JsonSerializer.Deserialize<AutomationPart>(a.TriggerJson, AutomationEngine.Json)!,
            JsonSerializer.Deserialize<List<AutomationPart>>(a.ConditionsJson, AutomationEngine.Json) ?? [],
            JsonSerializer.Deserialize<List<ActionStep>>(a.ActionsJson, AutomationEngine.Json) ?? [])).ToList();

        var file = new DeckExportFile(FormatName, FormatVersion, app.Version, DateTimeOffset.UtcNow, exportDecks, exportAutomations);
        var name = deckId is null ? "alle-decks" : SafeFileName(decks[0].Name);
        return File(JsonSerializer.SerializeToUtf8Bytes(file, Json), "application/json", $"{app.Brand.ProductName.ToLowerInvariant()}-{name}-{DateTime.Now:yyyy-MM-dd}.json");
    }

    /// <summary>Importiert Decks als NEUE Decks - bestehende werden nie ueberschrieben.</summary>
    [HttpPost("import")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<ActionResult<ImportResult>> Import([FromBody] JsonElement body)
    {
        DeckExportFile? file;
        try { file = body.Deserialize<DeckExportFile>(Json); }
        catch (JsonException) { return BadRequest(new { error = "Die Datei ist keine gültige Deck-Sicherung." }); }
        if (file is null || file.Format != FormatName || file.Decks is null)
            return BadRequest(new { error = "Das ist keine Deck-Sicherung dieser App (falsches oder fehlendes Format)." });
        if (file.FormatVersion > FormatVersion)
            return BadRequest(new { error = "Diese Sicherung stammt aus einer neueren Version. Bitte die App aktualisieren und erneut importieren." });
        if (file.Decks.Count == 0) return BadRequest(new { error = "Die Sicherung enthält keine Decks." });

        await using var tx = await db.Database.BeginTransactionAsync();
        int droppedActions = 0, skippedHotkeys = 0, buttonCount = 0;

        // Wiederherstellen nach Neuinstallation: das automatisch angelegte, noch voellig leere
        // Start-Deck ersetzen, statt die Sicherung als "(Import)" daneben zu legen.
        var decksNow = await db.Decks.Include(d => d.Pages).ThenInclude(p => p.Buttons).ToListAsync();
        if (decksNow.Count == 1 && decksNow[0].Pages.Count <= 1 && decksNow[0].Pages.All(p => p.Buttons.Count == 0))
        {
            db.Decks.Remove(decksNow[0]);
            await db.SaveChangesAsync();
        }

        // 1) Automationen anlegen und alte -> neue IDs merken.
        var automationMap = new Dictionary<int, int>();
        foreach (var a in file.Automations ?? [])
        {
            if (!AutomationCatalog.Triggers.Any(t => t.Type == a.Trigger?.Type)) continue;
            var actions = CleanSteps(a.Actions, ref droppedActions, allowClientSide: false);
            var entity = new AutomationEntity
            {
                Name = Limit(a.Name, 80) ?? "Importierte Automation",
                Enabled = a.Enabled && actions.Count > 0,
                TriggerJson = JsonSerializer.Serialize(a.Trigger, AutomationEngine.Json),
                ConditionsJson = JsonSerializer.Serialize((a.Conditions ?? []).Where(c => AutomationCatalog.Conditions.Any(d => d.Type == c.Type)).ToList(), AutomationEngine.Json),
                ActionsJson = JsonSerializer.Serialize(actions, AutomationEngine.Json),
            };
            db.Automations.Add(entity);
            await db.SaveChangesAsync();
            automationMap[a.Key] = entity.Id;
        }

        var usedHotkeys = (await db.Buttons.Where(b => b.Hotkey != null).Select(b => b.Hotkey!).ToListAsync()).ToHashSet();
        var sortOrder = (await db.Decks.MaxAsync(d => (int?)d.SortOrder) ?? -1) + 1;
        var existingNames = (await db.Decks.Select(d => d.Name).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var d in file.Decks)
        {
            var rows = Math.Clamp(d.Rows, 1, 12);
            var columns = Math.Clamp(d.Columns, 1, 12);
            var name = Limit(d.Name, 70) ?? "Importiertes Deck";
            if (existingNames.Contains(name)) name = $"{name} (Import)";
            existingNames.Add(name);

            var deck = new DeckEntity { Name = name, Rows = rows, Columns = columns, SortOrder = sortOrder++ };
            db.Decks.Add(deck);
            await db.SaveChangesAsync();

            // 2) Seiten in Eltern-vor-Kind-Reihenfolge anlegen (Ordner-Hierarchie erhalten).
            var pages = d.Pages ?? [];
            var root = pages.FirstOrDefault(p => p.ParentKey is null) ?? new ExportPage(0, null, "Start", []);
            var pageMap = new Dictionary<int, PageEntity>();
            var queue = new Queue<(ExportPage Page, int? NewParent)>();
            queue.Enqueue((root, null));
            while (queue.Count > 0)
            {
                var (p, parent) = queue.Dequeue();
                if (pageMap.ContainsKey(p.Key)) continue;
                var entity = new PageEntity { DeckId = deck.Id, ParentPageId = parent, Name = Limit(p.Name, 80) ?? "Ordner" };
                db.Pages.Add(entity);
                await db.SaveChangesAsync();
                pageMap[p.Key] = entity;
                foreach (var child in pages.Where(c => c.ParentKey == p.Key)) queue.Enqueue((child, entity.Id));
            }

            // 3) Tasten anlegen, Verweise (Ordner, Automationen) auf die neuen IDs umbiegen.
            foreach (var p in pages.Where(p => pageMap.ContainsKey(p.Key)))
            {
                var occupied = new HashSet<(int, int)>();
                foreach (var b in p.Buttons ?? [])
                {
                    if (b.Row < 0 || b.Column < 0 || b.Row >= rows || b.Column >= columns || !occupied.Add((b.Row, b.Column))) continue;
                    var steps = CleanSteps(b.Actions, ref droppedActions, allowClientSide: true)
                        .Select(s => Remap(s, pageMap, automationMap))
                        .Where(s => s is not null).Select(s => s!).ToList();

                    string? hotkey = null;
                    if (b.Hotkey is { Length: > 0 and <= 60 } hk)
                    {
                        if (usedHotkeys.Add(hk)) hotkey = hk;
                        else skippedHotkeys++;
                    }

                    db.Buttons.Add(new ButtonEntity
                    {
                        PageId = pageMap[p.Key].Id, Row = b.Row, Column = b.Column,
                        Label = Limit(b.Label, 60) ?? "",
                        Icon = Limit(b.Icon, 120),
                        Color = Limit(b.Color, 24) ?? "slate",
                        Hotkey = hotkey,
                        ActionsJson = JsonSerializer.Serialize(steps, JsonSerializerOptions.Web),
                    });
                    buttonCount++;
                }
            }
            await db.SaveChangesAsync();
        }

        await tx.CommitAsync();
        engine.Invalidate();
        notifier.AutomationsChanged();
        await notifier.DecksChangedAsync();

        var parts = new List<string> { $"{file.Decks.Count} Deck(s) mit {buttonCount} Tasten importiert" };
        if (automationMap.Count > 0) parts.Add($"{automationMap.Count} Automation(en)");
        if (skippedHotkeys > 0) parts.Add($"{skippedHotkeys} Tastenkürzel ausgelassen (schon vergeben)");
        if (droppedActions > 0) parts.Add($"{droppedActions} unbekannte Aktion(en) entfernt");
        return new ImportResult(file.Decks.Count, buttonCount, automationMap.Count, skippedHotkeys, droppedActions, string.Join(", ", parts) + ".");
    }

    /// <summary>Unbekannte Aktionstypen verwerfen; Plugin-Aktionen bleiben (Plugin evtl. spaeter installiert).</summary>
    private static List<ActionStep> CleanSteps(List<ActionStep>? steps, ref int dropped, bool allowClientSide)
    {
        var result = new List<ActionStep>();
        foreach (var s in (steps ?? []).Take(20))
        {
            var known = ActionCatalog.BuiltIn.Any(d => d.Type == s.Type) || PluginHost.TryParseActionType(s.Type, out _, out _);
            if (!known || (!allowClientSide && ActionCatalog.IsClientSide(s.Type))) { dropped++; continue; }
            result.Add(s);
        }
        return result;
    }

    private static ActionStep? Remap(ActionStep step, Dictionary<int, PageEntity> pages, Dictionary<int, int> automations)
    {
        if (step.Type == "deck.openPage")
            return step.Int("page") is { } oldPage && pages.TryGetValue(oldPage, out var page) ? WithParam(step, "page", page.Id) : null;
        if (step.Type == "automation.toggle")
            return step.Int("automation") is { } oldId && automations.TryGetValue(oldId, out var newId) ? WithParam(step, "automation", newId) : null;
        return step;
    }

    private static ActionStep WithParam(ActionStep step, string key, int value)
    {
        var p = step.Params?.DeepClone().AsObject() ?? new JsonObject();
        p[key] = value;
        return step with { Params = p };
    }

    private static string? Limit(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim().Length > max ? s.Trim()[..max] : s.Trim();

    private static string SafeFileName(string name)
    {
        var cleaned = new string(name.ToLowerInvariant().Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray()).Trim('-');
        return cleaned.Length == 0 ? "deck" : cleaned;
    }
}
