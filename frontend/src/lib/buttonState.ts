import { getState } from '../state/store'
import type { TwitchSnapshot } from '../api/types'
import type { AudioOrigin } from './origin'
import type { ActionStep, AutomationState, ButtonModel, Catalog, ObsSnapshot, SystemMonitorSnapshot } from '../api/types'

/** Aktionstypen mit einem echten An/Aus-Zustand - nur fuer diese ergibt eine LED (gruen/rot) Sinn. */
const TOGGLE_ACTION_TYPES = new Set([
  'automation.toggle',
  'system.mute',
  'system.hdr',
  'system.resolution',
  'system.resolution.toggle',
  'obs.scene.switch',
  'obs.scene.preview',
  'obs.source.visibility',
  'obs.filter',
  'obs.audio.mute',
  'obs.media',
  'obs.transition.set',
  'obs.collection',
  'obs.profile',
  'obs.stream',
  'obs.record',
  'obs.record.pause',
  'obs.replay',
  'obs.vcam',
  'obs.studio',
])

/** Gewaehltes Windows-Audiogeraet eines system.*-Schritts ("" = Standard-Ausgabe). */
function stepDeviceId(step: ActionStep): string {
  return step.params?.device ? String(step.params.device) : ''
}

/**
 * Stumm-Zustand eines system.mute-Schritts: bei gewaehltem Geraet aus der Geraeteliste, sonst die
 * Standard-Ausgabe aus dem Monitor-Schnappschuss. Die Geraeteliste kommt aus dem globalen Store (die
 * rendernden Seiten abonnieren sie, damit sie bei Aenderungen neu zeichnen).
 */
function systemMuteState(step: ActionStep, systemMonitor: SystemMonitorSnapshot | null): boolean | null {
  const id = stepDeviceId(step)
  if (id) return getState().audioDevices.find((d) => d.id === id)?.muted ?? null
  return systemMonitor?.volumeMuted ?? null
}

/** Der Monitor, den ein system.hdr-/system.resolution*-Schritt steuert (aus der Monitorliste im Store). */
function stepDisplay(step: ActionStep) {
  const id = step.params?.display ? String(step.params.display) : ''
  return id ? getState().displays.find((d) => d.id === id) : undefined
}

/** Zustand der Monitor-Tasten: HDR an, bzw. diese Aufloesung ist gerade eingestellt (beim Umschalter: die zweite = B). Null = kein Monitor-Schritt. */
function displayStepActive(step: ActionStep): boolean | null {
  if (step.type !== 'system.hdr' && step.type !== 'system.resolution' && step.type !== 'system.resolution.toggle') return null
  const d = stepDisplay(step)
  if (!d) return false
  const p = step.params ?? {}
  if (step.type === 'system.hdr') return p.mode === 'off' ? !d.hdrEnabled : d.hdrEnabled
  // Bei gedrehten Monitoren zaehlt auch die vertauschte Schreibweise (aeltere Tasten: 2160x3840 statt 3840x2160).
  const is = (w: number, h: number) => (d.width === w && d.height === h) || (!!d.rotated && d.width === h && d.height === w)
  if (step.type === 'system.resolution') return is(Number(p.width), Number(p.height))
  return is(Number(p.widthB), Number(p.heightB))
}

/** Ob diese Taste ueberhaupt einen An/Aus-Zustand hat (LED zeigen) statt eine reine Einmal-Aktion zu sein. */
export function buttonHasToggleState(button: ButtonModel): boolean {
  const type = button.actions[0]?.type
  return type != null && (TOGGLE_ACTION_TYPES.has(type) || type === 'deck.multiSwitch')
}

/**
 * Ob eine Taste gerade keine Funktion hat, weil sie ausschliesslich OBS steuert und OBS nicht
 * verbunden ist. Tasten mit mindestens einem anderen ausfuehrbaren Schritt (Browser oeffnen,
 * Systemlautstaerke, Ordner ...) bleiben voll bedienbar - dort werden nur die OBS-Schritte
 * uebersprungen (siehe ActionExecutor im Backend). Die Taste selbst bleibt immer erhalten.
 */
