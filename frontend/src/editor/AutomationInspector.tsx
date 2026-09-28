import { IconBolt, IconCheck, IconFilter, IconPhoto, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ActionStep, AutomationModel, ButtonModel, Catalog } from '../api/types'
import { DeckKey } from '../components/DeckKey'
import { HotkeyRecorder } from '../components/HotkeyRecorder'
import { IconPicker } from '../components/IconPicker'
import { toast } from '../components/Toasts'
import { KEY_COLORS } from '../lib/keyColors'
import { StepEditor, validateSteps } from './StepEditor'

interface Props {
  button: ButtonModel
  automationId: number
  catalog: Catalog | null
  onDeleted: () => void
}

interface Draft {
  name: string
  enabled: boolean
  trigger: ActionStep
  conditions: ActionStep[]
  actions: ActionStep[]
  icon: string | null
  color: string
  hotkey: string | null
}

/**
 * Automations-Taste: die Taste selbst schaltet die Regel an/aus (LED = aktiv). Hier wird die Regel
 * "Wenn … und nur wenn … dann …" bearbeitet - Name und Aussehen der Taste gleich mit.
 */
export function AutomationInspector({ button, automationId, catalog, onDeleted }: Props) {
  const [original, setOriginal] = useState<AutomationModel | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [pickIcon, setPickIcon] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let alive = true
    api<AutomationModel[]>('/api/automations')
      .then((list) => {
        const a = list.find((x) => x.id === automationId)
        if (!alive) return
        if (!a) return toast('Die Automation dieser Taste existiert nicht mehr – Taste löschen und neu anlegen.', 'error')
        setOriginal(a)
        setDraft({ name: a.name, enabled: a.enabled, trigger: a.trigger, conditions: a.conditions, actions: a.actions, icon: button.icon, color: button.color, hotkey: button.hotkey })
      })
      .catch((e) => toast(`Automation konnte nicht geladen werden: ${errorMessage(e)}`, 'error'))
    return () => {
      alive = false
    }
  }, [automationId, button.icon, button.color, button.hotkey])

  if (!draft || !catalog) return <div className="p-6 text-sm text-ink-muted">Lade Automation …</div>

  const serverActions = catalog.actions.filter((a) => !a.type.startsWith('deck.'))

  const save = async () => {
    if (!draft.name.trim()) return toast('Bitte der Automation einen Namen geben.', 'error')
    const problem =
      validateSteps([draft.trigger], catalog.triggers) ?? validateSteps(draft.conditions, catalog.conditions) ?? validateSteps(draft.actions, serverActions)
    if (problem) return toast(problem, 'error')
    if (draft.enabled && draft.actions.length === 0) return toast('Füge unter „dann …“ mindestens eine Aktion hinzu, bevor du die Automation einschaltest.', 'error')
    setSaving(true)
    try {
      await api(`/api/automations/${automationId}`, {
        method: 'PUT',
        body: { name: draft.name.trim(), enabled: draft.enabled, trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions },
      })
      await api(`/api/buttons/${button.id}`, {
        method: 'PUT',
        body: { row: button.row, column: button.column, label: draft.name.trim(), icon: draft.icon, color: draft.color, actions: button.actions, hotkey: draft.hotkey ?? '' },
      })
      toast('Automation gespeichert.', 'success')
    } catch (e) {
      toast(`Automation konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    try {
      await api(`/api/automations/${automationId}/test`, { method: 'POST' })
      toast('Aktionen einmal ausgeführt.', 'success')
    } catch (e) {
      toast(`Test fehlgeschlagen: ${errorMessage(e)}`, 'error')
    }
  }

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      await api(`/api/automations/${automationId}`, { method: 'DELETE' })
      await api(`/api/buttons/${button.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (e) {
      toast(`Automation konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
      setConfirmDelete(false)
    }
  }

  const preview: ButtonModel = { ...button, label: draft.name, icon: draft.icon, color: draft.color }
  const dirty =
    original != null &&
    JSON.stringify({ n: original.name, e: original.enabled, t: original.trigger, c: original.conditions, a: original.actions, i: button.icon, co: button.color, h: button.hotkey }) !==
      JSON.stringify({ n: draft.name, e: draft.enabled, t: draft.trigger, c: draft.conditions, a: draft.actions, i: draft.icon, co: draft.color, h: draft.hotkey })

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0">
            <DeckKey button={preview} size={80} active={draft.enabled} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <input className="field font-semibold" maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Name" />
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <button className="switch" role="switch" aria-checked={draft.enabled} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} />
              {draft.enabled ? 'Aktiv' : 'Aus'}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setPickIcon(true)}>
            <IconPhoto size={15} /> Icon
          </button>
          <div className="flex flex-wrap gap-1">
            {KEY_COLORS.map((c) => (
              <button
                key={c.id}
                title={c.label}
                aria-label={c.label}
                aria-pressed={draft.color === c.id}
                onClick={() => setDraft({ ...draft, color: c.id })}
                className="h-5 w-5 rounded-badge ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-select"
                style={{ background: c.swatch }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="label">Tastenkürzel (schaltet die Automation an/aus)</span>
          <HotkeyRecorder value={draft.hotkey} onChange={(hotkey) => setDraft({ ...draft, hotkey })} />
        </div>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconBolt size={16} className="text-brand" /> Wenn …
          </h3>
          <StepEditor
            steps={[draft.trigger]}
            definitions={catalog.triggers}
            addLabel="Auslöser ändern"
            onChange={(steps) => {
              // Genau ein Ausloeser: ein neu gewaehlter ersetzt den bisherigen, Entfernen wird ignoriert.
              const trigger = steps.at(-1)
              if (trigger) setDraft({ ...draft, trigger })
            }}
          />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconFilter size={16} className="text-brand" /> … und nur wenn (optional)
          </h3>
          <StepEditor steps={draft.conditions} definitions={catalog.conditions} onChange={(conditions) => setDraft({ ...draft, conditions })} addLabel="Bedingung hinzufügen" />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconPlayerPlay size={16} className="text-brand" /> … dann
          </h3>
          <StepEditor steps={draft.actions} definitions={serverActions} onChange={(actions) => setDraft({ ...draft, actions })} />
        </section>

        <p className="text-xs text-ink-faint">Auf dem Deck schaltet ein Druck auf diese Taste die Automation an oder aus – die LED zeigt, ob sie aktiv ist.</p>
      </div>

      <div className="flex gap-2 border-t border-line p-4">
        <button className={confirmDelete ? 'btn btn-danger' : 'btn btn-danger-ghost'} onClick={() => void remove()} onBlur={() => setConfirmDelete(false)}>
          <IconTrash size={16} /> {confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
        </button>
        <button className="btn btn-ghost" onClick={() => void test()} title="Aktionen jetzt einmal testen">
          <IconPlayerPlay size={16} />
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
