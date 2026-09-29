import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { api, getToken } from '../api/client'
import type { AutomationState, Catalog, DeckModel, ObsSnapshot, SystemMonitorSnapshot } from '../api/types'
import { setState } from './store'

let connection: HubConnection | null = null
let previewWanted = false
let systemMonitorWanted = false
let stopped = false

export async function reloadDecks() {
  setState({ decks: await api<DeckModel[]>('/api/decks') })
}

export async function reloadAutomationStates() {
  setState({ automations: await api<AutomationState[]>('/api/automation-states') })
}

export async function reloadHotkeyStatus() {
  setState({ hotkeys: await api<{ global: boolean; conflicts: string[] }>('/api/hotkeys/status') })
}

export async function reloadCatalog() {
  setState({ catalog: await api<Catalog>('/api/catalog') })
}

/** Baut die Echtzeitverbindung auf (automatischer Reconnect inklusive). */
export async function startRealtime() {
  if (connection) return
  stopped = false
  connection = new HubConnectionBuilder()
    .withUrl('/hub/deck', { accessTokenFactory: () => getToken() ?? '' })
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(1000 * 2 ** ctx.previousRetryCount, 8000) })
    .configureLogging(LogLevel.Warning)
    .build()

  connection.on('obsState', (obs: ObsSnapshot) => setState({ obs }))
  connection.on('preview', (dataUrl: string) => setState({ preview: dataUrl }))
  connection.on('systemState', (systemMonitor: SystemMonitorSnapshot) => setState({ systemMonitor }))
  connection.on('decksChanged', () => void reloadDecks().catch(() => {}))
  connection.on('catalogChanged', () => void reloadCatalog().catch(() => {}))
  connection.on('pluginsChanged', () => window.dispatchEvent(new CustomEvent('deck:plugins')))
  connection.on('hotkeysChanged', () => void reloadHotkeyStatus().catch(() => {}))
  // Systemweites Tastenkuerzel wurde am PC gedrueckt -> offene Decks zeigen den Druck bzw. den Fehler.
  connection.on('keyTriggered', (buttonId: number, error: string | null) =>
    window.dispatchEvent(new CustomEvent('deck:keyTriggered', { detail: { buttonId, error } })),
  )
  connection.on('automationsChanged', () => {
    void reloadAutomationStates().catch(() => {})
    window.dispatchEvent(new CustomEvent('deck:automations'))
  })

  connection.onreconnecting(() => setState({ link: 'connecting' }))
  connection.onreconnected(async () => {
    setState({ link: 'online' })
    // Waehrend der Trennung verpasste Aenderungen nachholen.
    await Promise.allSettled([reloadDecks(), reloadCatalog(), reloadAutomationStates(), reloadHotkeyStatus()])
    if (previewWanted) await connection?.invoke('SetPreview', true).catch(() => {})
    if (systemMonitorWanted) await connection?.invoke('SetSystemMonitor', true).catch(() => {})
  })
  connection.onclose(() => {
    if (stopped) return
    setState({ link: 'offline' })
    // Nach endgueltigem Abbruch (z.B. PC war im Standby) weiter probieren.
    connection = null
    setTimeout(() => !stopped && void startRealtime(), 5000)
  })

  setState({ link: 'connecting' })
  try {
    await connection.start()
    setState({ link: 'online' })
    if (previewWanted) await connection.invoke('SetPreview', true)
    if (systemMonitorWanted) await connection.invoke('SetSystemMonitor', true)
  } catch {
    setState({ link: 'offline' })
    connection = null
    setTimeout(() => !stopped && void startRealtime(), 3000)
  }
}

export async function stopRealtime() {
  stopped = true
  const c = connection
  connection = null
  await c?.stop().catch(() => {})
}

export interface PressResult {
  ok: boolean
  error: string | null
}

export async function pressButton(buttonId: number): Promise<PressResult> {
  if (!connection || connection.state !== HubConnectionState.Connected)
    return { ok: false, error: 'Keine Live-Verbindung zum PC. Verbindung wird wiederhergestellt …' }
  try {
    return await connection.invoke<PressResult>('Press', buttonId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Tastendruck konnte nicht gesendet werden.' }
  }
}

export async function setPreviewEnabled(enabled: boolean) {
  previewWanted = enabled
  if (!enabled) setState({ preview: null })
  if (connection?.state === HubConnectionState.Connected) await connection.invoke('SetPreview', enabled).catch(() => {})
}

export async function setSystemMonitorEnabled(enabled: boolean) {
  systemMonitorWanted = enabled
  if (!enabled) setState({ systemMonitor: null })
  if (connection?.state === HubConnectionState.Connected) await connection.invoke('SetSystemMonitor', enabled).catch(() => {})
}