export function isButtonUnavailable(button: ButtonModel, obs: ObsSnapshot | null): boolean {
  if (obs?.status === 'connected') return false
  if (button.actions[0]?.type === 'deck.multiSwitch') {
    const p = button.actions[0].params as any
    const onSteps: ActionStep[] = Array.isArray(p?.onSteps) ? p.onSteps : []
    const offSteps: ActionStep[] = Array.isArray(p?.offSteps) ? p.offSteps : []
    const all = [...onSteps, ...offSteps].filter((a) => a.type !== 'flow.delay')
    return all.length > 0 && all.every((a) => needsStreamingSoftware(a.type))
  }
  const steps = button.actions.filter((a) => a.type !== 'flow.delay')
  return steps.length > 0 && steps.every((a) => needsStreamingSoftware(a.type))
}

/** Aktionen, die eine Verbindung zur Streaming-Software brauchen. Kommen Streamlabs/XSplit dazu, hier ihre
 * Praefixe ergaenzen (z.B. 'streamlabs.', 'xsplit.') - dann werden auch ihre Tasten ohne Verbindung grau. */
const STREAMING_SOFTWARE_PREFIXES = ['obs.']
function needsStreamingSoftware(actionType: string): boolean {
  return STREAMING_SOFTWARE_PREFIXES.some((p) => actionType.startsWith(p))
}

/** Aktionstypen mit UMGEKEHRTER Zustandsfarbe: "aktiv" ist der Zustand, auf den man achten muss, deshalb rot - und "inaktiv"
 * gruen. Stumm (aktiv = stummgeschaltet) sowie Stream und Aufnahme (aktiv = du bist live bzw. nimmst auf, wie das rote
 * Aufnahme-Laempchen). Siehe .deck-key[data-mute='true'] in index.css (der Attributname stammt noch von den Mute-Tasten). */
const INVERTED_STATE_ACTION_TYPES = new Set(['obs.audio.mute', 'system.mute', 'obs.stream', 'obs.record', 'obs.record.pause'])

/** Aktionen, bei denen "aktiv" nur heisst "diese Auswahl ist gerade gewaehlt" (Szene, Uebergang, Profil ...) - ein
 * nicht gewaehlter Eintrag ist kein "Aus"-Zustand und wird deshalb nie rot eingefaerbt. */
const SELECTION_ACTION_TYPES = new Set(['system.resolution', 'system.resolution.toggle', 'obs.scene.switch', 'obs.scene.preview', 'obs.transition.set', 'obs.collection', 'obs.profile'])

/** Art des Zustands einer Taste: "onoff" (An = gruen, Aus = rot), "select" (nur "gewaehlt" = gruen) oder null (kein Zustand). */
export function buttonStateKind(button: ButtonModel): 'onoff' | 'select' | null {
  const type = button.actions[0]?.type
  if (type === 'deck.multiSwitch') return 'onoff'
  if (type == null || !TOGGLE_ACTION_TYPES.has(type)) return null
  return SELECTION_ACTION_TYPES.has(type) ? 'select' : 'onoff'
}

/** Ob die Taste gerade den "pausiert"-Zustand zeigt (orange): die Pause-Taste selbst, wenn pausiert ist - und die Aufnahme-Taste
 * waehrend einer pausierten Aufnahme. */
export function isRecordPausedState(button: ButtonModel, active: boolean, recordPaused: boolean): boolean {
  const type = button.actions[0]?.type
  return recordPaused && active && (type === 'obs.record' || type === 'obs.record.pause')
}

/** Ob diese Taste umgekehrte Zustandsfarben hat (Mute, Stream, Aufnahme): rot = aktiv/laeuft, gruen = inaktiv. */
export function isInvertedStateAction(button: ButtonModel): boolean {
  const type = button.actions[0]?.type
  return type != null && INVERTED_STATE_ACTION_TYPES.has(type)
}

