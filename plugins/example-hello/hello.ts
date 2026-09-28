/**
 * Minimal-Plugin als Vorlage fuer die Community (Protokoll: docs/PLUGIN_PROTOCOL.md).
 *
 * Start (Node 24 fuehrt TypeScript direkt aus):
 *   Normalerweise installiert und startet CueKit das Plugin selbst (ZIP, siehe manifest.json).
 *   Zum Entwickeln manuell: DECK_URL="ws://localhost:5201/ws/plugins" DECK_KEY="<schluessel aus der App>" node hello.ts
 */

const url = process.env.DECK_URL ?? 'ws://localhost:5202/ws/plugins'
const key = process.env.DECK_KEY ?? ''

type Invoke = { type: 'invoke'; invocationId: string; action: string; params: Record<string, unknown> }

function connect() {
  const ws = new WebSocket(`${url}?key=${encodeURIComponent(key)}`)

  ws.addEventListener('open', () => {
    ws.send(
      JSON.stringify({
        type: 'register',
        plugin: {
          id: 'dev.example.hello',
          name: 'Hallo Welt',
          version: '1.0.0',
          author: 'Community',
          icon: 'tabler:hand-stop',
          actions: [
            {
              id: 'greet',
              name: 'Grüßen',
              description: 'Schreibt einen Gruß ins Plugin-Log.',
              icon: 'tabler:message-circle',
              color: 'teal',
              fields: [{ key: 'name', label: 'Name', kind: 'text', required: true, default: 'Chat' }],
            },
          ],
        },
      }),
    )
  })

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data)) as { type: string } & Partial<Invoke>
    if (msg.type === 'registered') console.log('Beim Dienst angemeldet.')
    if (msg.type !== 'invoke') return

    try {
      if (msg.action === 'greet') {
        const text = `Hallo ${String(msg.params?.name ?? 'Welt')}!`
        console.log(text)
        ws.send(JSON.stringify({ type: 'log', message: text }))
      }
      ws.send(JSON.stringify({ type: 'result', invocationId: msg.invocationId, ok: true }))
    } catch (e) {
      ws.send(JSON.stringify({ type: 'result', invocationId: msg.invocationId, ok: false, error: e instanceof Error ? e.message : String(e) }))
    }
  })

  ws.addEventListener('close', (event) => {
    console.log(`Verbindung getrennt (${event.code} ${event.reason}) – neuer Versuch in 3 s`)
    setTimeout(connect, 3000)
  })
}

connect()
