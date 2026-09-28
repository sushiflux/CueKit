import type { AutomationState, ButtonModel, ObsSnapshot } from '../api/types'

/**
 * Ob eine Taste "leuchtet": abgeleitet aus dem ersten Aktionsschritt und dem Live-Zustand -
 * z.B. leuchtet "Szene wechseln: Pause", solange "Pause" live ist.
 */
export function isButtonActive(button: ButtonModel, obs: ObsSnapshot | null, automations: AutomationState[] = []): boolean {
  const step = button.actions[0]
  if (!step) return false
  const p = step.params ?? {}
  if (step.type === 'automation.toggle') return automations.find((a) => a.id === Number(p.automation))?.enabled ?? false
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
 * Pegel (0..1) fuer Lautstaerke-Tasten - die Taste zeigt dann einen Balken wie ein Fader.
 * Abbildung wie der OBS-Mixer grob: -60 dB = leer, 0 dB = voll.
 */
export function buttonLevel(button: ButtonModel, obs: ObsSnapshot | null): number | null {
  const step = button.actions[0]
  if (!step || !obs || obs.status !== 'connected') return null
  if (step.type !== 'obs.audio.volume' && step.type !== 'obs.audio.mute') return null
  const input = obs.audioInputs.find((a) => a.name === step.params?.input)
  if (!input) return null
  return Math.max(0, Math.min(1, (input.volumeDb + 60) / 60))
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
