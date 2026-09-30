import { useSyncExternalStore } from 'react'

/**
 * Live-Pegel (dB) - bewusst ein eigener kleiner Store statt Teil des globalen App-Stores: die Werte
 * kommen bis ~20x pro Sekunde, und nur die einzelnen Pegelbalken sollen dafuer neu zeichnen, nicht
 * das ganze Deck. Schluessel: "obs:<Eingangsname>" oder "system" - jeweils der Pegel nach Fader/Stumm; mit
 * Suffix ":in" der Eingangspegel VOR Fader/Stumm (zeigt bei stummgeschalteter Quelle weiter das Signal).
 */
export interface MeterPayload {
  obs: Record<string, { peak: number; inputPeak: number }>
  system: number | null
}

export const INPUT_LEVEL_SUFFIX = ':in'

let levels: Record<string, number> = {}
const listeners = new Set<() => void>()

export function setMeters(payload: MeterPayload) {
  const next: Record<string, number> = {}
  for (const [name, level] of Object.entries(payload.obs ?? {})) {
    next[`obs:${name}`] = level.peak
    next[`obs:${name}${INPUT_LEVEL_SUFFIX}`] = level.inputPeak
  }
  if (payload.system != null) {
    next.system = payload.system
    next[`system${INPUT_LEVEL_SUFFIX}`] = payload.system
  }
  levels = next
  listeners.forEach((l) => l())
}

export function clearMeters() {
  if (Object.keys(levels).length === 0) return
  levels = {}
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Aktueller Pegel in dB fuer einen Schluessel, oder null, solange noch kein Wert eingetroffen ist. */
export function useMeterDb(key: string | null): number | null {
  return useSyncExternalStore(subscribe, () => (key ? (levels[key] ?? null) : null))
}
