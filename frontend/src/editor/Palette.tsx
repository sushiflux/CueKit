import { useDraggable } from '@dnd-kit/core'
import { IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { ActionStep, Catalog, ObsSnapshot } from '../api/types'
import { KeyIcon } from '../components/KeyIcon'
import { defaultParams } from './StepEditor'

export interface PaletteItem {
  id: string
  group: string
  label: string
  sublabel?: string
  icon: string
  color: string
  actions: ActionStep[]
  /** Sonderfall: legt statt einer Taste einen Ordner an. */
  folder?: boolean
}

const TABS = ['Szenen', 'Quellen', 'Audio', 'Steuerung', 'Deck', 'Plugins'] as const

export function buildPalette(obs: ObsSnapshot | null, catalog: Catalog | null): PaletteItem[] {
  const items: PaletteItem[] = []
  const step = (type: string, params: ActionStep['params'] = {}): ActionStep[] => [{ type, params }]

  obs?.scenes.forEach((s) =>
    items.push({ id: `scene:${s.name}`, group: 'Szenen', label: s.name, icon: 'tabler:layout-board', color: 'violet', actions: step('obs.scene.switch', { scene: s.name }) }),
  )
  obs?.scenes.forEach((s) =>
    s.items.forEach((i) =>
      items.push({
        id: `source:${s.name}:${i.id}`,
        group: 'Quellen',
        label: i.sourceName,
        sublabel: s.name,
        icon: i.isGroup ? 'tabler:folders' : 'tabler:photo',
        color: 'sky',
        actions: step('obs.source.visibility', { scene: s.name, source: i.sourceName, mode: 'toggle' }),
      }),
    ),
  )
  obs?.audioInputs.forEach((a) =>
    items.push({ id: `audio:${a.name}`, group: 'Audio', label: a.name, icon: 'tabler:microphone', color: 'emerald', actions: step('obs.audio.mute', { input: a.name, mode: 'toggle' }) }),
  )

  const control: [string, string, string, string][] = [
    ['obs.stream', 'Stream', 'tabler:broadcast', 'red'],
    ['obs.record', 'Aufnahme', 'tabler:player-record', 'rose'],
    ['obs.record.pause', 'Pause', 'tabler:player-pause', 'amber'],
    ['obs.replay', 'Replay-Puffer', 'tabler:history', 'orange'],
    ['obs.replay.save', 'Replay speichern', 'tabler:device-floppy', 'orange'],
    ['obs.vcam', 'Virtuelle Kamera', 'tabler:camera', 'teal'],
    ['obs.studio', 'Studio-Modus', 'tabler:layout-columns', 'indigo'],
    ['obs.studio.transition', 'Übergang', 'tabler:arrows-exchange', 'indigo'],
  ]
  control.forEach(([type, label, icon, color]) =>
    items.push({ id: `ctl:${type}`, group: 'Steuerung', label, icon, color, actions: step(type, defaultParams(catalog?.actions.find((a) => a.type === type))) }),
  )

  items.push(
    { id: 'deck:folder', group: 'Deck', label: 'Neuer Ordner', icon: 'tabler:folder-plus', color: 'amber', actions: [], folder: true },
    { id: 'deck:back', group: 'Deck', label: 'Zurück', icon: 'tabler:arrow-back-up', color: 'slate', actions: step('deck.back') },
    { id: 'deck:home', group: 'Deck', label: 'Startseite', icon: 'tabler:home', color: 'slate', actions: step('deck.home') },
    { id: 'deck:empty', group: 'Deck', label: 'Leere Taste', icon: 'tabler:square-plus', color: 'slate', actions: [] },
  )

  catalog?.actions
    .filter((a) => a.type.startsWith('plugin:'))
    .forEach((a) =>
      items.push({ id: `plugin:${a.type}`, group: 'Plugins', label: a.name, sublabel: a.category, icon: a.icon, color: a.suggestedColor ?? 'slate', actions: step(a.type, defaultParams(a)) }),
    )
  return items
}

function PaletteEntry({ item, onAdd }: { item: PaletteItem; onAdd: (item: PaletteItem) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${item.id}`, data: { item } })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onAdd(item)}
      data-color={item.color}
      className={`flex w-full touch-none items-center gap-3 rounded-ctl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-surface-2 ${isDragging ? 'opacity-40' : ''}`}
      title="Klicken fügt in den nächsten freien Platz ein – oder ins Raster ziehen"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl" style={{ background: 'color-mix(in oklab, var(--key-solid) 18%, transparent)', color: 'var(--key-solid)' }}>
        <KeyIcon name={item.icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{item.label}</span>
        {item.sublabel && <span className="block truncate text-xs text-ink-faint">{item.sublabel}</span>}
      </span>
    </button>
  )
}

export function Palette({ items, onAdd, obsConnected }: { items: PaletteItem[]; onAdd: (item: PaletteItem) => void; obsConnected: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Szenen')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => (q ? `${i.label} ${i.sublabel ?? ''}`.toLowerCase().includes(q) : i.group === tab))
  }, [items, tab, query])

  const obsTab = tab === 'Szenen' || tab === 'Quellen' || tab === 'Audio'

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-4 pb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-faint">Schnell hinzufügen</h2>
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="field h-8 pl-8" placeholder="Alles durchsuchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!query && (
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t} className="chip-select h-7 px-2 text-xs" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm leading-relaxed text-ink-muted">
            {query
              ? 'Nichts gefunden.'
              : obsTab && !obsConnected
                ? 'OBS ist nicht verbunden – hier erscheinen deine Szenen, Quellen und Audiospuren automatisch, sobald OBS läuft.'
                : tab === 'Plugins'
                  ? 'Keine Plugins verbunden. Plugins erweitern das Deck um weitere Programme (z.B. Photoshop, Resolve).'
                  : 'Keine Einträge.'}
          </p>
        ) : (
          visible.map((item) => <PaletteEntry key={item.id} item={item} onAdd={onAdd} />)
        )}
      </div>
    </div>
  )
}
