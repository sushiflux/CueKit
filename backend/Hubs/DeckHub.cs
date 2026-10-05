using System.Text.Json;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Data;
using Deck.Server.Hardware;
using Deck.Server.Obs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

using Deck.Server.Services;

namespace Deck.Server.Hubs;

/// <summary>Notice: Hinweis trotz Erfolg, z.B. wenn OBS-Schritte mangels OBS-Verbindung uebersprungen wurden.</summary>
public record PressResult(bool Ok, string? Error, string? Notice = null);

/// <summary>
/// Echtzeitkanal zu allen gekoppelten Geraeten. Server -> Client: "obsState", "decksChanged",
/// "catalogChanged", "automationsChanged", "systemState". Client -> Server: Press, SetSystemMonitor.
/// </summary>
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class DeckHub(AppDbContext db, ActionExecutor executor, ObsService obs, SystemMonitorSubscribers systemMonitor, MeterSubscribers meters, SwitchStateService switchStates) : Hub
{
    public const string MetersGroup = "meters";

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("obsState", obs.State);
        await Clients.Caller.SendAsync("switchStates", switchStates.GetAll());
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        systemMonitor.Remove(Context.ConnectionId);
        meters.Remove(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>Ein Geraet zeigt (mind.) eine Taste mit Live-Pegel an - startet/stoppt die Pegel-
    /// Uebertragung ("meters", siehe MeterBroadcaster).</summary>
    public async Task SetMeters(bool enabled)
    {
        if (enabled)
        {
            meters.Add(Context.ConnectionId);
            await Groups.AddToGroupAsync(Context.ConnectionId, MetersGroup);
        }
        else
        {
            meters.Remove(Context.ConnectionId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, MetersGroup);
        }
    }

    public async Task<PressResult> Press(int buttonId)
    {
        var button = await db.Buttons.AsNoTracking().FirstOrDefaultAsync(b => b.Id == buttonId);
        if (button is null) return new PressResult(false, "Diesen Button gibt es nicht mehr - das Deck wurde vermutlich gerade bearbeitet.");

        List<ActionStep> steps;
        try { steps = JsonSerializer.Deserialize<List<ActionStep>>(button.ActionsJson, JsonSerializerOptions.Web) ?? []; }
        catch (JsonException) { return new PressResult(false, $"Die Aktionen von '{button.Label}' sind beschädigt gespeichert. Bitte im Editor neu zuweisen."); }

        if (steps.Count == 0) return new PressResult(false, $"'{button.Label}' hat noch keine Aktion. Weise im Editor eine zu.");

        if (steps.Count == 1 && steps[0].Type == "deck.multiSwitch")
        {
            return await switchStates.ExecuteSwitchPressAsync(button, steps[0], executor, Context.ConnectionAborted);
        }

        try
        {
            var notice = await executor.ExecuteAsync(steps, $"Button '{button.Label}'", Context.ConnectionAborted);
            return new PressResult(true, null, notice);
        }
        catch (ActionExecutionException ex)
        {
            return new PressResult(false, ex.Message);
        }
    }

    /// <summary>Ein Geraet zeigt (mind.) eine "system.monitor.display"-Kachel an - startet/stoppt den
    /// periodischen "systemState"-Broadcast (siehe SystemMonitorBroadcaster).</summary>
    public void SetSystemMonitor(bool enabled)
    {
        if (enabled) systemMonitor.Add(Context.ConnectionId);
        else systemMonitor.Remove(Context.ConnectionId);
    }
}
