using System.Text.Json;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Automation;
using Deck.Server.Data;
using Deck.Server.Hubs;
using Deck.Server.Plugins;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Controllers;

[ApiController]
[Route("api/automations")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme, Policy = DeviceAuth.OwnerPolicy)]
public class AutomationsController(AppDbContext db, AutomationEngine engine, ActionExecutor executor, HubNotifier notifier) : ControllerBase
{
    private static readonly JsonSerializerOptions Json = AutomationEngine.Json;

    [HttpGet]
    public async Task<IReadOnlyList<AutomationDto>> List()
    {
        var list = await db.Automations.AsNoTracking().OrderBy(a => a.Id).ToListAsync();
        return list.Select(ToDto).ToList();
    }

    /// <summary>Die an eine bestimmte Taste gebundene Automation (falls vorhanden) - fuer den Tasten-Inspector.</summary>
    [HttpGet("~/api/buttons/{buttonId:int}/automation")]
    public async Task<ActionResult<AutomationDto>> GetForButton(int buttonId)
    {
        var entity = await db.Automations.AsNoTracking().FirstOrDefaultAsync(a => a.ButtonId == buttonId);
        return entity is null ? NotFound() : ToDto(entity);
    }

    [HttpPost]
    public async Task<ActionResult<AutomationDto>> Create(AutomationInput input)
    {
        if (await Validate(input) is { } error) return BadRequest(new { error });
        var entity = new AutomationEntity();
        Apply(entity, input);
        db.Automations.Add(entity);
        await db.SaveChangesAsync();
        engine.Invalidate();
        notifier.AutomationsChanged();
        return ToDto(entity);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<AutomationDto>> Update(int id, AutomationInput input)
    {
        var entity = await db.Automations.FirstOrDefaultAsync(a => a.Id == id);
        if (entity is null) return NotFound(new { error = "Automation nicht gefunden." });
        if (await Validate(input) is { } error) return BadRequest(new { error });
        Apply(entity, input);
        await db.SaveChangesAsync();
        engine.Invalidate();
        notifier.AutomationsChanged();
        return ToDto(entity);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await db.Automations.Where(a => a.Id == id).ExecuteDeleteAsync();
        if (deleted == 0) return NotFound(new { error = "Automation nicht gefunden." });
        engine.Invalidate();
        notifier.AutomationsChanged();
        return NoContent();
    }

    /// <summary>Fuehrt nur die Aktionen einmal aus (ohne Ausloeser/Bedingungen) - zum Testen im Editor.</summary>
    [HttpPost("{id:int}/test")]
    public async Task<IActionResult> Test(int id, CancellationToken ct)
    {
        var entity = await db.Automations.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (entity is null) return NotFound(new { error = "Automation nicht gefunden." });
        try
        {
            await executor.ExecuteAsync(JsonSerializer.Deserialize<List<ActionStep>>(entity.ActionsJson, Json) ?? [], $"Test '{entity.Name}'", ct);
            return NoContent();
        }
        catch (ActionExecutionException ex)
        {
            return UnprocessableEntity(new { error = ex.Message });
        }
    }

    private async Task<string?> Validate(AutomationInput input)
    {
        if (!AutomationCatalog.Triggers.Any(t => t.Type == input.Trigger.Type)) return $"Unbekannter Auslöser '{input.Trigger.Type}'.";
        var badCondition = input.Conditions?.FirstOrDefault(c => !AutomationCatalog.Conditions.Any(d => d.Type == c.Type));
        if (badCondition is not null) return $"Unbekannte Bedingung '{badCondition.Type}'.";
        var actions = input.Actions ?? [];
        // Entwuerfe (frisch per Taste angelegt) duerfen leer sein, solange sie ausgeschaltet sind.
        if (actions.Count == 0 && input.Enabled) return "Eine Automation braucht mindestens eine Aktion („dann …“), bevor sie eingeschaltet werden kann.";
        if (actions.Count > 20) return "Höchstens 20 Aktionen pro Automation.";
        var badAction = actions.FirstOrDefault(s =>
            ActionCatalog.IsClientSide(s.Type) || (!ActionCatalog.BuiltIn.Any(d => d.Type == s.Type) && !PluginHost.TryParseActionType(s.Type, out _, out _)));
        if (badAction is not null)
            return ActionCatalog.IsClientSide(badAction.Type)
                ? "Deck-Navigation (Ordner öffnen/zurück) geht nur auf Buttons, nicht in Automationen."
                : $"Unbekannte Aktion '{badAction.Type}'.";

        // "button.pressed" ist implizit an ButtonId gekoppelt - jeder andere Ausloeser darf nicht an eine Taste gebunden sein.
        if (input.Trigger.Type == "button.pressed")
        {
            if (input.ButtonId is not { } buttonId) return "Der Auslöser „Diese Taste wurde gedrückt“ braucht eine zugeordnete Taste.";
            if (!await db.Buttons.AnyAsync(b => b.Id == buttonId)) return "Die zugeordnete Taste wurde nicht gefunden.";
        }
        else if (input.ButtonId is not null)
        {
            return "Eine an eine Taste gebundene Automation muss den Auslöser „Diese Taste wurde gedrückt“ verwenden.";
        }
        return null;
    }

    private static void Apply(AutomationEntity e, AutomationInput input)
    {
        e.Name = input.Name.Trim();
        e.Enabled = input.Enabled;
        e.ButtonId = input.ButtonId;
        e.TriggerJson = JsonSerializer.Serialize(input.Trigger, Json);
        e.ConditionsJson = JsonSerializer.Serialize(input.Conditions ?? [], Json);
        e.ActionsJson = JsonSerializer.Serialize(input.Actions ?? [], Json);
    }

    private AutomationDto ToDto(AutomationEntity e) => new(
        e.Id, e.Name, e.Enabled, e.ButtonId,
        JsonSerializer.Deserialize<AutomationPart>(e.TriggerJson, Json) ?? new AutomationPart("", null),
        JsonSerializer.Deserialize<List<AutomationPart>>(e.ConditionsJson, Json) ?? [],
        JsonSerializer.Deserialize<List<ActionStep>>(e.ActionsJson, Json) ?? [],
        engine.LastRuns.TryGetValue(e.Id, out var run) ? run : null);
}

/// <summary>Nur Name + an/aus fuer alle Geraete - damit Automations-Tasten auf jedem Deck richtig leuchten.</summary>
[ApiController]
[Route("api/automation-states")]
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class AutomationStatesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List() =>
        await db.Automations.AsNoTracking().OrderBy(a => a.Id).Select(a => new { a.Id, a.Name, a.Enabled }).ToListAsync();
}