/**
 * Ermittelt den Zustand eines Multi-Aktionsschalters: Wenn Schritte live beobachtbare OBS-Ziele
 * steuern (z.B. Audio-Stummschaltungen), wird der Zustand direkt live ausgewertet.
 * Sonst greift der synchronisierte Schaltzustand.
 */
export function isMultiSwitchActive(
  step: ActionStep,
  obs: ObsSnapshot | null,
  systemMonitor: SystemMonitorSnapshot | null,
  fallbackState?: boolean,
): boolean {
  const p = step.params as any
  const onSteps: ActionStep[] = Array.isArray(p?.onSteps) ? p.onSteps : []

  if (obs && obs.status === 'connected') {
    let testable = 0
    let active = 0
    for (const s of onSteps) {
      if (s.type === 'obs.audio.mute') {
        const input = s.params?.input
        if (!input) continue
        const audio = obs.audioInputs.find((a) => a.name === input)
        if (!audio) continue
        testable++
        const mode = s.params?.mode ?? 'toggle'
        const matches = mode === 'off' ? !audio.muted : mode === 'on' ? audio.muted : !audio.muted
        if (matches) active++
      } else if (s.type === 'obs.source.visibility') {
        const sceneName = s.params?.scene
        const sourceName = s.params?.source
        if (!sceneName || !sourceName) continue
        const sc = obs.scenes.find((x) => x.name === sceneName)
        const item = sc?.items.find((i) => i.sourceName === sourceName)
        if (!item) continue
        testable++
        const mode = s.params?.mode ?? 'toggle'
        const matches = mode === 'off' ? !item.enabled : item.enabled
        if (matches) active++
      } else if (s.type === 'obs.stream') {
        testable++
        const mode = s.params?.mode ?? 'toggle'
        const matches = mode === 'off' ? !obs.streaming : obs.streaming
        if (matches) active++
      } else if (s.type === 'obs.record') {
        testable++
        const mode = s.params?.mode ?? 'toggle'
        const matches = mode === 'off' ? !obs.recording : obs.recording
        if (matches) active++
      }
    }
    if (testable > 0) {
      return active === testable
    }
  }

  const muteStep = onSteps.find((x) => x.type === 'system.mute')
  if (muteStep) {
    const muted = systemMuteState(muteStep, systemMonitor)
    if (muted != null) {
      const mode = muteStep.params?.mode ?? 'toggle'
      return mode === 'off' ? !muted : mode === 'on' ? muted : !muted
    }
  }

  return fallbackState ?? false
}

/**
 * Ob eine Taste "leuchtet": abgeleitet aus dem ersten Aktionsschritt und dem Live-Zustand -
 * z.B. leuchtet "Szene wechseln: Pause", solange "Pause" live ist.
 */
