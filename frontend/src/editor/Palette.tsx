import { useDraggable } from '@dnd-kit/core'
import { IconChevronRight, IconSearch } from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { ActionStep, Catalog, ObsSnapshot } from '../api/types'
import { KeyIcon } from '../components/KeyIcon'
import { defaultParams } from './StepEditor'

/** Sonderfaelle, die statt einer einfachen Taste etwas Besonderes anlegen. */
export type TileKind = 'folder' | 'multi' | 'automation'

export interface PaletteItem {
  id: string
  label: string
  sublabel?: string
  icon: string
  color: string
  actions: ActionStep[]
  kind?: TileKind
}

/** Ein Eintrag mit optionalen Varianten (z.B. Mikro: Stumm / Lauter / Leiser). */
export interface PaletteEntry extends PaletteItem {
  variants?: (PaletteItem & { short: string })[]
}

export interface PaletteSection {
  id: string
  title: string
  entries: PaletteEntry[]
  emptyHint?: string
}

export interface PaletteGroup {
  id: string
  title: string
  icon: string
  sections: PaletteSection[]
}

const step = (type: string, params: ActionStep['params'] = {}): ActionStep[] => [{ type, params }]

/** Baut die Palette aus dem Live-Zustand von OBS, dem Aktionskatalog und den Plugins. */
export function buildPalette(obs: ObsSnapshot | null, catalog: Catalog | null): PaletteGroup[] {
  const connected = obs?.status === 'connected'
  const offlineHint = 'Erscheint automatisch, sobald OBS verbunden ist.'
  const def = (type: string) => defaultParams(catalog?.actions.find((a) => a.type === type))

  const browserInputs = new Set((obs?.inputs ?? []).filter((i) => i.kind === 'browser_source').map((i) => i.name))

  const obsGroup: PaletteGroup = {
    id: 'obs',
    title: 'OBS',
    icon: 'simple-icons:obsstudio',
    sections: [
      {
        id: 'scenes',
        title: 'Szenen',
        emptyHint: connected ? 'Keine Szenen.' : offlineHint,
        entries: (obs?.scenes ?? []).map((s) => ({
          id: `scene:${s.name}`,
          label: s.name,
          icon: 'tabler:layout-board',
          color: 'violet',
          actions: step('obs.scene.switch', { scene: s.name }),
          variants: [{ id: `scene-preview:${s.name}`, short: 'Vorschau', label: `${s.name} (Vorschau)`, icon: 'tabler:eye', color: 'indigo', actions: step('obs.scene.preview', { scene: s.name }) }],
        })),
      },
      {
        id: 'sources',
        title: 'Quellen',
        emptyHint: connected ? 'Keine Quellen.' : offlineHint,
        entries: (obs?.scenes ?? []).flatMap((s) =>
          s.items.map((i) => ({
            id: `source:${s.name}:${i.id}`,
            label: i.sourceName,
            sublabel: s.name,
            icon: i.isGroup ? 'tabler:folders' : browserInputs.has(i.sourceName) ? 'tabler:world' : 'tabler:photo',
            color: 'sky',
            actions: step('obs.source.visibility', { scene: s.name, source: i.sourceName, mode: 'toggle' }),
            variants: browserInputs.has(i.sourceName)
              ? [{ id: `refresh:${s.name}:${i.id}`, short: 'Neu laden', label: `${i.sourceName} neu laden`, icon: 'tabler:refresh', color: 'sky', actions: step('obs.source.refresh', { input: i.sourceName }) }]
              : undefined,
          })),
        ),
      },
      {
        id: 'audio',
        title: 'Audio',
        emptyHint: connected ? 'Keine Audioquellen.' : offlineHint,
        entries: (obs?.audioInputs ?? []).map((a) => ({
          id: `audio:${a.name}`,
          label: a.name,
          sublabel: 'Stumm / Ton an',
          icon: /mic|mikro/i.test(a.name) ? 'tabler:microphone' : 'tabler:volume',
          color: 'emerald',
          actions: step('obs.audio.mute', { input: a.name, mode: 'toggle' }),
          variants: [
            { id: `vol-up:${a.name}`, short: 'Lauter', label: `${a.name} +`, icon: 'tabler:volume-2', color: 'emerald', actions: step('obs.audio.volume', { input: a.name, mode: 'up', step: 3 }) },
            { id: `vol-down:${a.name}`, short: 'Leiser', label: `${a.name} −`, icon: 'tabler:volume-3', color: 'emerald', actions: step('obs.audio.volume', { input: a.name, mode: 'down', step: 3 }) },
          ],
        })),
      },
      {
        id: 'media',
        title: 'Medien',
        emptyHint: connected ? 'Keine Medienquellen (Medien-/VLC-Quelle).' : offlineHint,
        entries: (obs?.mediaInputs ?? []).map((m) => ({
          id: `media:${m.name}`,
          label: m.name,
          sublabel: 'Abspielen / Pause',
          icon: 'tabler:player-play',
          color: 'pink',
          actions: step('obs.media', { input: m.name, mode: 'playpause' }),
          variants: [
            { id: `media-stop:${m.name}`, short: 'Stopp', label: `${m.name} Stopp`, icon: 'tabler:player-stop', color: 'pink', actions: step('obs.media', { input: m.name, mode: 'stop' }) },
            { id: `media-restart:${m.name}`, short: 'Von vorn', label: `${m.name} von vorn`, icon: 'tabler:player-skip-back', color: 'pink', actions: step('obs.media', { input: m.name, mode: 'restart' }) },
          ],
        })),
      },
      {
        id: 'outputs',
        title: 'Stream & Aufnahme',
        entries: [
          { id: 'ctl:stream', label: 'Stream', icon: 'tabler:broadcast', color: 'red', actions: step('obs.stream', def('obs.stream')) },
          { id: 'ctl:record', label: 'Aufnahme', icon: 'tabler:player-record', color: 'rose', actions: step('obs.record', def('obs.record')) },
          { id: 'ctl:pause', label: 'Aufnahme pausieren', icon: 'tabler:player-pause', color: 'amber', actions: step('obs.record.pause') },
          { id: 'ctl:chapter', label: 'Kapitelmarke', icon: 'tabler:bookmark', color: 'rose', actions: step('obs.record.chapter') },
          { id: 'ctl:split', label: 'Aufnahme teilen', icon: 'tabler:scissors', color: 'rose', actions: step('obs.record.split') },
          { id: 'ctl:replay', label: 'Replay-Puffer', icon: 'tabler:history', color: 'orange', actions: step('obs.replay', def('obs.replay')) },
          { id: 'ctl:replay-save', label: 'Replay speichern', icon: 'tabler:device-floppy', color: 'orange', actions: step('obs.replay.save') },
          { id: 'ctl:vcam', label: 'Virtuelle Kamera', icon: 'tabler:camera', color: 'teal', actions: step('obs.vcam', def('obs.vcam')) },
        ],
      },
      {
        id: 'studio',
        title: 'Studio & Übergänge',
        entries: [
          { id: 'ctl:studio', label: 'Studio-Modus', icon: 'tabler:layout-columns', color: 'indigo', actions: step('obs.studio', def('obs.studio')) },
          { id: 'ctl:transition', label: 'Übergang auslösen', icon: 'tabler:arrows-exchange', color: 'indigo', actions: step('obs.studio.transition') },
          ...(obs?.transitions ?? []).map((t) => ({
            id: `transition:${t}`,
            label: t,
            sublabel: 'Übergang wählen',
            icon: 'tabler:transition-right',
            color: 'indigo',
            actions: step('obs.transition.set', { transition: t }),
          })),
        ],
      },
      {
        id: 'profiles',
        title: 'Profile & Sammlungen',
        emptyHint: connected ? undefined : offlineHint,
        entries: [
          ...(obs?.sceneCollections ?? []).map((c) => ({ id: `collection:${c}`, label: c, sublabel: 'Szenensammlung', icon: 'tabler:stack-2', color: 'teal', actions: step('obs.collection', { collection: c }) })),
          ...(obs?.profiles ?? []).map((p) => ({ id: `profile:${p}`, label: p, sublabel: 'Profil', icon: 'tabler:user-cog', color: 'teal', actions: step('obs.profile', { profile: p }) })),
        ],
      },
      {
        id: 'advanced',
        title: 'Erweitert',
        entries: [
          { id: 'ctl:filter', label: 'Filter ein/aus', sublabel: 'Quelle & Filter danach wählen', icon: 'tabler:filter', color: 'sky', actions: step('obs.filter', def('obs.filter')) },
          { id: 'ctl:hotkey', label: 'OBS-Hotkey', sublabel: 'Name danach eintragen', icon: 'tabler:keyboard', color: 'slate', actions: step('obs.hotkey') },
        ],
      },
    ],
  }

  const deckGroup: PaletteGroup = {
    id: 'deck',
    title: 'Deck',
    icon: 'tabler:layout-grid',
    sections: [
      {
        id: 'deck',
        title: 'Tasten & Navigation',
        entries: [
          { id: 'deck:multi', label: 'Multifunktion', sublabel: 'Mehrere Aktionen nacheinander', icon: 'tabler:stack-3', color: 'violet', actions: [], kind: 'multi' },
          { id: 'deck:automation', label: 'Automation', sublabel: 'Wenn … dann …', icon: 'tabler:route', color: 'violet', actions: [], kind: 'automation' },
          { id: 'deck:folder', label: 'Ordner', icon: 'tabler:folder-plus', color: 'amber', actions: [], kind: 'folder' },
          { id: 'deck:back', label: 'Zurück', icon: 'tabler:arrow-back-up', color: 'slate', actions: step('deck.back') },
        ],
      },
    ],
  }

  // Jedes Plugin als eigene Gruppe - wie OBS.
  const pluginActions = (catalog?.actions ?? []).filter((a) => a.type.startsWith('plugin:'))
  const pluginGroups: PaletteGroup[] = [...new Set(pluginActions.map((a) => a.category))].map((name) => ({
    id: `plugin:${name}`,
    title: name,
    icon: 'tabler:puzzle',
    sections: [
      {
        id: 'actions',
        title: 'Aktionen',
        entries: pluginActions
          .filter((a) => a.category === name)
          .map((a) => ({ id: `plugin:${a.type}`, label: a.name, icon: a.icon, color: a.suggestedColor ?? 'slate', actions: step(a.type, defaultParams(a)) })),
      },
    ],
  }))

  return [obsGroup, deckGroup, ...pluginGroups]
}

