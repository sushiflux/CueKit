import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { IconChevronRight, IconLayoutGrid, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, errorMessage } from '../api/client'
import type { ButtonModel, DeckModel, PageModel } from '../api/types'
import { AppShell } from '../components/AppShell'
import { DeckGrid } from '../components/DeckGrid'
import { DeckKey } from '../components/DeckKey'
import { KeyIcon } from '../components/KeyIcon'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toasts'
import { Inspector } from '../editor/Inspector'
import { buildPalette, Palette, type PaletteItem } from '../editor/Palette'
import { isButtonActive } from '../lib/buttonState'
import { GRID_PRESETS } from '../lib/keyColors'
import { useStore } from '../state/store'

type Selection = { kind: 'button'; id: number } | { kind: 'slot'; row: number; column: number } | null

function Slot({ row, column, selected, onSelect, children }: { row: number; column: number; selected: boolean; onSelect: () => void; children?: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${row}:${column}`, data: { row, column } })
  return (
    <div ref={setNodeRef} className="relative h-full w-full">
      {children ?? (
        <button
          className={`deck-slot-empty group flex items-center justify-center transition-colors ${isOver ? 'border-select bg-select-soft' : 'hover:border-line-strong'} ${selected ? 'border-select' : ''}`}
          onClick={onSelect}
          aria-label={`Leerer Platz Reihe ${row + 1}, Spalte ${column + 1}`}
        >
          <IconPlus size={22} className={`text-ink-faint transition-opacity ${selected || isOver ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
        </button>
      )}
      {children && isOver && <div className="pointer-events-none absolute inset-0 rounded-key ring-2 ring-select" />}
    </div>
  )
}

function DraggableKey({ button, size, selected, active, onSelect, onOpen }: { button: ButtonModel; size: number; selected: boolean; active: boolean; onSelect: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `key:${button.id}`, data: { button } })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`h-full w-full touch-none ${isDragging ? 'opacity-30' : ''}`} onDoubleClick={onOpen}>
      <DeckKey button={button} size={size} selected={selected} active={active} onPress={onSelect} />
    </div>
  )
}