export function isButtonActive(
  button: ButtonModel,
  obs: ObsSnapshot | null,
  automations: AutomationState[] = [],
  systemMonitor: SystemMonitorSnapshot | null = null,
  switchStates: Record<number, boolean> = {},
): boolean {
  const step = button.actions[0]
  if (!step) return false
  if (step.type === 'deck.multiSwitch') {
    return isMultiSwitchActive(step, obs, systemMonitor, switchStates[button.id])
  }
  const p = step.params ?? {}
  if (step.type === 'automation.toggle') return automations.find((a) => a.id === Number(p.automation))?.enabled ?? false
  // Systemlautstaerke ist kein OBS-Zustand - unabhaengig vom OBS-Verbindungsstatus pruefen, sonst
  // wuerde die LED faelschlich immer aus sein, wenn OBS gerade nicht verbunden ist.
  if (step.type === 'system.mute') return systemMuteState(step, systemMonitor) === true
  const displayActive = displayStepActive(step)
  if (displayActive != null) return displayActive
  if (!obs || obs.status !== 'connected') return false
  switch (step.type) {
    case 'obs.scene.switch':
      return obs.programScene === p.scene
    case 'obs.scene.preview':
      return obs.studioMode && obs.previewScene === p.scene
    case 'obs.source.visibility': {
      const scene = obs.scenes.find((s) => s.name === p.scene)
      return scene?.items.find((i) => i.sourceName === p.source)?.enabled ?? false
    }
    case 'obs.filter':
      return obs.filters.find((f) => f.source === p.source && f.filterName === p.filter)?.enabled ?? false
    case 'obs.audio.mute':
      return obs.audioInputs.find((a) => a.name === p.input)?.muted ?? false
    case 'obs.media':
      return (p.mode ?? 'playpause') === 'playpause' || p.mode === 'play' ? (obs.mediaInputs.find((m) => m.name === p.input)?.playing ?? false) : false
    case 'obs.transition.set':
      return obs.currentTransition === p.transition
    case 'obs.collection':
      return obs.currentSceneCollection === p.collection
    case 'obs.profile':
      return obs.currentProfile === p.profile
    case 'obs.stream':
      return obs.streaming
    case 'obs.record':
      return obs.recording
    case 'obs.record.pause':
      return obs.recordPaused
    case 'obs.replay':
      return obs.replayBuffer
    case 'obs.vcam':
      return obs.virtualCam
    case 'obs.studio':
      return obs.studioMode
    default:
      return false
  }
}

/**
 * Lautstaerke (0..1) einer Quelle als Fader-Balken - nur an den Quellen-Tasten (Stumm/Ton an), NICHT an
 * den Lauter/Leiser-Tasten: dort waeren es dieselben Balken doppelt (die Quelle hat ja ihre eigene
 * Taste). Abbildung wie der OBS-Mixer grob: -60 dB = leer, 0 dB = voll.
 */
export function buttonLevel(button: ButtonModel, obs: ObsSnapshot | null, systemMonitor: SystemMonitorSnapshot | null = null): number | null {
  const step = button.actions[0]
  if (!step) return null
  // Systemlautstaerke ist kein OBS-Zustand - unabhaengig vom OBS-Verbindungsstatus pruefen.
  if (step.type === 'system.mute') {
    const id = stepDeviceId(step)
    if (id) {
      const device = getState().audioDevices.find((d) => d.id === id)
      return device ? device.percent / 100 : null
    }
    return systemMonitor?.volumePercent != null ? systemMonitor.volumePercent / 100 : null
  }
  if (!obs || obs.status !== 'connected') return null
  if (step.type !== 'obs.audio.mute') return null
  const input = obs.audioInputs.find((a) => a.name === step.params?.input)
  if (!input) return null
  return Math.max(0, Math.min(1, (input.volumeDb + 60) / 60))
}

const METER_ACTION_TYPES = new Set(['obs.audio.mute', 'system.mute'])

/** Ob diese Taste einen Live-Pegel zeigen kann (Stumm-Taste einer OBS-Audioquelle oder des Systems). */
export function buttonNeedsMeters(button: ButtonModel): boolean {
  const type = button.actions[0]?.type
  return type != null && METER_ACTION_TYPES.has(type)
}

/**
 * Live-Pegel einer Taste: Schluessel im Pegel-Store ("obs:<Eingang>" bzw. "system") und ob das Geraet
 * stummgeschaltet ist (dann zeigt der Pegel grau statt farbig, wie in OBS). Null, wenn die Taste
 * keinen Pegel hat oder die Quelle gerade nicht verfuegbar ist.
 */
export function buttonMeter(button: ButtonModel, obs: ObsSnapshot | null, systemMonitor: SystemMonitorSnapshot | null = null): { key: string; muted: boolean } | null {
  const step = button.actions[0]
  if (!step || !METER_ACTION_TYPES.has(step.type)) return null
  if (step.type === 'system.mute') {
    const id = stepDeviceId(step)
    if (id) {
      const device = getState().audioDevices.find((d) => d.id === id)
      return device ? { key: `win:${id}`, muted: device.muted } : null
    }
    return systemMonitor?.volumePercent != null ? { key: 'system', muted: systemMonitor.volumeMuted === true } : null
  }
  if (!obs || obs.status !== 'connected') return null
  const input = obs.audioInputs.find((a) => a.name === step.params?.input)
  return input ? { key: `obs:${input.name}`, muted: input.muted } : null
}

