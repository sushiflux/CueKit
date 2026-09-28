using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Deck.Server.Actions;

namespace Deck.Server.Plugins;

public record PluginInfo(string Id, string Name, string Version, string? Author, string Icon, IReadOnlyList<ActionDefinition> Actions);

/// <summary>
/// Plugins sind eigenstaendige Prozesse (beliebige Sprache), die sich per WebSocket unter
/// /plugins?key=... anmelden - analog zum Stream-Deck-SDK. Ein abstuerzendes Plugin reisst
/// dadurch nie den Dienst mit. Protokoll: siehe docs/PLUGIN_PROTOCOL.md.
/// </summary>
public partial class PluginHost(ILogger<PluginHost> log)
{
    private const string Prefix = "plugin:";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly ConcurrentDictionary<string, Connection> _connections = new();

    public event Action? Changed;

    public IReadOnlyList<PluginInfo> Plugins => _connections.Values.Select(c => c.Info).OrderBy(p => p.Name).ToList();

    public IEnumerable<ActionDefinition> ActionDefinitions => _connections.Values.SelectMany(c => c.Info.Actions);

    public static bool TryParseActionType(string type, out string pluginId, out string actionId)
    {
        pluginId = actionId = "";
        if (!type.StartsWith(Prefix, StringComparison.Ordinal)) return false;
        var rest = type[Prefix.Length..];
        var slash = rest.LastIndexOf('/');
        if (slash <= 0 || slash == rest.Length - 1) return false;
        pluginId = rest[..slash];
        actionId = rest[(slash + 1)..];
        return true;
    }

    public async Task InvokeAsync(string pluginId, string actionId, JsonObject? parameters, CancellationToken ct)
    {
        if (!_connections.TryGetValue(pluginId, out var conn))
            throw new InvalidOperationException($"Plugin '{pluginId}' ist nicht verbunden. Läuft es?");

        var invocationId = Guid.NewGuid().ToString("N");
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        conn.Pending[invocationId] = tcs;
        try
        {
            await conn.SendAsync(new JsonObject
            {
                ["type"] = "invoke",
                ["invocationId"] = invocationId,
                ["action"] = actionId,
                ["params"] = parameters?.DeepClone() ?? new JsonObject(),
            }, ct);

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            await using (timeout.Token.Register(() => tcs.TrySetException(new TimeoutException($"Plugin '{conn.Info.Name}' hat nicht innerhalb von 15 s geantwortet."))))
                await tcs.Task;
        }
        finally
        {
            conn.Pending.TryRemove(invocationId, out _);
        }
    }

