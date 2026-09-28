import { IconCheck, IconFolderOpen, IconPhoto, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ButtonModel, Catalog, DeckModel } from '../api/types'
import { DeckKey } from '../components/DeckKey'
import { HotkeyRecorder } from '../components/HotkeyRecorder'
import { IconPicker } from '../components/IconPicker'
import { toast } from '../components/Toasts'
import { KEY_COLORS } from '../lib/keyColors'
import { StepEditor, validateSteps } from './StepEditor'

interface Props {
  button: ButtonModel
  deck: DeckModel
  catalog: Catalog | null
  onOpenFolder: (pageId: number) => void
  onDeleted: () => void
}

export function Inspector({ button, deck, catalog, onOpenFolder, onDeleted }: Props) {
  const [draft, setDraft] = useState(button)
  const [saving, setSaving] = useState(false)
  const [pickIcon, setPickIcon] = useState(false)

  // Andere Taste gewaehlt oder von aussen (anderes Geraet) geaendert -> Entwurf neu laden.
  useEffect(() => setDraft(button), [button])

  const dirty = JSON.stringify(draft) !== JSON.stringify(button)
  const folderTarget = button.actions.find((a) => a.type === 'deck.openPage')?.params?.page

  const save = async () => {
    const problem = validateSteps(draft.actions, catalog?.actions ?? [])
    if (problem) return toast(problem, 'error')
    setSaving(true)
    try {
      await api(`/api/buttons/${button.id}`, {
        method: 'PUT',
        body: { row: draft.row, column: draft.column, label: draft.label, icon: draft.icon, color: draft.color, actions: draft.actions, hotkey: draft.hotkey ?? '' },
      })
      toast('Taste gespeichert.', 'success')
    } catch (e) {
      toast(`Taste konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setConfirmDelete(false), [button.id])

  const remove = async () => {
    // Zweistufig: erster Klick fragt nach, zweiter loescht.
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      // Ordner-Taste: den Ordner samt Inhalt mitloeschen (Server entfernt dabei auch diese Taste).
      if (folderTarget != null) await api(`/api/pages/${folderTarget}`, { method: 'DELETE' })
      else await api(`/api/buttons/${button.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (e) {
      toast(`Taste konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
      setConfirmDelete(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <div className="flex justify-center py-2">
          <div className="h-28 w-28">
            <DeckKey button={draft} size={112} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="key-label">
            Beschriftung
          </label>
          <input id="key-label" className="field" maxLength={60} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>

        <div>
          <span className="label">Icon</span>
          <button className="btn btn-ghost w-full justify-start" onClick={() => setPickIcon(true)}>
            <IconPhoto size={16} />
            <span className="truncate">{draft.icon ?? 'Kein Icon'}</span>
          </button>
        </div>

        <div>
          <span className="label">Farbe</span>
          <div className="grid grid-cols-11 gap-1.5">
            {KEY_COLORS.map((c) => (
              <button
                key={c.id}
                title={c.label}
                aria-label={c.label}
                aria-pressed={draft.color === c.id}
                onClick={() => setDraft({ ...draft, color: c.id })}
                className="flex aspect-square items-center justify-center rounded-badge ring-offset-2 ring-offset-surface transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-select"
                style={{ background: c.swatch }}
              >
                {draft.color === c.id && <IconCheck size={12} className="text-white" stroke={3} />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Tastenkürzel</span>
          <HotkeyRecorder value={draft.hotkey} onChange={(hotkey) => setDraft({ ...draft, hotkey })} />
        </div>

        <div>
          <span className="label">Aktionen – laufen nacheinander ab</span>
          <StepEditor steps={draft.actions} definitions={catalog?.actions ?? []} deck={deck} onChange={(actions) => setDraft({ ...draft, actions })} />
        </div>

        {folderTarget != null && (
          <button className="btn btn-ghost w-full" onClick={() => onOpenFolder(Number(folderTarget))}>
            <IconFolderOpen size={16} /> Ordner im Editor öffnen
          </button>
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-4">
        <button className={confirmDelete ? 'btn btn-danger' : 'btn btn-danger-ghost'} onClick={() => void remove()} onBlur={() => setConfirmDelete(false)}>
          <IconTrash size={16} /> {confirmDelete ? (folderTarget != null ? 'Ordner samt Inhalt löschen?' : 'Wirklich löschen?') : 'Löschen'}
        </button>
        <button className="btn btn-confirm ml-auto" disabled={!dirty || saving} onClick={() => void save()}>
          <IconCheck size={16} /> {saving ? 'Speichert …' : 'Speichern'}
        </button>
      </div>

      <IconPicker
        open={pickIcon}
        value={draft.icon}
        onClose={() => setPickIcon(false)}
        onPick={(icon) => {
          setDraft({ ...draft, icon })
          setPickIcon(false)
        }}
      />
    </div>
  )
}