export function EditorPage() {
  const decks = useStore((s) => s.decks)
  const obs = useStore((s) => s.obs)
  const catalog = useStore((s) => s.catalog)

  const [deckId, setDeckId] = useState<number | null>(null)
  const deck: DeckModel | undefined = decks.find((d) => d.id === deckId) ?? decks[0]
  const root = deck?.pages.find((p) => p.parentPageId === null)
  const [pageId, setPageId] = useState<number | null>(null)
  const page: PageModel | undefined = deck?.pages.find((p) => p.id === pageId) ?? root
  const [selection, setSelection] = useState<Selection>(null)
  const [dragItem, setDragItem] = useState<{ label: string; icon: string | null; color: string } | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const [newDeckOpen, setNewDeckOpen] = useState(false)

  useEffect(() => setSelection(null), [pageId, deckId])

  const palette = useMemo(() => buildPalette(obs, catalog), [obs, catalog])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!deck || !page) return <AppShell title="Editor">{null}</AppShell>

  const at = (row: number, column: number) => page.buttons.find((b) => b.row === row && b.column === column)
  const selectedButton = selection?.kind === 'button' ? page.buttons.find((b) => b.id === selection.id) : undefined

  const firstFree = (): { row: number; column: number } | null => {
    for (let r = 0; r < deck.rows; r++) for (let c = 0; c < deck.columns; c++) if (!at(r, c)) return { row: r, column: c }
    return null
  }

  const addItem = async (item: PaletteItem, slot?: { row: number; column: number }) => {
    const target = slot ?? (selection?.kind === 'slot' ? selection : firstFree())
    if (!target) return toast('Auf dieser Seite ist kein Platz mehr frei. Leg einen Ordner an oder vergrößere das Raster.', 'error')
    if (at(target.row, target.column)) return toast('Dieser Platz ist schon belegt – zieh die Taste auf einen freien Platz.', 'error')
    try {
      const created = item.folder
        ? await api<ButtonModel>(`/api/pages/${page.id}/folders`, { body: { name: 'Ordner', row: target.row, column: target.column } })
        : await api<ButtonModel>(`/api/pages/${page.id}/buttons`, {
            body: { row: target.row, column: target.column, label: item.label, icon: item.icon, color: item.color, actions: item.actions },
          })
      setSelection({ kind: 'button', id: created.id })
    } catch (e) {
      toast(`Taste konnte nicht angelegt werden: ${errorMessage(e)}`, 'error')
    }
  }

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { item?: PaletteItem; button?: ButtonModel }
    const src = data.item ?? data.button
    if (src) setDragItem({ label: src.label, icon: src.icon, color: src.color })
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setDragItem(null)
    const over = e.over?.data.current as { row: number; column: number } | undefined
    if (!over) return
    const data = e.active.data.current as { item?: PaletteItem; button?: ButtonModel }
    if (data.item) return addItem(data.item, over)
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

  const breadcrumb: PageModel[] = []
  for (let p: PageModel | undefined = page; p; p = deck.pages.find((x) => x.id === p!.parentPageId)) breadcrumb.unshift(p)

  return (
    <AppShell
      title="Editor"
      actions={
        <>
          <select className="field h-9 w-auto max-w-[12rem] font-semibold" value={deck.id} onChange={(e) => { setDeckId(Number(e.target.value)); setPageId(null) }} aria-label="Deck">
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost hidden md:inline-flex" onClick={() => setGridOpen(true)}>
            <IconLayoutGrid size={16} /> {deck.rows} × {deck.columns}
          </button>
          <button className="btn btn-ghost hidden md:inline-flex" onClick={() => void generate()} disabled={obs?.status !== 'connected'} title="Stream, Aufnahme, alle Szenen und Audioquellen automatisch anlegen">
            <IconSparkles size={16} /> Aus OBS befüllen
          </button>
          <button className="btn btn-create" onClick={() => setNewDeckOpen(true)}>
            <IconPlus size={16} /> <span className="hidden sm:inline">Neues Deck</span>
          </button>
        </>
      }
    >
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setDragItem(null)}>
        <div className="flex h-full min-h-[560px]">
          <aside className="hidden w-72 shrink-0 border-r border-line bg-surface xl:block">
            <Palette items={palette} onAdd={(item) => void addItem(item)} obsConnected={obs?.status === 'connected'} />
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <nav className="flex items-center gap-1 px-6 pt-5 text-sm" aria-label="Ordnerpfad">
              {breadcrumb.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1">
                  {i > 0 && <IconChevronRight size={14} className="text-ink-faint" />}
                  <button
                    className={`rounded-ctl px-1.5 py-1 font-semibold ${p.id === page.id ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
                    onClick={() => setPageId(p.id)}
                  >
                    {p.parentPageId === null ? 'Startseite' : p.name}
                  </button>
                </span>
              ))}
              {page.parentPageId !== null && <FolderRename page={page} />}
            </nav>
            <p className="px-6 pt-1 text-xs text-ink-faint">
              Taste anklicken zum Bearbeiten · ziehen zum Verschieben/Tauschen · Doppelklick auf einen Ordner öffnet ihn
            </p>
            <div className="min-h-0 flex-1 p-6">
              <DeckGrid
                rows={deck.rows}
                columns={deck.columns}
                maxKeySize={150}
                renderSlot={(row, column, size) => {
                  const b = at(row, column)
                  const slotSelected = selection?.kind === 'slot' && selection.row === row && selection.column === column
                  return (
                    <Slot row={row} column={column} selected={slotSelected} onSelect={() => setSelection({ kind: 'slot', row, column })}>
                      {b && (
                        <DraggableKey
                          button={b}
                          size={size}
                          active={isButtonActive(b, obs)}
                          selected={selection?.kind === 'button' && selection.id === b.id}
                          onSelect={() => setSelection({ kind: 'button', id: b.id })}
                          onOpen={() => {
                            const target = b.actions.find((a) => a.type === 'deck.openPage')?.params?.page
                            if (target != null) setPageId(Number(target))
                          }}
                        />
                      )}
                    </Slot>
                  )
                }}
              />
            </div>
          </section>

          <aside className="hidden w-[22rem] shrink-0 border-l border-line bg-surface lg:block">
            {selectedButton ? (
              <Inspector
                key={selectedButton.id}
                button={selectedButton}
                deck={deck}
                catalog={catalog}
                onOpenFolder={(id) => setPageId(id)}
                onDeleted={() => setSelection(null)}
              />
            ) : selection?.kind === 'slot' ? (
              <div className="space-y-3 p-5">
                <h2 className="text-sm font-bold text-ink">Freier Platz · Reihe {selection.row + 1}, Spalte {selection.column + 1}</h2>
                <p className="text-sm text-ink-muted">Wähle links etwas aus der Palette – es landet genau hier. Oder:</p>
                <div className="grid gap-2">
                  {palette.filter((p) => p.group === 'Deck' && (p.folder || p.id === 'deck:empty')).map((p) => (
                    <button key={p.id} className="btn btn-ghost justify-start" onClick={() => void addItem(p)}>
                      <KeyIcon name={p.icon} size={16} /> {p.label}
                    </button>
                  ))}
                </div>
                <div className="xl:hidden">
                  <Palette items={palette} onAdd={(item) => void addItem(item)} obsConnected={obs?.status === 'connected'} />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <IconLayoutGrid size={36} stroke={1.3} className="text-ink-faint" />
                <p className="text-sm font-semibold text-ink">Nichts ausgewählt</p>
                <p className="text-sm text-ink-muted">Klick auf eine Taste, um sie zu bearbeiten, oder auf einen freien Platz, um eine neue anzulegen.</p>
              </div>
            )}
          </aside>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragItem && (
            <div className="h-24 w-24 rotate-3 opacity-90">
              <DeckKey button={{ id: -1, pageId: 0, row: 0, column: 0, label: dragItem.label, icon: dragItem.icon, color: dragItem.color, actions: [] }} size={96} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Kleine Bildschirme: Inspektor als Dialog statt Seitenleiste. */}
      <div className="lg:hidden">
        <Modal open={!!selectedButton} title="Taste bearbeiten" onClose={() => setSelection(null)}>
          {selectedButton && (
            <div className="-mx-5 -my-4">
              <Inspector key={selectedButton.id} button={selectedButton} deck={deck} catalog={catalog} onOpenFolder={(id) => setPageId(id)} onDeleted={() => setSelection(null)} />
            </div>
          )}
        </Modal>
      </div>

      <GridModal open={gridOpen} deck={deck} onClose={() => setGridOpen(false)} />
      <NewDeckModal open={newDeckOpen} onClose={() => setNewDeckOpen(false)} onCreated={(id) => { setDeckId(id); setPageId(null) }} />
    </AppShell>
  )
}

function FolderRename({ page }: { page: PageModel }) {
  const [name, setName] = useState(page.name)
  useEffect(() => setName(page.name), [page.name])
  const save = async () => {
    if (name.trim() === page.name || !name.trim()) return setName(page.name)
    try {
      await api(`/api/pages/${page.id}`, { method: 'PUT', body: { name: name.trim() } })
    } catch (e) {
      toast(`Ordner konnte nicht umbenannt werden: ${errorMessage(e)}`, 'error')
    }
  }
  return (
    <input
      className="field ml-3 h-8 w-44"
      value={name}
      maxLength={80}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Ordnername"
    />
  )
}

function GridFields({ rows, columns, onChange }: { rows: number; columns: number; onChange: (rows: number, columns: number) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Vorlagen</span>
        <div className="grid grid-cols-4 gap-2">
          {GRID_PRESETS.map((p) => (
            <button key={p.label} className="chip-select h-auto flex-col py-2" aria-pressed={p.rows === rows && p.columns === columns} onClick={() => onChange(p.rows, p.columns)}>
              <span className="text-sm font-bold">{p.label}</span>
              <span className="text-[11px] font-medium opacity-80">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="grid-rows">Reihen</label>
          <input id="grid-rows" type="number" min={1} max={12} className="field" value={rows} onChange={(e) => onChange(Number(e.target.value), columns)} />
        </div>
        <div>
          <label className="label" htmlFor="grid-cols">Spalten</label>
          <input id="grid-cols" type="number" min={1} max={12} className="field" value={columns} onChange={(e) => onChange(rows, Number(e.target.value))} />
        </div>
      </div>
    </div>
  )
}

function GridModal({ open, deck, onClose }: { open: boolean; deck: DeckModel; onClose: () => void }) {
  const [name, setName] = useState(deck.name)
  const [rows, setRows] = useState(deck.rows)
  const [columns, setColumns] = useState(deck.columns)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    setName(deck.name)
    setRows(deck.rows)
    setColumns(deck.columns)
    setConfirmDelete(false)
  }, [deck, open])

  const save = async () => {
    try {
      await api(`/api/decks/${deck.id}`, { method: 'PUT', body: { name, rows, columns } })
      toast('Deck gespeichert.', 'success')
      onClose()
    } catch (e) {
      toast(`Deck konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    }
  }

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      await api(`/api/decks/${deck.id}`, { method: 'DELETE' })
      onClose()
    } catch (e) {
      toast(`Deck konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <Modal
      open={open}
      title="Deck & Raster"
      onClose={onClose}
      footer={
        <>
          <button className={confirmDelete ? 'btn btn-danger mr-auto' : 'btn btn-danger-ghost mr-auto'} onClick={() => void remove()}>
            <IconTrash size={16} /> {confirmDelete ? 'Deck wirklich löschen?' : 'Deck löschen'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-confirm" onClick={() => void save()}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="deck-name">Name</label>
          <input id="deck-name" className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <GridFields rows={rows} columns={columns} onChange={(r, c) => { setRows(r); setColumns(c) }} />
      </div>
    </Modal>
  )
}

function NewDeckModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [rows, setRows] = useState(3)
  const [columns, setColumns] = useState(5)
  const create = async () => {
    try {
      const deck = await api<DeckModel>('/api/decks', { body: { name: name.trim() || 'Neues Deck', rows, columns } })
      onCreated(deck.id)
      onClose()
      setName('')
    } catch (e) {
      toast(`Deck konnte nicht angelegt werden: ${errorMessage(e)}`, 'error')
    }
  }
  return (
    <Modal
      open={open}
      title="Neues Deck"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-create" onClick={() => void create()}>
            <IconPlus size={16} /> Anlegen
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="new-deck-name">Name</label>
          <input id="new-deck-name" autoFocus className="field" maxLength={80} placeholder="z.B. Tablet, Handy, Just Chatting" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <GridFields rows={rows} columns={columns} onChange={(r, c) => { setRows(r); setColumns(c) }} />
      </div>
    </Modal>
  )
}
