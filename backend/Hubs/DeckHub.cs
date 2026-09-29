using System.Collections.Concurrent;
using System.Text.Json;
using Deck.Server.Actions;
using Deck.Server.Auth;
using Deck.Server.Data;
using Deck.Server.Hardware;
using Deck.Server.Obs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Hubs;

public record PressResult(bool Ok, string? Error);

/// <summary>
/// Echtzeitkanal zu allen gekoppelten Geraeten. Server -> Client: "obsState", "preview",
/// "decksChanged", "catalogChanged", "automationsChanged", "systemState". Client -> Server:
/// Press, SetPreview, SetSystemMonitor.
/// </summary>
[Authorize(AuthenticationSchemes = DeviceAuth.Scheme)]
public class DeckHub(AppDbContext db, ActionExecutor executor, ObsService obs, PreviewSubscribers preview, SystemMonitorSubscribers systemMonitor) : Hub
{
    public const string PreviewGroup = "preview";

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("obsState", obs.State);
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        preview.Remove(Context.ConnectionId);
        systemMonitor.Remove(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    public async Task<PressResult> Press(int buttonId)
    {
        var button = await db.Buttons.AsNoTracking().FirstOrDefaultAsync(b => b.Id == buttonId);
        if (button is null) return new PressResult(false, "Diesen Button gibt es nicht mehr - das Deck wurde vermutlich gerade bearbeitet.");

        List<ActionStep> steps;
        try { steps = JsonSerializer.Deserialize<List<ActionStep>>(button.ActionsJson, JsonSerializerOptions.Web) ?? []; }
        catch (JsonException) { return new PressResult(false, $"Die Aktionen von '{button.Label}' sind beschädigt gespeichert. Bitte im Editor neu zuweisen."); }

        if (steps.Count == 0) return new PressResult(false, $"'{button.Label}' hat noch keine Aktion. Weise im Editor eine zu.");

        try
        {
            await executor.ExecuteAsync(steps, $"Button '{button.Label}'", Context.ConnectionAborted);
            return new PressResult(true, null);
        }
        catch (ActionExecutionException ex)
        {
            return new PressResult(false, ex.Message);
        }
    }

    public async Task SetPreview(bool enabled)
    {
        if (enabled)
        {
            preview.Add(Context.ConnectionId);
            await Groups.AddToGroupAsync(Context.ConnectionId, PreviewGroup);
        }
        else
        {
            preview.Remove(Context.ConnectionId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, PreviewGroup);
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

public class PreviewSubscribers
{
    private readonly ConcurrentDictionary<string, byte> _ids = new();
    public void Add(string id) => _ids[id] = 0;
    public void Remove(string id) => _ids.TryRemove(id, out _);
    public bool Any => !_ids.IsEmpty;
}