/** Fuer Mute-Tasten und Multi-Aktionsschalter ein passenderes Icon im aktiven bzw. inaktiven Zustand. */
export function activeIcon(button: ButtonModel, active: boolean): string | null {
  if (button.actions[0]?.type === 'deck.multiSwitch') {
    const p = button.actions[0].params as any
    if (!active && p?.iconOff) return p.iconOff
    if (active && p?.iconOn) return p.iconOn
    return button.icon
  }
  const volumeIcon = volumeStepIcon(button)
  if (volumeIcon) return volumeIcon
  if (!active) return button.icon
  const type = button.actions[0]?.type
  if (type === 'obs.audio.mute' && button.icon === 'tabler:microphone') return 'tabler:microphone-off'
  if (type === 'obs.audio.mute' && button.icon === 'tabler:volume') return 'tabler:volume-off'
  if (type === 'obs.media' && button.icon === 'tabler:player-play') return 'tabler:player-pause'
  return button.icon
}

const VOLUME_ACTION_TYPES = new Set(['obs.audio.volume', 'system.volume'])
const GENERIC_VOLUME_ICONS = new Set(['', 'tabler:volume', 'tabler:volume-2', 'tabler:volume-3'])
/** Standard-Beschriftungen aus der Palette, die durch den Namen der Audioquelle ersetzt werden (eigene Beschriftungen bleiben). */
const GENERIC_AUDIO_LABELS = new Set(['', 'Lautstärke ändern', 'Lautstärke', 'Lauter', 'Leiser', 'Audioquelle +', 'Audioquelle −', 'Audioquelle', 'Systemlautstärke', 'Systemlautstärke +', 'Systemlautstärke −', 'Stumm / Ton an'])

/** Lauter-/Leiser-/Festwert-Taste mit Standard-Icon (eigene Icons bleiben unberuehrt). */
function volumeStepIcon(button: ButtonModel): string | null {
  const step = button.actions[0]
  if (!step || !VOLUME_ACTION_TYPES.has(step.type) || !GENERIC_VOLUME_ICONS.has(button.icon ?? '')) return null
  const mode = step.params?.mode
  // Lautsprecher + Plus (lauter), + Minus (leiser), + Gleichheitszeichen (springt auf einen festen Wert)
  return mode === 'up' ? 'mdi:volume-plus' : mode === 'down' ? 'mdi:volume-minus' : mode === 'set' ? 'mdi:volume-equal' : null
}

/** Name der Audioquelle fuer Lautstaerke-/Stumm-Tasten mit Standard-Beschriftung ("Lautstärke ändern" -> "Mikrofon"); sonst null. */
function audioSourceLabel(button: ButtonModel): string | null {
  const step = button.actions[0]
  if (!step || !GENERIC_AUDIO_LABELS.has(button.label.trim())) return null
  if (step.type === 'obs.audio.volume' || step.type === 'obs.audio.mute') return step.params?.input ? String(step.params.input) : null
  if (step.type === 'system.volume' || step.type === 'system.mute') {
    const id = stepDeviceId(step)
    return id ? (getState().audioDevices.find((d) => d.id === id)?.name ?? null) : 'System'
  }
  return null
}

/** Woher die Audioquelle einer Taste kommt: "windows" (System/Windows-Geraet) oder "obs" (OBS-Quelle); null = keine Audio-Taste. */
export function buttonOrigin(button: ButtonModel): AudioOrigin | null {
  const type = button.actions[0]?.type
  if (type === 'system.mute' || type === 'system.volume') return 'windows'
  if (type === 'obs.audio.mute' || type === 'obs.audio.volume') return 'obs'
  return null
}

