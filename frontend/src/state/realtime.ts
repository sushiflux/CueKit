import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { api, errorMessage, getToken } from '../api/client'
import type { AppearanceSettings, AudioDevice, DisplayInfo, NowPlaying, ObsStats, TwitchSnapshot, AutomationState, Catalog, DeckModel, ObsSnapshot, SystemMonitorSnapshot } from '../api/types'
import { clearMeters, setMeters, type MeterPayload } from './meters'
import { getState, setState } from './store'

let connection: HubConnection | null = null
let systemMonitorWanted = false
let metersWanted = false
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

export async function reloadDisplays() {
  const list = await api<DisplayInfo[]>('/api/displays')
  // Ein aelterer laufender Dienst liefert statt der Liste die Startseite (HTML).
  if (Array.isArray(list)) setState({ displays: list })
}

export async function reloadAudioDevices() {
  try {
    const list = await api<AudioDevice[]>('/api/audio-devices')
    // Ein laufender, aelterer Dienst kennt die Route nicht und liefert stattdessen die Startseite (HTML) - das ist keine Liste.
    if (!Array.isArray(list)) throw new Error('Der Dienst kennt die Geräteliste noch nicht (laufende Version ist älter als die App)')
    setState({ audioDevices: list, audioDevicesError: null })
  } catch (e) {
    setState({ audioDevicesError: errorMessage(e) })
    throw e
  }
}

function applyNowPlaying(np: NowPlaying | null | undefined) {
  setState({ nowPlaying: np ? { ...np, receivedAt: Date.now() } : null })
}

export async function reloadNowPlaying() {
  applyNowPlaying(await api<NowPlaying | undefined>('/api/now-playing'))
}

export async function reloadObsStats() {
  setState({ obsStats: (await api<ObsStats | undefined>('/api/obs-stats')) ?? null })
}

export async function reloadTwitch() {
  setState({ twitch: await api<TwitchSnapshot>('/api/twitch') })
}

export async function reloadCatalog() {
  setState({ catalog: await api<Catalog>('/api/catalog') })
}

export async function reloadAppearance() {
  setState({ appearance: await api<AppearanceSettings>('/api/settings/appearance') })
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
  connection.on('systemState', (systemMonitor: SystemMonitorSnapshot) => setState({ systemMonitor }))
  connection.on('meters', (payload: MeterPayload) => setMeters(payload))
  connection.on('obsStats', (stats: ObsStats | null) => setState({ obsStats: stats }))
  connection.on('twitch', (t: TwitchSnapshot) => setState({ twitch: t }))
  connection.on('nowPlaying', (np: NowPlaying | null) => applyNowPlaying(np))
  connection.on('audioDevices', (devices: AudioDevice[]) => setState({ audioDevices: devices, audioDevicesError: null }))
  connection.on('decksChanged', () => void reloadDecks().catch(() => {}))
  connection.on('catalogChanged', () => void reloadCatalog().catch(() => {}))
  connection.on('pluginsChanged', () => window.dispatchEvent(new CustomEvent('deck:plugins')))
  connection.on('hotkeysChanged', () => void reloadHotkeyStatus().catch(() => {}))
  // Systemweites Tastenkuerzel wurde am PC gedrueckt -> offene Decks zeigen den Druck bzw. den Fehler.
  connection.on('keyTriggered', (buttonId: number, error: string | null) => {
    window.dispatchEvent(new CustomEvent('deck:keyTriggered', { detail: { buttonId, error } }))
    // HDR-/Aufloesungswechsel dauern einen Moment: Monitorliste danach neu lesen, damit die Tasten ihren Zustand zeigen.
    if (getState().displays.length > 0) window.setTimeout(() => void reloadDisplays().catch(() => {}), 1500)
  },
  )
  connection.on('automationsChanged', () => {
    void reloadAutomationStates().catch(() => {})
    window.dispatchEvent(new CustomEvent('deck:automations'))
  })
  connection.on('appearanceChanged', () => void reloadAppearance().catch(() => {}))
  connection.on('switchStates', (switchStates: Record<number, boolean>) => setState({ switchStates: switchStates ?? {} }))
  connection.on('switchStateChanged', (buttonId: number, isOn: boolean) =>
    setState({ switchStates: { ...getState().switchStates, [buttonId]: isOn } }),
  )

  connection.onreconnecting(() => setState({ link: 'connecting' }))
  connection.onreconnected(async () => {
    setState({ link: 'online' })
    // Waehrend der Trennung verpasste Aenderungen nachholen.
    await Promise.allSettled([reloadDecks(), reloadCatalog(), reloadAutomationStates(), reloadHotkeyStatus(), reloadAppearance(), reloadAudioDevices(), reloadDisplays(), reloadNowPlaying(), reloadTwitch(), reloadObsStats()])
    if (systemMonitorWanted) await connection?.invoke('SetSystemMonitor', true).catch(() => {})
    if (metersWanted) await connection?.invoke('SetMeters', true).catch(() => {})
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
    if (systemMonitorWanted) await connection.invoke('SetSystemMonitor', true)
    if (metersWanted) await connection.invoke('SetMeters', true)
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
  /** Hinweis trotz Erfolg, z.B. "OBS-Schritte uebersprungen, weil OBS nicht verbunden ist". */
  notice?: string | null
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

export async function setSystemMonitorEnabled(enabled: boolean) {
  systemMonitorWanted = enabled
  if (!enabled) setState({ systemMonitor: null })
  if (connection?.state === HubConnectionState.Connected) await connection.invoke('SetSystemMonitor', enabled).catch(() => {})
}

export async function setMetersEnabled(enabled: boolean) {
  metersWanted = enabled
  if (!enabled) clearMeters()
  if (connection?.state === HubConnectionState.Connected) await connection.invoke('SetMeters', enabled).catch(() => {})
}
