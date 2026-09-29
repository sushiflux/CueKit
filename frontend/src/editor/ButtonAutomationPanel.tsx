import { IconCheck, IconFilter, IconPlayerPlay, IconRoute, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { ActionStep, AutomationModel, Catalog } from '../api/types'
import { toast } from '../components/Toasts'
import { StepEditor, validateSteps } from './StepEditor'

interface Props {
  buttonId: number
  catalog: Catalog | null
}

interface Draft {
  name: string
  enabled: boolean
  conditions: ActionStep[]
  actions: ActionStep[]
}

const emptyDraft = (): Draft => ({ name: 'Neue Automation', enabled: false, conditions: [], actions: [] })

/**
 * Automation-Tab einer bestehenden Taste: der Ausloeser ist implizit "button.pressed" (kein
 * Auswahlfeld dafuer). Name/Icon/Farbe/Hotkey der Taste selbst gehoeren zum "Aktion"-Tab (Inspector) -
 * hier geht es nur um die Regel "…und nur wenn… …dann…", die zusaetzlich zu den normalen Tasten-
 * Aktionen beim Tastendruck ausgewertet wird.
 */
export function ButtonAutomationPanel({ buttonId, catalog }: Props) {
  const [loading, setLoading] = useState(true)
  const [automationId, setAutomationId] = useState<number | null>(null)
  const [original, setOriginal] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setAutomationId(null)
    setOriginal(null)
    setDraft(null)
    setConfirmDelete(false)
    api<AutomationModel>(`/api/buttons/${buttonId}/automation`)
      .then((a) => {
        if (!alive) return
        const d: Draft = { name: a.name, enabled: a.enabled, conditions: a.conditions, actions: a.actions }
        setAutomationId(a.id)
        setOriginal(d)
        setDraft(d)
      })
      .catch((e) => {
        if (!alive) return
        if (e instanceof ApiError && e.status === 404) return // noch keine Automation - leerer Zustand
        toast(`Automation konnte nicht geladen werden: ${errorMessage(e)}`, 'error')
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [buttonId])

  if (loading) return <div className="p-6 text-sm text-ink-muted">Lade Automation …</div>

  if (!draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <IconRoute size={36} stroke={1.3} className="text-ink-faint" />
        <p className="text-sm font-semibold text-ink">Keine Automation für diese Taste</p>
        <p className="max-w-xs text-sm text-ink-muted">
          Zusätzlich zu den Aktionen kann eine Bedingung geprüft und beim Tastendruck eine eigene Regel ausgeführt werden.
        </p>
        <button className="btn btn-create mt-1" onClick={() => setDraft(emptyDraft())}>
          <IconRoute size={16} /> Automation hinzufügen
        </button>
      </div>
    )
  }

  const serverActions = (catalog?.actions ?? []).filter((a) => !a.type.startsWith('deck.'))
  const dirty = original == null || JSON.stringify(original) !== JSON.stringify(draft)

  const save = async () => {
    if (!catalog) return
    if (!draft.name.trim()) return toast('Bitte der Automation einen Namen geben.', 'error')
    const problem = validateSteps(draft.conditions, catalog.conditions) ?? validateSteps(draft.actions, serverActions)
    if (problem) return toast(problem, 'error')
    if (draft.enabled && draft.actions.length === 0) return toast('Füge unter „dann …“ mindestens eine Aktion hinzu, bevor du die Automation einschaltest.', 'error')
    setSaving(true)
    try {
      const body = {
        name: draft.name.trim(),
        enabled: draft.enabled,
        buttonId,
        trigger: { type: 'button.pressed', params: null },
        conditions: draft.conditions,
        actions: draft.actions,
      }
      if (automationId == null) {
        const created = await api<AutomationModel>('/api/automations', { body })
        setAutomationId(created.id)
      } else {
        await api(`/api/automations/${automationId}`, { method: 'PUT', body })
      }
      setOriginal(draft)
      toast('Automation gespeichert.', 'success')
    } catch (e) {
      toast(`Automation konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    if (automationId == null) return toast('Bitte zuerst speichern, bevor die Automation getestet werden kann.', 'error')
    try {
      await api(`/api/automations/${automationId}/test`, { method: 'POST' })
      toast('Aktionen einmal ausgeführt.', 'success')
    } catch (e) {
      toast(`Test fehlgeschlagen: ${errorMessage(e)}`, 'error')
    }
  }

  const remove = async () => {
    if (automationId == null) {
      // Entwurf, noch nie gespeichert - einfach verwerfen.
      setDraft(null)
      return
    }
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      await api(`/api/automations/${automationId}`, { method: 'DELETE' })
      setAutomationId(null)
      setOriginal(null)
      setDraft(null)
      toast('Automation entfernt.', 'success')
    } catch (e) {
      toast(`Automation konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
      setConfirmDelete(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="automation-name">
              Name der Automation
            </label>
            <input id="automation-name" className="field font-semibold" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <label className="flex shrink-0 flex-col items-center gap-1.5 pt-5 text-xs font-semibold text-ink-muted">
            <button className="switch" role="switch" aria-checked={draft.enabled} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} />
            {draft.enabled ? 'Aktiv' : 'Aus'}
          </label>
        </div>

        <p className="rounded-card border border-line bg-surface-2/60 px-3 py-2 text-xs text-ink-faint">
          Auslöser: diese Taste wurde gedrückt. Läuft zusätzlich zu den Aktionen im Tab „Aktion“.
        </p>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconFilter size={16} className="text-brand" /> … und nur wenn (optional)
          </h3>
          <StepEditor steps={draft.conditions} definitions={catalog?.conditions ?? []} onChange={(conditions) => setDraft({ ...draft, conditions })} addLabel="Bedingung hinzufügen" />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconPlayerPlay size={16} className="text-brand" /> … dann
          </h3>
          <StepEditor steps={draft.actions} definitions={serverActions} onChange={(actions) => setDraft({ ...draft, actions })} />
        </section>
      </div>

      <div className="flex gap-2 border-t border-line p-4">
        <button className={confirmDelete ? 'btn btn-danger' : 'btn btn-danger-ghost'} onClick={() => void remove()} onBlur={() => setConfirmDelete(false)}>
          <IconTrash size={16} /> {confirmDelete ? 'Wirklich löschen?' : automationId == null ? 'Verwerfen' : 'Löschen'}
        </button>
        {automationId != null && (
          <button className="btn btn-ghost" onClick={() => void test()} title="Aktionen jetzt einmal testen">
            <IconPlayerPlay size={16} />
          </button>
        )}
        <button className="btn btn-confirm ml-auto" disabled={!dirty || saving} onClick={() => void save()}>
          <IconCheck size={16} /> {saving ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