/** Beschriftung einer Taste - Multi-Aktionsschalter können im Aus-Zustand eine abweichende Beschriftung zeigen. */
export function activeLabel(button: ButtonModel, active: boolean): string {
  if (button.actions[0]?.type === 'deck.multiSwitch') {
    const p = button.actions[0].params as any
    if (!active && p?.labelOff) return p.labelOff
    if (active && p?.labelOn) return p.labelOn
  }
  // Aufloesungs-Umschalter: die Taste zeigt immer die aktuell eingestellte Aufloesung des Monitors.
  if (button.actions[0]?.type === 'system.resolution.toggle') {
    const d = stepDisplay(button.actions[0])
    if (d) return `${d.width}×${d.height}`
  }
  return audioSourceLabel(button) ?? button.label
}

/**
 * Fuer reine Anzeige-Kacheln (z.B. Live-Systemwert): der Kennwert-Schluessel des ersten Schritts,
 * sofern der Aktionstyp laut Katalog als "displayOnly" markiert ist - sonst null (normale Taste).
 */
export function displayMetric(button: ButtonModel, catalog: Catalog | null): string | null {
  const step = button.actions[0]
  if (!step) return null
  const def = catalog?.actions.find((a) => a.type === step.type)
  if (!def?.displayOnly) return null
  return step.params?.metric != null ? String(step.params.metric) : null
}

const SYSTEM_MONITOR_ACTION_TYPES = new Set(['system.monitor.display', 'system.mute'])

/** Ob diese Taste Live-Systemwerte braucht (Anzeige-Kachel oder LED/Lautstaerke der Systemquelle). */
export function buttonNeedsSystemMonitor(button: ButtonModel): boolean {
  const step = button.actions[0]
  return step != null && SYSTEM_MONITOR_ACTION_TYPES.has(step.type)
}

const MONITOR_METRIC_META: Record<string, { label: string; unit: '%' | '°C'; icon: string }> = {
  cpuLoad: { label: 'CPU', unit: '%', icon: 'tabler:cpu' },
  cpuTemp: { label: 'CPU', unit: '°C', icon: 'tabler:thermometer' },
  gpuLoad: { label: 'GPU', unit: '%', icon: 'tabler:gpu' },
  gpuTemp: { label: 'GPU', unit: '°C', icon: 'tabler:thermometer' },
  ramLoad: { label: 'RAM', unit: '%', icon: 'tabler:database' },
}

const MONITOR_METRIC_KEYS = ['cpuLoad', 'cpuTemp', 'gpuLoad', 'gpuTemp', 'ramLoad'] as const satisfies readonly (keyof SystemMonitorSnapshot)[]

/** Auslastungs-Kennwerte (0-100%) - diese bekommen den Fortschrittsring statt der Temperatur-Anzeige. */
const MONITOR_LOAD_METRICS = new Set(['cpuLoad', 'gpuLoad', 'ramLoad'])

/** Ob dieser Kennwert ein 0-100%-Auslastungswert ist (Ring-Darstellung sinnvoll) statt z.B. einer Temperatur. */
export function isMonitorLoadMetric(metric: string): boolean {
  return MONITOR_LOAD_METRICS.has(metric)
}

/** Erklaerender Hinweis, wenn Live-Systemwerte grundsaetzlich nicht verfuegbar sind (z.B. im Docker-Dev-Container). */
const MONITOR_UNAVAILABLE_HINT = 'Nur verfügbar, wenn der Dienst nativ unter Windows läuft (nicht im Docker-Container)'

const TWITCH_META: Record<string, { label: string; icon: string }> = {
  twitchViewers: { label: 'Zuschauer', icon: 'tabler:eye' },
  twitchFollowers: { label: 'Follower', icon: 'tabler:heart' },
  twitchSubs: { label: 'Subs', icon: 'tabler:star' },
  twitchUptime: { label: 'Live seit', icon: 'tabler:clock' },
}

export function isTwitchMetric(metric: string): boolean {
  return metric in TWITCH_META
}

