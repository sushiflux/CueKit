import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { DeckModel } from '../api/types'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toasts'
import { GRID_PRESETS } from '../lib/keyColors'

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
          <label className="label" htmlFor="grid-rows">
            Reihen
          </label>
          <input id="grid-rows" type="number" min={1} max={12} className="field" value={rows} onChange={(e) => onChange(Number(e.target.value), columns)} />
        </div>
        <div>
          <label className="label" htmlFor="grid-cols">
            Spalten
          </label>
          <input id="grid-cols" type="number" min={1} max={12} className="field" value={columns} onChange={(e) => onChange(rows, Number(e.target.value))} />
        </div>
      </div>
    </div>
  )
}

/** Name und Raster des aktuellen Decks; Deck loeschen. */
export function GridModal({ open, deck, onClose }: { open: boolean; deck: DeckModel; onClose: () => void }) {
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
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-confirm" onClick={() => void save()}>
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="deck-name">
            Name
          </label>
          <input id="deck-name" className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <GridFields
          rows={rows}
          columns={columns}
          onChange={(r, c) => {
            setRows(r)
            setColumns(c)
          }}
        />
      </div>
    </Modal>
  )
}

export function NewDeckModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
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
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-create" onClick={() => void create()}>
            <IconPlus size={16} /> Anlegen
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="new-deck-name">
            Name
          </label>
          <input id="new-deck-name" autoFocus className="field" maxLength={80} placeholder="z.B. Tablet, Handy, Just Chatting" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <GridFields
          rows={rows}
          columns={columns}
          onChange={(r, c) => {
            setRows(r)
            setColumns(c)
          }}
        />
      </div>
    </Modal>
  )
}