    public async Task HandleAsync(WebSocket socket, CancellationToken ct)
    {
        Connection? conn = null;
        try
        {
            var first = await ReceiveAsync(socket, ct);
            if (first?["type"]?.GetValue<string>() != "register")
            {
                await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Erste Nachricht muss 'register' sein.", ct);
                return;
            }

            var info = ParseRegistration(first["plugin"]);
            conn = new Connection(socket, info);
            if (_connections.TryRemove(info.Id, out var old))
                await old.CloseAsync("Neue Instanz desselben Plugins hat sich angemeldet.");
            _connections[info.Id] = conn;
            log.LogInformation("Plugin verbunden: {Name} {Version} ({Actions} Aktionen)", info.Name, info.Version, info.Actions.Count);
            await conn.SendAsync(new JsonObject { ["type"] = "registered", ["protocol"] = 1 }, ct);
            Changed?.Invoke();

            while (!ct.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var msg = await ReceiveAsync(socket, ct);
                if (msg is null) break;
                switch (msg["type"]?.GetValue<string>())
                {
                    case "result":
                        var id = msg["invocationId"]?.GetValue<string>();
                        if (id is not null && conn.Pending.TryGetValue(id, out var tcs))
                        {
                            if (msg["ok"]?.GetValue<bool>() == true) tcs.TrySetResult();
                            else tcs.TrySetException(new InvalidOperationException(msg["error"]?.GetValue<string>() ?? "Plugin meldet einen Fehler ohne Beschreibung."));
                        }
                        break;
                    case "log":
                        log.LogInformation("[{Plugin}] {Message}", info.Name, msg["message"]?.GetValue<string>());
                        break;
                }
            }
        }
        catch (PluginProtocolException ex)
        {
            log.LogWarning("Plugin-Anmeldung abgelehnt: {Message}", ex.Message);
            try { await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, ex.Message[..Math.Min(ex.Message.Length, 120)], ct); } catch { }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            // Plugin-Prozess beendet - normaler Fall.
        }
        finally
        {
            if (conn is not null && _connections.TryGetValue(conn.Info.Id, out var current) && current == conn)
            {
                _connections.TryRemove(conn.Info.Id, out _);
                foreach (var tcs in conn.Pending.Values)
                    tcs.TrySetException(new InvalidOperationException($"Plugin '{conn.Info.Name}' wurde beendet."));
                log.LogInformation("Plugin getrennt: {Name}", conn.Info.Name);
                Changed?.Invoke();
            }
        }
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9.-]{2,63}$")]
    private static partial Regex PluginIdPattern();

    [GeneratedRegex("^[a-zA-Z0-9_.-]{1,64}$")]
    private static partial Regex ActionIdPattern();

    private static PluginInfo ParseRegistration(JsonNode? p)
    {
        if (p is null) throw new PluginProtocolException("'plugin' fehlt in der Registrierung.");
        var id = p["id"]?.GetValue<string>() ?? "";
        if (!PluginIdPattern().IsMatch(id))
            throw new PluginProtocolException("Ungültige Plugin-ID (erlaubt: a-z, 0-9, '.', '-', z.B. 'com.example.photoshop').");
        var name = Limit(p["name"]?.GetValue<string>(), 60) ?? id;

        var actions = new List<ActionDefinition>();
        foreach (var a in p["actions"]?.AsArray() ?? [])
        {
            var actionId = a?["id"]?.GetValue<string>() ?? "";
            if (!ActionIdPattern().IsMatch(actionId))
                throw new PluginProtocolException($"Ungültige Aktions-ID '{actionId}'.");
            var fields = a!["fields"]?.Deserialize<List<ActionField>>(Json) ?? [];
            actions.Add(new ActionDefinition(
                $"{Prefix}{id}/{actionId}",
                name,
                Limit(a["name"]?.GetValue<string>(), 60) ?? actionId,
                Limit(a["description"]?.GetValue<string>(), 200) ?? "",
                Limit(a["icon"]?.GetValue<string>(), 120) ?? "tabler:puzzle",
                fields.Take(20).ToList(),
                Limit(a["color"]?.GetValue<string>(), 24)));
        }

        return new PluginInfo(id, name, Limit(p["version"]?.GetValue<string>(), 30) ?? "0.0.0",
            Limit(p["author"]?.GetValue<string>(), 60), Limit(p["icon"]?.GetValue<string>(), 120) ?? "tabler:puzzle", actions);
    }

    private static string? Limit(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Length > max ? s[..max] : s;

    private static async Task<JsonNode?> ReceiveAsync(WebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[16 * 1024];
        using var ms = new MemoryStream();
        while (true)
        {
            var result = await socket.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, result.Count);
            if (ms.Length > 1024 * 1024) throw new PluginProtocolException("Nachricht zu groß (max. 1 MB).");
            if (result.EndOfMessage) break;
        }
        try { return JsonNode.Parse(ms.ToArray()); }
        catch (JsonException) { throw new PluginProtocolException("Nachricht ist kein gültiges JSON."); }
    }

    private sealed class PluginProtocolException(string message) : Exception(message);

    private sealed class Connection(WebSocket socket, PluginInfo info)
    {
        private readonly SemaphoreSlim _sendLock = new(1, 1);
        public PluginInfo Info { get; } = info;
        public ConcurrentDictionary<string, TaskCompletionSource> Pending { get; } = new();

        public async Task SendAsync(JsonNode msg, CancellationToken ct)
        {
            await _sendLock.WaitAsync(ct);
            try { await socket.SendAsync(Encoding.UTF8.GetBytes(msg.ToJsonString()), WebSocketMessageType.Text, true, ct); }
            finally { _sendLock.Release(); }
        }

        public async Task CloseAsync(string reason)
        {
            try { await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, reason, CancellationToken.None); } catch { }
        }
    }
}
