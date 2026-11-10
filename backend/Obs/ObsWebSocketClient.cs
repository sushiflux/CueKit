using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Deck.Server.Obs;

public class ObsRequestException(string requestType, int code, string? comment)
    : Exception($"OBS lehnte '{requestType}' ab (Code {code}){(string.IsNullOrWhiteSpace(comment) ? "" : $": {comment}")}")
{
    public int Code { get; } = code;
}

/// <summary>
/// Schlanker Client fuer das obs-websocket-Protokoll v5 (seit OBS 28 fest in OBS eingebaut - kein
/// Plugin noetig). Bewusst ohne Fremdbibliothek: das Protokoll ist klein (Hello/Identify/Request/
/// Event), und so bleibt die Abhaengigkeit von einem evtl. unmaintained NuGet-Paket aus.
/// Protokoll-Referenz: obs-websocket v5, https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
/// </summary>
public sealed class ObsWebSocketClient : IAsyncDisposable
{
    // EventSubscription.All (General..Ui, Bits 0-10) - ohne die hochfrequenten Volume-Meter-Events.
    // Die Pegel-Events (Bit 16) werden nur bei Bedarf zugeschaltet, siehe ReidentifyAsync.
    public const int EventSubscriptionsAll = (1 << 11) - 1;
    public const int EventSubscriptionInputVolumeMeters = 1 << 16;

    private readonly ClientWebSocket _socket = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonNode?>> _pending = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly CancellationTokenSource _cts = new();
    private Task? _receiveLoop;

    /// <summary>eventType, eventData</summary>
    public event Action<string, JsonNode?>? EventReceived;
    public event Action<string>? Closed;

