import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { IconCheck, IconClick, IconMusic, IconDownload, IconLayoutGrid, IconPlus, IconRoute, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, errorMessage } from '../api/client'
import { reloadAudioDevices, reloadDisplays } from '../state/realtime'
import type { ButtonModel, DeckModel, PageModel, SideDisplay as SideDisplayModel } from '../api/types'
import { DeckGrid, type SideSlot } from '../components/DeckGrid'
import { SideDisplay, sideDisplayInfo } from '../components/SideDisplay'
import { SideDisplayModal } from './SideDisplayModal'
import { MAX_SIDE_DISPLAYS_PER_SIDE, saveSideDisplays } from './sideSlots'
import { DeckKey } from '../components/DeckKey'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toasts'
import { AutomationInspector } from '../editor/AutomationInspector'
import { ButtonAutomationPanel } from '../editor/ButtonAutomationPanel'
import { Inspector } from '../editor/Inspector'
import { buildPalette, Palette, type PaletteItem } from '../editor/Palette'
import { TileMenu, type MenuItem } from '../editor/TileMenu'
import { downloadExport } from '../lib/backup'
import { buttonLevel, displayMetric, isButtonActive, isButtonUnavailable } from '../lib/buttonState'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useStore } from '../state/store'
import { GridModal, NewDeckModal } from './DeckModals'
import { automationIdOf, deleteTile, folderTargetOf, isMulti, isMultiSwitch } from './tileOps'

type Slot = { row: number; column: number }
type Menu = { x: number; y: number; slot: Slot; button?: ButtonModel }
type InspectorTab = 'action' | 'automation'

const NEW_TILE_MENU: MenuItem[] = [
  { id: 'single', label: 'Einzelne Aktion …', hint: 'Szene, Audio, Stream, Plugin …', icon: 'tabler:click' },
  { id: 'multi', label: 'Multifunktion', hint: 'Mehrere Aktionen nacheinander', icon: 'tabler:stack-3' },
  { id: 'multi-switch', label: 'Multi-Aktionsschalter', hint: 'Zwei Zustände mit eigenen Aktionen', icon: 'tabler:toggle-right' },
  { id: 'folder', label: 'Ordner', hint: 'Weitere Tasten dahinter', icon: 'tabler:folder-plus' },
]

const TILE_MENU: MenuItem[] = [
  { id: 'edit', label: 'Bearbeiten', icon: 'tabler:pencil' },
  { id: 'duplicate', label: 'Duplizieren', hint: 'In den nächsten freien Platz', icon: 'tabler:copy' },
  { id: 'delete', label: 'Löschen', icon: 'tabler:trash', danger: true },
]

const isFolder = (b: ButtonModel) => folderTargetOf(b) != null

function EditSlot({ slot, selected, onClick, onMenu, children }: { slot: Slot; selected: boolean; onClick: (e: React.MouseEvent) => void; onMenu: (e: React.MouseEvent) => void; children?: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.row}:${slot.column}`, data: slot })
  return (
    <div ref={setNodeRef} className="relative h-full w-full" onContextMenu={onMenu}>
      {children ?? (
        <button
          className={`deck-slot-empty group flex items-center justify-center transition-colors ${isOver ? 'border-select bg-select-soft' : 'hover:border-line-strong hover:bg-surface/60'} ${selected ? 'border-select' : ''}`}
          onClick={onClick}
          aria-label={`Neue Taste in Reihe ${slot.row + 1}, Spalte ${slot.column + 1}`}
        >
          <IconPlus size={22} className={`text-ink-faint transition-opacity ${selected || isOver ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
        </button>
      )}
      {children && isOver && <div className="pointer-events-none absolute inset-0 rounded-key ring-2 ring-select ring-offset-2 ring-offset-canvas" />}
    </div>
  )
}

function EditKey({ button, size, selected, onSelect, onOpen }: { button: ButtonModel; size: number; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const obs = useStore((s) => s.obs)
  const automations = useStore((s) => s.automations)
  const catalog = useStore((s) => s.catalog)
  const systemMonitor = useStore((s) => s.systemMonitor)
  useStore((s) => s.audioDevices) // Stumm-/Pegel-Zustand von Geraete-Tasten (siehe lib/buttonState.ts)
  useStore((s) => s.displays) // Zustand von Monitor-Tasten (HDR, Aufloesung)
  const appearance = useStore((s) => s.appearance)
  const switchStates = useStore((s) => s.switchStates)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `key:${button.id}`, data: { button } })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`h-full w-full touch-none ${isDragging ? 'opacity-30' : ''}`} onDoubleClick={onOpen}>
      <DeckKey
        button={button}
        size={size}
        selected={selected}
        active={isButtonActive(button, obs, automations, systemMonitor, switchStates)}
        level={buttonLevel(button, obs, systemMonitor)}
        monitorMetric={displayMetric(button, catalog)}
        systemMonitor={systemMonitor}
        unavailable={isButtonUnavailable(button, obs)}
        displayMesh={appearance?.displayMesh}
        keySurface={appearance?.keySurface}
        pressBehavior={appearance?.pressBehavior}
        stateStyle={appearance?.stateStyle}
        onPress={onSelect}
      />
    </div>
  )
}

