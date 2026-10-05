import { useSyncExternalStore } from 'react'
import type { AppearanceSettings, AudioDevice, NowPlaying, TwitchSnapshot, AutomationState, Catalog, DeckModel, Me, ObsSnapshot, SystemMonitorSnapshot } from '../api/types'

export type LinkStatus = 'connecting' | 'online' | 'offline'

export interface AppState {
  me: Me | null
  decks: DeckModel[]
  catalog: Catalog | null
  automations: AutomationState[]
  /** global = Kuerzel systemweit bei Windows angemeldet; conflicts = von anderen Programmen belegt. */
  hotkeys: { global: boolean; conflicts: string[] }
  obs: ObsSnapshot | null
  /** Live-Systemwerte (CPU/GPU/RAM) - nur gesetzt, waehrend mindestens eine Anzeige-Kachel sichtbar ist. */
  systemMonitor: SystemMonitorSnapshot | null
  link: LinkStatus
  version: string | null
  /** Globale Aussehen-Einstellungen (Zustandsanzeige-Standard, Tastendruckverhalten, Deck-Hintergrund). */
  appearance: AppearanceSettings | null
  /** Schaltzustände für Multi-Aktionsschalter (buttonId -> isOn). */
  switchStates: Record<number, boolean>
  /** Alle aktiven Windows-Audiogeraete (Ausgaben + Mikrofone); live nur, solange ein Abo (Stumm-Taste/Display) laeuft. */
  audioDevices: AudioDevice[]
  /** Konkrete Fehlermeldung, falls die Geraeteliste nicht geladen werden konnte (sonst null). */
  audioDevicesError: string | null
  /** Laufende Wiedergabe; receivedAt = lokale Empfangszeit (ms), ab der die Anzeige selbst weiterrechnet. */
  nowPlaying: (NowPlaying & { receivedAt: number }) | null
  /** Twitch-Live-Zahlen des verbundenen Kanals (oeffentlicher Stand, keine Zugangsdaten). */
  twitch: TwitchSnapshot | null
}

let state: AppState = {
  me: null,
  decks: [],
  catalog: null,
  automations: [],
  hotkeys: { global: false, conflicts: [] },
  obs: null,
  systemMonitor: null,
  link: 'connecting',
  version: null,
  appearance: null,
  switchStates: {},
  audioDevices: [],
  audioDevicesError: null,
  nowPlaying: null,
  twitch: null,
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
