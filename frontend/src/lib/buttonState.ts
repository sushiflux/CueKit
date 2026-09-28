import type { ButtonModel, ObsSnapshot } from '../api/types'

/**
 * Ob eine Taste "leuchtet": abgeleitet aus dem ersten Aktionsschritt und dem OBS-Live-Zustand -
 * z.B. leuchtet "Szene wechseln: Pause", solange "Pause" live ist.
 */
export function isButtonActive(button: ButtonModel, obs: ObsSnapshot | null): boolean {
  if (!obs || obs.status !== 'connected') return false
  const step = button.actions[0]
  if (!step) return false
  const p = step.params ?? {}
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

/** Fuer Mute-Tasten ein passenderes Icon im aktiven (stummen) Zustand. */
export function activeIcon(button: ButtonModel, active: boolean): string | null {
  if (!active) return button.icon
  const type = button.actions[0]?.type
  if (type === 'obs.audio.mute' && button.icon === 'tabler:microphone') return 'tabler:microphone-off'
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