    public async Task ConnectAsync(Uri uri, string? password, CancellationToken ct, int eventSubscriptions = EventSubscriptionsAll)
    {
        _socket.Options.AddSubProtocol("obswebsocket.json");
        using var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        connectTimeout.CancelAfter(TimeSpan.FromSeconds(5));
        await _socket.ConnectAsync(uri, connectTimeout.Token);

        // Op 0: Hello
        var hello = await ReceiveMessageAsync(connectTimeout.Token)
            ?? throw new InvalidOperationException("OBS hat die Verbindung ohne Hello-Nachricht geschlossen.");
        if (hello["op"]?.GetValue<int>() != 0)
            throw new InvalidOperationException("Unerwartete erste Nachricht von OBS (kein Hello).");

        var identify = new JsonObject
        {
            ["rpcVersion"] = 1,
            ["eventSubscriptions"] = eventSubscriptions,
        };

        var auth = hello["d"]?["authentication"];
        if (auth is not null)
        {
            if (string.IsNullOrEmpty(password))
                throw new UnauthorizedAccessException("OBS verlangt ein WebSocket-Passwort, es ist aber keins hinterlegt.");
            var salt = auth["salt"]!.GetValue<string>();
            var challenge = auth["challenge"]!.GetValue<string>();
            var secret = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password + salt)));
            identify["authentication"] = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(secret + challenge)));
        }

        await SendAsync(new JsonObject { ["op"] = 1, ["d"] = identify }, connectTimeout.Token);

        // Op 2: Identified - bei falschem Passwort schliesst OBS stattdessen mit Code 4009.
        var identified = await ReceiveMessageAsync(connectTimeout.Token);
        if (identified is null)
        {
            var status = (int?)_socket.CloseStatus;
            throw status == 4009
                ? new UnauthorizedAccessException("Das OBS-WebSocket-Passwort ist falsch.")
                : new InvalidOperationException($"OBS hat die Anmeldung abgelehnt ({_socket.CloseStatusDescription ?? status?.ToString() ?? "ohne Begründung"}).");
        }
        if (identified["op"]?.GetValue<int>() != 2)
            throw new InvalidOperationException("OBS hat die Anmeldung nicht bestätigt.");

        _receiveLoop = Task.Run(() => ReceiveLoopAsync(_cts.Token));
    }

    public bool IsOpen => _socket.State == WebSocketState.Open;

    public async Task<JsonNode?> RequestAsync(string requestType, object? requestData = null, CancellationToken ct = default)
    {
        var requestId = Guid.NewGuid().ToString("N");
        var tcs = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[requestId] = tcs;

        var d = new JsonObject { ["requestType"] = requestType, ["requestId"] = requestId };
        if (requestData is not null)
            d["requestData"] = requestData as JsonNode ?? JsonSerializer.SerializeToNode(requestData);

        try
        {
            await SendAsync(new JsonObject { ["op"] = 6, ["d"] = d }, ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            await using (timeout.Token.Register(() => tcs.TrySetCanceled()))
                return await tcs.Task;
        }
        finally
        {
            _pending.TryRemove(requestId, out _);
        }
    }

    /// <summary>Aendert die abonnierten Event-Gruppen zur Laufzeit (Op 3 "Reidentify") - z.B. um die
    /// hochfrequenten Pegel-Events nur zuzuschalten, solange jemand sie anzeigt.</summary>
    public Task ReidentifyAsync(int eventSubscriptions, CancellationToken ct = default) =>
        SendAsync(new JsonObject { ["op"] = 3, ["d"] = new JsonObject { ["eventSubscriptions"] = eventSubscriptions } }, ct);

    private async Task SendAsync(JsonNode message, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(message.ToJsonString());
        await _sendLock.WaitAsync(ct);
        try { await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, ct); }
        finally { _sendLock.Release(); }
    }

    private async Task<JsonNode?> ReceiveMessageAsync(CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        using var ms = new MemoryStream();
        while (true)
        {
            var result = await _socket.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, result.Count);
            if (result.EndOfMessage) break;
        }
        return JsonNode.Parse(ms.ToArray());
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var reason = "Verbindung zu OBS getrennt.";
        try
        {
            while (!ct.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                var msg = await ReceiveMessageAsync(ct);
                if (msg is null)
                {
                    reason = _socket.CloseStatusDescription is { Length: > 0 } desc ? $"OBS hat die Verbindung beendet: {desc}" : "OBS wurde beendet oder hat die Verbindung geschlossen.";
                    break;
                }
                Dispatch(msg);
            }
        }
        catch (OperationCanceledException) { return; }
        catch (Exception ex) { reason = $"Verbindung zu OBS abgebrochen: {ex.Message}"; }

        foreach (var tcs in _pending.Values)
            tcs.TrySetException(new InvalidOperationException(reason));
        Closed?.Invoke(reason);
    }

    private void Dispatch(JsonNode msg)
    {
        var op = msg["op"]?.GetValue<int>();
        var d = msg["d"];
        switch (op)
        {
            case 5: // Event
                EventReceived?.Invoke(d?["eventType"]?.GetValue<string>() ?? "", d?["eventData"]);
                break;
            case 7: // RequestResponse
                var id = d?["requestId"]?.GetValue<string>();
                if (id is null || !_pending.TryGetValue(id, out var tcs)) return;
                var status = d!["requestStatus"];
                if (status?["result"]?.GetValue<bool>() == true)
                    tcs.TrySetResult(d["responseData"]);
                else
                    tcs.TrySetException(new ObsRequestException(
                        d["requestType"]?.GetValue<string>() ?? "?",
                        status?["code"]?.GetValue<int>() ?? 0,
                        status?["comment"]?.GetValue<string>()));
                break;
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        try
        {
            if (_socket.State == WebSocketState.Open)
                await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
        }
        catch { /* beim Aufraeumen egal */ }
        if (_receiveLoop is not null)
        {
            try { await _receiveLoop.WaitAsync(TimeSpan.FromSeconds(2)); } catch { }
        }
        _socket.Dispose();
        _cts.Dispose();
    }
}