function DragHandle({ item, children, className, onAdd, title }: { item: PaletteItem; children: React.ReactNode; className: string; onAdd: (item: PaletteItem) => void; title?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${item.id}`, data: { item } })
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd(item)} data-color={item.color} className={`${className} touch-none ${isDragging ? 'opacity-40' : ''}`} title={title}>
      {children}
    </button>
  )
}

function EntryRow({ entry, onAdd }: { entry: PaletteEntry; onAdd: (item: PaletteItem) => void }) {
  return (
    <div className="group rounded-ctl border border-transparent px-1.5 py-1 hover:border-line hover:bg-surface-2">
      <DragHandle item={entry} onAdd={onAdd} className="flex w-full items-center gap-2.5 text-left" title="Auf eine Taste ziehen – oder klicken für den nächsten freien Platz">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl"
          style={{ background: 'color-mix(in oklab, var(--key-solid) 18%, transparent)', color: 'var(--key-solid)' }}
        >
          <KeyIcon name={entry.icon} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{entry.label}</span>
          {entry.sublabel && <span className="block truncate text-xs text-ink-faint">{entry.sublabel}</span>}
        </span>
      </DragHandle>
      {entry.variants && entry.variants.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-[2.6rem]">
          {entry.variants.map((v) => (
            <DragHandle
              key={v.id}
              item={v}
              onAdd={onAdd}
              className="flex h-6 items-center gap-1 rounded-badge border border-line bg-surface px-1.5 text-[11px] font-semibold text-ink-muted hover:border-line-strong hover:text-ink"
              title={v.label}
            >
              <KeyIcon name={v.icon} size={12} /> {v.short}
            </DragHandle>
          ))}
        </div>
      )}
    </div>
  )
}

function Collapsible({ title, count, open, onToggle, level, icon }: { title: string; count?: number; open: boolean; onToggle: () => void; level: 1 | 2; icon?: string }) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-ctl text-left transition-colors hover:bg-surface-2 ${
        level === 1 ? 'px-2 py-2 text-sm font-extrabold tracking-tight text-ink' : 'px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted'
      }`}
      onClick={onToggle}
      aria-expanded={open}
    >
      <IconChevronRight size={level === 1 ? 15 : 13} className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`} />
      {icon && <KeyIcon name={icon} size={16} className="shrink-0 text-brand" />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {count != null && <span className="text-[11px] font-semibold text-ink-faint">{count}</span>}
    </button>
  )
}

export function Palette({ groups, onAdd }: { groups: PaletteGroup[]; onAdd: (item: PaletteItem) => void }) {
  const [query, setQuery] = useState('')
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
  // Standardmaessig offen: Szenen, Audio, Stream & Aufnahme - der Rest auf Klick.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['obs/scenes', 'obs/audio', 'obs/outputs', 'deck/deck']))

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return null
    return groups.flatMap((g) =>
      g.sections.flatMap((s) =>
        s.entries.filter((e) => `${e.label} ${e.sublabel ?? ''} ${s.title} ${g.title}`.toLowerCase().includes(q)),
      ),
    )
  }, [groups, q])

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 pb-2">
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="field h-9 pl-8" placeholder="Aktionen durchsuchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">Nichts gefunden.</p>
          ) : (
            matches.map((e) => <EntryRow key={e.id} entry={e} onAdd={onAdd} />)
          )
        ) : (
          groups.map((g) => {
            const groupOpen = !closedGroups.has(g.id)
            return (
              <div key={g.id} className="mb-1">
                <Collapsible level={1} title={g.title} icon={g.icon} open={groupOpen} onToggle={() => toggle(closedGroups, g.id, setClosedGroups)} />
                <AnimatePresence initial={false}>
                  {groupOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden pl-2">
                      {g.sections.map((s) => {
                        const key = `${g.id}/${s.id}`
                        const sectionOpen = g.sections.length === 1 || openSections.has(key)
                        return (
                          <div key={key}>
                            {g.sections.length > 1 && (
                              <Collapsible level={2} title={s.title} count={s.entries.length} open={sectionOpen} onToggle={() => toggle(openSections, key, setOpenSections)} />
                            )}
                            {sectionOpen && (
                              <div className="pb-1">
                                {s.entries.length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-ink-faint">{s.emptyHint ?? 'Keine Einträge.'}</p>
                                ) : (
                                  s.entries.map((e) => <EntryRow key={e.id} entry={e} onAdd={onAdd} />)
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })
        )}
        <p className="px-3 pt-3 text-[11px] leading-relaxed text-ink-faint">
          Tipp: Auf eine Taste ziehen – oder eine leere Taste anklicken für Multifunktion, Automation und Ordner.
        </p>
      </div>
    </div>
  )
}
