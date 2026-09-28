import { useSyncExternalStore } from 'react'
import type { AutomationState, Catalog, DeckModel, Me, ObsSnapshot } from '../api/types'

export type LinkStatus = 'connecting' | 'online' | 'offline'

export interface AppState {
  me: Me | null
  decks: DeckModel[]
  catalog: Catalog | null
  automations: AutomationState[]
  /** global = Kuerzel systemweit bei Windows angemeldet; conflicts = von anderen Programmen belegt. */
  hotkeys: { global: boolean; conflicts: string[] }
  obs: ObsSnapshot | null
  link: LinkStatus
  preview: string | null
  version: string | null
}

let state: AppState = {
  me: null,
  decks: [],
  catalog: null,
  automations: [],
  hotkeys: { global: false, conflicts: [] },
  obs: null,
  link: 'connecting',
  preview: null,
  version: null,
}

const listeners = new Set<() => void>()

export function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function getState() {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Kleiner globaler Store ohne Zusatzbibliothek - Komponenten waehlen per Selektor nur ihren Ausschnitt. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}