interface Props {
  deck: DeckModel
  page: PageModel
  onOpenFolder: (pageId: number) => void
  onDeckCreated: (deckId: number) => void
  onDone: () => void
  /** Vorausgewaehlte Taste (z.B. per Rechtsklick > Bearbeiten im Live-Deck). */
  initialSelectedId?: number | null
}

/** Bearbeiten-Modus direkt im Deck: Palette links, Raster in der Mitte, Inspektor rechts. */
export function DeckEditor({ deck, page, onOpenFolder, onDeckCreated, onDone, initialSelectedId = null }: Props) {
  const obs = useStore((s) => s.obs)
  const catalog = useStore((s) => s.catalog)
  const wide = useMediaQuery('(min-width: 1024px)')
  // Ab dieser Breite passt das Inspektor-Panel breiter und zeigt Aktion + Automation nebeneinander statt als Tabs.
  const veryWide = useMediaQuery('(min-width: 1600px)')
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('action')
  const [menu, setMenu] = useState<Menu | null>(null)
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null)
  const [dragItem, setDragItem] = useState<{ label: string; icon: string | null; color: string } | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const [newDeckOpen, setNewDeckOpen] = useState(false)
  const [sideEdit, setSideEdit] = useState<{ side: 'left' | 'right'; display: SideDisplayModel | null } | null>(null)

  const toggleOled = async () => {
    const next = deck.oledSize === 'large' ? 'normal' : 'large'
    try {
      await api(`/api/decks/${deck.id}/oled`, { method: 'PUT', body: { size: next } })
    } catch (e) {
      toast(`OLED-Größe konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    }
  }

  const writeSideDisplays = async (next: SideDisplayModel[]) => {
    try {
      await saveSideDisplays(deck.id, next)
    } catch (e) {
      toast(`Displays konnten nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    }
  }
  const saveSide = (v: { source: string; label: string }) => {
    if (!sideEdit) return
    const all = deck.sideDisplays ?? []
    const next = sideEdit.display
      ? all.map((d) => (d.id === sideEdit.display!.id ? { ...d, source: v.source, label: v.label || null } : d))
      : [...all, { id: crypto.randomUUID(), side: sideEdit.side, source: v.source, label: v.label || null }]
    setSideEdit(null)
    void writeSideDisplays(next)
  }
  const removeSide = () => {
    if (!sideEdit?.display) return
    const id = sideEdit.display.id
    setSideEdit(null)
    void writeSideDisplays((deck.sideDisplays ?? []).filter((d) => d.id !== id))
  }
  /** Bestehende Displays (anklickbar zum Bearbeiten) plus am aeusseren Ende eine Plus-Kachel, solange Platz ist. */
  const editSideSlots = (side: 'left' | 'right'): SideSlot[] => {
    const mine = (deck.sideDisplays ?? []).filter((d) => d.side === side)
    const slots: SideSlot[] = mine.map((d) => ({
      key: d.id,
      render: ({ orientation, width, height }) => (
        <SideDisplay
          display={d}
          info={{ ...sideDisplayInfo(d.source, obs, null, audioDevices), muted: false, available: true }}
          orientation={orientation}
          width={width}
          height={height}
          onPress={() => setSideEdit({ side, display: d })}
        />
      ),
    }))
    if (mine.length < MAX_SIDE_DISPLAYS_PER_SIDE) {
      slots.push({
        key: `add-${side}`,
        render: ({ width, height }) => (
          <button
            type="button"
            className="oled-add"
            style={{ width, height }}
            onClick={() => setSideEdit({ side, display: null })}
            title={`OLED-Display ${side === 'left' ? 'links' : 'rechts'} hinzufügen`}
            aria-label={`OLED-Display ${side === 'left' ? 'links' : 'rechts'} hinzufügen`}
          >
            <IconPlus size={Math.max(16, Math.min(28, Math.round(width * 0.4)))} />
          </button>
        ),
      })
    }
    return slots
  }

  const audioDevices = useStore((s) => s.audioDevices)
  // Beim Oeffnen des Editors die Geraeteliste frisch holen (Geraete koennen seit dem App-Start dazugekommen sein).
  useEffect(() => void reloadAudioDevices().catch(() => {}), [])
  useEffect(() => void reloadDisplays().catch(() => {}), [])
  const displays = useStore((s) => s.displays)
  const audioDevicesError = useStore((s) => s.audioDevicesError)
  const groups = useMemo(() => buildPalette(obs, catalog, audioDevices, audioDevicesError, displays), [obs, catalog, audioDevices, audioDevicesError, displays])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Andere Taste gewaehlt -> zurueck auf den Aktion-Tab, statt den zuletzt betrachteten Automation-Tab zu behalten.
  useEffect(() => setInspectorTab('action'), [selectedId])

  const at = (row: number, column: number) => page.buttons.find((b) => b.row === row && b.column === column)
  const selected = page.buttons.find((b) => b.id === selectedId)
  const firstFree = (): Slot | null => {
    for (let r = 0; r < deck.rows; r++) for (let c = 0; c < deck.columns; c++) if (!at(r, c)) return { row: r, column: c }
    return null
  }

  const createAt = async (item: PaletteItem, slot: Slot) => {
    const created =
      item.kind === 'folder'
        ? await api<ButtonModel>(`/api/pages/${page.id}/folders`, { body: { name: 'Ordner', row: slot.row, column: slot.column } })
        : await api<ButtonModel>(`/api/pages/${page.id}/buttons`, {
            body: {
              row: slot.row,
              column: slot.column,
              label: item.kind === 'multi' ? 'Multi' : item.kind === 'multi-switch' ? 'Schalter' : item.label,
              icon: item.icon,
              color: item.color,
              actions: item.actions,
            },
          })
    setSelectedId(created.id)
  }

  /** Palette-Eintrag auf eine Taste: leer -> anlegen, Multifunktion -> Schritt anhaengen, sonst ersetzen. */
  const dropItem = async (item: PaletteItem, slot: Slot) => {
    const target = at(slot.row, slot.column)
    try {
      if (!target) return await createAt(item, slot)
      if (item.kind) return toast('Ordner, Multifunktionen und Schalter bitte auf eine leere Taste ziehen.', 'error')
      if (automationIdOf(target) != null || isFolder(target))
        return toast('Ordner- und Automations-Tasten lassen sich nicht überschreiben – zieh die Aktion auf eine leere Taste.', 'error')
      if (isMultiSwitch(target))
        return toast('Multi-Aktionsschalter bitte im Editor rechts konfigurieren (Zustand 1 / Zustand 2).', 'info')
      if (isMulti(target)) {
        await api(`/api/buttons/${target.id}`, {
          method: 'PUT',
          body: { row: target.row, column: target.column, label: target.label, icon: target.icon, color: target.color, actions: [...target.actions, ...item.actions] },
        })
        toast(`„${item.label}“ als Schritt ${target.actions.length + 1} zu „${target.label}“ hinzugefügt.`, 'success')
      } else {
        await api(`/api/buttons/${target.id}`, {
          method: 'PUT',
          body: { row: target.row, column: target.column, label: item.label, icon: item.icon, color: item.color, actions: item.actions },
        })
        toast(`Taste durch „${item.label}“ ersetzt.`, 'success')
      }
      setSelectedId(target.id)
    } catch (e) {
      toast(`Taste konnte nicht angelegt werden: ${errorMessage(e)}`, 'error')
    }
  }

  const addToFree = (item: PaletteItem) => {
    const slot = firstFree()
    if (!slot) return toast('Auf dieser Seite ist kein Platz mehr frei – leg einen Ordner an oder vergrößere das Raster.', 'error')
    void dropItem(item, slot)
  }

  const deleteButton = async (b: ButtonModel) => {
    try {
      await deleteTile(b)
      if (selectedId === b.id) setSelectedId(null)
    } catch (e) {
      toast(`Taste konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
    }
  }

  const duplicate = async (b: ButtonModel) => {
    const slot = firstFree()
    if (!slot) return toast('Kein freier Platz zum Duplizieren.', 'error')
    if (automationIdOf(b) != null || isFolder(b)) return toast('Ordner und Automationen lassen sich nicht duplizieren.', 'error')
    try {
      const created = await api<ButtonModel>(`/api/pages/${page.id}/buttons`, {
        body: { row: slot.row, column: slot.column, label: b.label, icon: b.icon, color: b.color, actions: b.actions },
      })
      setSelectedId(created.id)
    } catch (e) {
      toast(`Duplizieren fehlgeschlagen: ${errorMessage(e)}`, 'error')
    }
  }

  const onMenuPick = (id: string) => {
    if (!menu) return
    const { slot, button } = menu
    if (button) {
      if (id === 'edit') setSelectedId(button.id)
      if (id === 'duplicate') void duplicate(button)
      if (id === 'delete') void deleteButton(button)
      return
    }
    if (id === 'single') return setPickerSlot(slot)
    const item = groups.find((g) => g.id === 'deck')?.sections[0].entries.find((e) => e.kind === id)
    if (item) void dropItem(item, slot)
  }

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { item?: PaletteItem; button?: ButtonModel }
    const src = data.item ?? data.button
    if (src) setDragItem({ label: src.label, icon: src.icon, color: src.color })
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setDragItem(null)
    const over = e.over?.data.current as Slot | undefined
    if (!over) return
    const data = e.active.data.current as { item?: PaletteItem; button?: ButtonModel }
    if (data.item) return dropItem(data.item, over)
    if (data.button && (data.button.row !== over.row || data.button.column !== over.column)) {
      try {
        await api(`/api/buttons/${data.button.id}/move`, { body: { row: over.row, column: over.column } })
      } catch (err) {
        toast(`Verschieben fehlgeschlagen: ${errorMessage(err)}`, 'error')
      }
    }
  }

  const generate = async () => {
    try {
      const res = await api<{ message: string }>(`/api/decks/${deck.id}/generate-from-obs`, { method: 'POST' })
      toast(res.message, 'success')
    } catch (e) {
      toast(`Automatisches Befüllen fehlgeschlagen: ${errorMessage(e)}`, 'error')
    }
  }

  // Eigenstaendige, nicht tastengebundene Automations-Tasten (automation.toggle) behalten ihren eigenen,
  // einfachen Inspector ohne Tabs - die Taste IST hier die Automation, kein zusaetzliches "Aktion"-Konzept.
  const legacyAutomationId = selected ? automationIdOf(selected) : null

  const actionPanel = selected && legacyAutomationId == null && (
    <Inspector key={selected.id} button={selected} deck={deck} catalog={catalog} onOpenFolder={onOpenFolder} onDeleted={() => setSelectedId(null)} />
  )
  const automationPanel = selected && legacyAutomationId == null && <ButtonAutomationPanel key={selected.id} buttonId={selected.id} catalog={catalog} />

  const inspector = selected ? (
    legacyAutomationId != null ? (
      <AutomationInspector key={selected.id} button={selected} automationId={legacyAutomationId} catalog={catalog} onDeleted={() => setSelectedId(null)} />
    ) : veryWide ? (
      <div className="flex h-full min-w-0 divide-x divide-line">
        <div className="min-w-0 flex-1">{actionPanel}</div>
        <div className="min-w-0 flex-1">{automationPanel}</div>
      </div>
    ) : (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 gap-2 border-b border-line p-3" role="tablist">
          <button role="tab" aria-selected={inspectorTab === 'action'} aria-pressed={inspectorTab === 'action'} className="chip-select h-8 gap-1.5 px-3" onClick={() => setInspectorTab('action')}>
            <IconClick size={14} /> Aktion
          </button>
          <button role="tab" aria-selected={inspectorTab === 'automation'} aria-pressed={inspectorTab === 'automation'} className="chip-select h-8 gap-1.5 px-3" onClick={() => setInspectorTab('automation')}>
            <IconRoute size={14} /> Automation
          </button>
        </div>
        <div className="min-h-0 flex-1">{inspectorTab === 'action' ? actionPanel : automationPanel}</div>
      </div>
    )
  ) : null

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setDragItem(null)}>
      <div className="flex h-full min-h-0">
        <aside className="hidden w-80 shrink-0 border-r border-line bg-surface md:block">
          <Palette groups={groups} onAdd={addToFree} />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <button className="btn btn-ghost btn-sm" onClick={() => setGridOpen(true)}>
              <IconLayoutGrid size={15} /> {deck.name} · {deck.rows} × {deck.columns}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void generate()} disabled={obs?.status !== 'connected'} title="Stream, Aufnahme, alle Szenen und Audioquellen automatisch anlegen">
              <IconSparkles size={15} /> Aus OBS befüllen
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void downloadExport(deck.id).catch((e) => toast(`Export fehlgeschlagen: ${errorMessage(e)}`, 'error'))}
              title="Dieses Deck als Datei sichern"
            >
              <IconDownload size={15} /> Exportieren
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void toggleOled()}
              title="Größe des oberen OLED-Displays der SushiFlux-Gehäuse: eine Zeile oder groß mit Cover, Titel, Interpret und Album"
            >
              <IconMusic size={15} /> Oberes OLED: {deck.oledSize === 'large' ? 'Groß' : 'Normal'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNewDeckOpen(true)}>
              <IconPlus size={15} /> Neues Deck
            </button>
            <button className="btn btn-confirm ml-auto" onClick={onDone}>
              <IconCheck size={16} /> Fertig
            </button>
          </div>
          <p className="px-4 pt-2 text-xs text-ink-faint">
            Ziehen zum Belegen/Tauschen · leere Taste anklicken für Multifunktion, Ordner · Rechtsklick für mehr
          </p>
          <div className="min-h-0 flex-1 p-4">
            <DeckGrid
              rows={deck.rows}
              columns={deck.columns}
              maxKeySize={170}
              sideLeft={editSideSlots('left')}
              sideRight={editSideSlots('right')}
              renderSlot={(row, column, size) => {
                const b = at(row, column)
                const slot = { row, column }
                const openMenu = (e: React.MouseEvent, button?: ButtonModel) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, slot, button })
                }
                return (
                  <EditSlot slot={slot} selected={menu?.slot.row === row && menu.slot.column === column && !menu.button} onClick={(e) => openMenu(e)} onMenu={(e) => openMenu(e, b)}>
                    {b && (
                      <EditKey
                        button={b}
                        size={size}
                        selected={selectedId === b.id}
                        onSelect={() => setSelectedId(b.id)}
                        onOpen={() => {
                          const target = b.actions.find((a) => a.type === 'deck.openPage')?.params?.page
                          if (target != null) onOpenFolder(Number(target))
                        }}
                      />
                    )}
                  </EditSlot>
                )
              }}
            />
          </div>
        </section>

        {wide && (
        <aside className={`shrink-0 border-l border-line bg-surface transition-[width] duration-150 ${veryWide ? 'w-[46rem]' : 'w-[24rem]'}`}>
          {inspector ?? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <IconLayoutGrid size={36} stroke={1.3} className="text-ink-faint" />
              <p className="text-sm font-semibold text-ink">Taste wählen</p>
              <p className="text-sm text-ink-muted">Klick auf eine Taste zum Bearbeiten – oder auf eine leere für eine neue.</p>
            </div>
          )}
        </aside>
        )}
      </div>

      {/* Kleine Bildschirme: Inspektor als Dialog (nur dort gerendert, sonst liefe er doppelt). */}
      {!wide && (
        <Modal open={!!selected} title="Taste bearbeiten" onClose={() => setSelectedId(null)}>
          <div className="-mx-5 -my-4">{inspector}</div>
        </Modal>
      )}

      <Modal open={!!pickerSlot} title="Aktion für diese Taste" onClose={() => setPickerSlot(null)} width="max-w-md">
        <div className="-mx-3 -my-2 h-[60vh]">
          <Palette
            groups={groups}
            onAdd={(item) => {
              if (pickerSlot) void dropItem(item, pickerSlot)
              setPickerSlot(null)
            }}
          />
        </div>
      </Modal>

      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          title={menu.button ? menu.button.label || 'Taste' : 'Neue Taste'}
          items={menu.button ? TILE_MENU : NEW_TILE_MENU}
          onPick={onMenuPick}
          onClose={() => setMenu(null)}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {dragItem && (
          <div className="h-24 w-24 rotate-3 opacity-90">
            <DeckKey
              button={{ id: -1, pageId: 0, row: 0, column: 0, label: dragItem.label, icon: dragItem.icon, color: dragItem.color, actions: [], hotkey: null }}
              size={96}
            />
          </div>
        )}
      </DragOverlay>

      <SideDisplayModal audioDevices={audioDevices} open={!!sideEdit} initial={sideEdit?.display ?? null} side={sideEdit?.side ?? 'left'} obs={obs} onClose={() => setSideEdit(null)} onSave={saveSide} onRemove={removeSide} />
      <GridModal open={gridOpen} deck={deck} onClose={() => setGridOpen(false)} />
      <NewDeckModal open={newDeckOpen} onClose={() => setNewDeckOpen(false)} onCreated={onDeckCreated} />
    </DndContext>
  )
}
