import type { AutomationState, ButtonModel, Catalog, ObsSnapshot, SystemMonitorSnapshot } from '../api/types'

/** Aktionstypen mit einem echten An/Aus-Zustand - nur fuer diese ergibt eine LED (gruen/rot) Sinn. */
const TOGGLE_ACTION_TYPES = new Set([
  'automation.toggle',
  'system.mute',
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

/** Ob diese Taste ueberhaupt einen An/Aus-Zustand hat (LED zeigen) statt eine reine Einmal-Aktion zu sein. */
export function buttonHasToggleState(button: ButtonModel): boolean {
  const type = button.actions[0]?.type
  return type != null && TOGGLE_ACTION_TYPES.has(type)
}

/**
 * Ob eine Taste gerade keine Funktion hat, weil sie ausschliesslich OBS steuert und OBS nicht
 * verbunden ist. Tasten mit mindestens einem anderen ausfuehrbaren Schritt (Browser oeffnen,
 * Systemlautstaerke, Ordner ...) bleiben voll bedienbar - dort werden nur die OBS-Schritte
 * uebersprungen (siehe ActionExecutor im Backend). Die Taste selbst bleibt immer erhalten.
 */
export function isButtonUnavailable(button: ButtonModel, obs: ObsSnapshot | null): boolean {
  if (obs?.status === 'connected') return false
  const steps = button.actions.filter((a) => a.type !== 'flow.delay')
  return steps.length > 0 && steps.every((a) => a.type.startsWith('obs.'))
}

/** Aktionstypen, bei denen "aktiv" = stummgeschaltet bedeutet - Warnzustand, deshalb umgekehrte
 * Zustandsfarbe (rot statt gruen), siehe .deck-key[data-mute='true'] in index.css. */
const MUTE_ACTION_TYPES = new Set(['obs.audio.mute', 'system.mute'])

/** Ob diese Taste eine Mute-Taste ist (umgekehrte Zustandsfarbe: rot = stumm statt gruen = an). */
export function isMuteAction(button: ButtonModel): boolean {
  const type = button.actions[0]?.type
  return type != null && MUTE_ACTION_TYPES.has(type)
}

/**
 * Ob eine Taste "leuchtet": abgeleitet aus dem ersten Aktionsschritt und dem Live-Zustand -
 * z.B. leuchtet "Szene wechseln: Pause", solange "Pause" live ist.
 */
export function isButtonActive(button: ButtonModel, obs: ObsSnapshot | null, automations: AutomationState[] = [], systemMonitor: SystemMonitorSnapshot | null = null): boolean {
  const step = button.actions[0]
  if (!step) return false
  const p = step.params ?? {}
  if (step.type === 'automation.toggle') return automations.find((a) => a.id === Number(p.automation))?.enabled ?? false
  // Systemlautstaerke ist kein OBS-Zustand - unabhaengig vom OBS-Verbindungsstatus pruefen, sonst
  // wuerde die LED faelschlich immer aus sein, wenn OBS gerade nicht verbunden ist.
  if (step.type === 'system.mute') return systemMonitor?.volumeMuted === true
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
  if (step.type === 'system.mute') return systemMonitor?.volumePercent != null ? systemMonitor.volumePercent / 100 : null
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
    return systemMonitor?.volumePercent != null ? { key: 'system', muted: systemMonitor.volumeMuted === true } : null
  }
  if (!obs || obs.status !== 'connected') return null
  const input = obs.audioInputs.find((a) => a.name === step.params?.input)
  return input ? { key: `obs:${input.name}`, muted: input.muted } : null
}

/** Fuer Mute-Tasten ein passenderes Icon im aktiven (stummen) Zustand. */
export function activeIcon(button: ButtonModel, active: boolean): string | null {
  if (!active) return button.icon
  const type = button.actions[0]?.type
  if (type === 'obs.audio.mute' && button.icon === 'tabler:microphone') return 'tabler:microphone-off'
  if (type === 'obs.audio.mute' && button.icon === 'tabler:volume') return 'tabler:volume-off'
  if (type === 'obs.media' && button.icon === 'tabler:player-play') return 'tabler:player-pause'
  return button.icon
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

/** Anzeigedaten fuer eine Live-Systemwert-Kachel: Label/Icon fuer den Kennwert plus formatierter und roher Wert. */
export function monitorDisplay(
  metric: string,
  snapshot: SystemMonitorSnapshot | null,
): { label: string; icon: string; value: string; raw: number | null; unavailable: boolean; hint: string | null } {
  const meta = MONITOR_METRIC_META[metric] ?? { label: metric, unit: '%' as const, icon: 'tabler:cpu' }
  if (!snapshot || !snapshot.available) return { label: meta.label, icon: meta.icon, value: '–', raw: null, unavailable: true, hint: MONITOR_UNAVAILABLE_HINT }
  const key = MONITOR_METRIC_KEYS.find((k) => k === metric)
  const raw = key ? snapshot[key] : null
  if (raw == null) return { label: meta.label, icon: meta.icon, value: '–', raw: null, unavailable: true, hint: MONITOR_UNAVAILABLE_HINT }
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
