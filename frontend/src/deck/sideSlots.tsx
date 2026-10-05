import { api, errorMessage } from '../api/client'
import type { AudioDevice, DeckModel, ObsSnapshot, SideDisplay as SideDisplayModel, SystemMonitorSnapshot } from '../api/types'
import type { SideSlot } from '../components/DeckGrid'
import { SideDisplay, sideDisplayInfo } from '../components/SideDisplay'
import { toast } from '../components/Toasts'

export const MAX_SIDE_DISPLAYS_PER_SIDE = 3

export async function toggleSideDisplayMute(deckId: number, display: SideDisplayModel) {
  try {
    await api(`/api/decks/${deckId}/side-displays/${encodeURIComponent(display.id)}/mute`, { method: 'POST' })
  } catch (e) {
    toast(`Display „${display.label || display.source}“ konnte nicht umgeschaltet werden: ${errorMessage(e)}`, 'error')
  }
}

export async function saveSideDisplays(deckId: number, displays: SideDisplayModel[]) {
  await api(`/api/decks/${deckId}/side-displays`, { method: 'PUT', body: { displays } })
}

/** Ob das Deck mindestens ein Display hat, das Pegel braucht / eine Systemquelle zeigt (steuert die Abos in DeckPage). */
export function sideDisplayNeeds(deck: DeckModel | undefined) {
  const list = deck?.sideDisplays ?? []
  return { meters: list.length > 0, system: list.some((d) => d.source === 'system' || d.source.startsWith('win:')) }
}

/** Live-Ansicht: je ein Display pro Eintrag, Klick schaltet stumm. Index 0 = am naechsten am Raster. */
export function liveSideSlots(deck: DeckModel, side: 'left' | 'right', obs: ObsSnapshot | null, systemMonitor: SystemMonitorSnapshot | null, audioDevices: AudioDevice[]): SideSlot[] {
  return (deck.sideDisplays ?? [])
    .filter((d) => d.side === side)
    .map((d) => ({
      key: d.id,
      render: ({ orientation, width, height }) => (
        <SideDisplay
          display={d}
          info={sideDisplayInfo(d.source, obs, systemMonitor, audioDevices)}
          orientation={orientation}
          width={width}
          height={height}
          onPress={() => void toggleSideDisplayMute(deck.id, d)}
        />
      ),
    }))
}