/** 4321 -> "4.321", 12345 -> "12,3k" - kurz genug fuer eine Kachel. */
export function formatCount(n: number): string {
  return n >= 10000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k` : n.toLocaleString('de-DE')
}

/**
 * Anzeigedaten einer Twitch-Kachel (gleiche Form wie monitorDisplay). Stream-Zeit: bevorzugt der Start des OBS-Streams,
 * sonst - bei einem Twitch-Stream ohne OBS - dessen Start laut Twitch.
 */
export function twitchDisplay(
  metric: string,
  twitch: TwitchSnapshot | null,
  obsStreamStartedAt: string | null,
  now: number,
): { label: string; icon: string; value: string; raw: number | null; unavailable: boolean; hint: string | null } {
  const meta = TWITCH_META[metric] ?? { label: metric, icon: 'tabler:brand-twitch' }
  const unavailable = (hint: string) => ({ label: meta.label, icon: meta.icon, value: '–', raw: null, unavailable: true, hint })
  const ok = (value: string, raw: number | null = null) => ({ label: meta.label, icon: meta.icon, value, raw, unavailable: false, hint: null })
  if (!twitch?.configured || !twitch.connected) return unavailable('Twitch ist nicht verbunden – Einstellungen > Twitch.')
  switch (metric) {
    case 'twitchViewers':
      return twitch.live ? ok(formatCount(twitch.viewers), twitch.viewers) : unavailable('Dein Kanal ist gerade nicht live auf Twitch.')
    case 'twitchFollowers':
      return twitch.followers != null ? ok(formatCount(twitch.followers), twitch.followers) : unavailable(twitch.error ?? 'Follower werden geladen …')
    case 'twitchSubs':
      if (!twitch.subsAvailable) return unavailable('Subs gibt es nur für Twitch-Affiliates und -Partner.')
      return twitch.subs != null ? ok(formatCount(twitch.subs), twitch.subs) : unavailable(twitch.error ?? 'Subs werden geladen …')
    case 'twitchUptime': {
      const since = obsStreamStartedAt ?? (twitch.live ? twitch.startedAt : null)
      return since ? ok(formatDuration(since, now)) : unavailable('Gerade wird nicht gestreamt.')
    }
    default:
      return unavailable('Unbekannter Twitch-Kennwert.')
  }
}

/** Anzeigedaten fuer eine Live-Systemwert-Kachel: Label/Icon fuer den Kennwert plus formatierter und roher Wert. */
export function monitorDisplay(
  metric: string,
  snapshot: SystemMonitorSnapshot | null,
): { label: string; icon: string; value: string; raw: number | null; unavailable: boolean; hint: string | null } {
  const meta = MONITOR_METRIC_META[metric] ?? { label: metric, unit: '%' as const, icon: 'tabler:cpu' }
  if (!snapshot || !snapshot.available) return { label: meta.label, icon: meta.icon, value: '–', raw: null, unavailable: true, hint: MONITOR_UNAVAILABLE_HINT }
  const key = MONITOR_METRIC_KEYS.find((k) => k === metric)
  const raw = key ? snapshot[key] : null
  const isTemp = metric.endsWith('Temp')
  if (raw == null || (isTemp && raw <= 0)) {
    const hint = metric === 'cpuTemp'
      ? 'CPU-Temperatur nicht verfügbar. Unter Windows sind für CPU-Sensoren in der Regel Administratorrechte erforderlich. Bei manchen Prozessorgenerationen (z.B. AMD Ryzen 9000 / Zen 5) wird die interne Sensortabelle derzeit noch nicht unterstützt.'
      : 'Sensorwert nicht verfügbar'
    return { label: meta.label, icon: meta.icon, value: '–', raw: null, unavailable: true, hint }
  }
  return { label: meta.label, icon: meta.icon, value: `${Math.round(raw)}${meta.unit}`, raw, unavailable: false, hint: null }
}

export function formatDuration(since: string | null, now: number): string {
  if (!since) return '00:00'
  const total = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
