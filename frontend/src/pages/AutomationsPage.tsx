import { IconAlertTriangle, IconBolt, IconCheck, IconFilter, IconPencil, IconPlayerPlay, IconPlus, IconRoute, IconTrash } from '@tabler/icons-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ActionDefinition, ActionStep, AutomationModel } from '../api/types'
import { AppShell } from '../components/AppShell'
import { KeyIcon } from '../components/KeyIcon'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toasts'
import { defaultParams, StepEditor, validateSteps } from '../editor/StepEditor'
import { useStore } from '../state/store'

interface Draft {
  id?: number
  name: string
  enabled: boolean
  trigger: ActionStep
  conditions: ActionStep[]
  actions: ActionStep[]
}

export function AutomationsPage() {
  const catalog = useStore((s) => s.catalog)
  const [list, setList] = useState<AutomationModel[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    try {
      setList(await api<AutomationModel[]>('/api/automations'))
    } catch (e) {
      toast(`Automationen konnten nicht geladen werden: ${errorMessage(e)}`, 'error')
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener('deck:automations', onChange)
    return () => window.removeEventListener('deck:automations', onChange)
  }, [load])

  const serverActions = (catalog?.actions ?? []).filter((a) => !a.type.startsWith('deck.'))
  const describe = (step: ActionStep, kind: 'triggers' | 'conditions' | 'actions') => {
    const def = catalog?.[kind].find((d) => d.type === step.type)
    const values = Object.entries(step.params ?? {})
      .filter(([k, v]) => v !== '' && v != null && k !== 'mode')
      .map(([, v]) => String(v))
    return { name: def?.name ?? step.type, icon: def?.icon ?? 'tabler:help', detail: values.join(' · ') }
  }

  const newDraft = (): Draft => {
    const trigger = catalog?.triggers.find((t) => t.type === 'obs.sceneActiveFor') ?? catalog?.triggers[0]
    return { name: '', enabled: true, trigger: { type: trigger?.type ?? '', params: defaultParams(trigger) }, conditions: [], actions: [] }
  }

  const toggle = async (a: AutomationModel) => {
    try {
      await api(`/api/automations/${a.id}`, { method: 'PUT', body: { ...a, enabled: !a.enabled } })
      await load()
    } catch (e) {
      toast(`Automation konnte nicht umgeschaltet werden: ${errorMessage(e)}`, 'error')
    }
  }

  const test = async (a: AutomationModel) => {
    try {
      await api(`/api/automations/${a.id}/test`, { method: 'POST' })
      toast(`„${a.name}“ ausgeführt.`, 'success')
    } catch (e) {
      toast(`Test von „${a.name}“ fehlgeschlagen: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <AppShell
      title="Automationen"
      actions={
        <button className="btn btn-create" onClick={() => setDraft(newDraft())} disabled={!catalog}>
          <IconPlus size={16} /> Neue Automation
        </button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-3 p-4 lg:p-8">
        {list?.length === 0 && (
          <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
            <IconRoute size={40} stroke={1.3} className="text-brand" />
            <h2 className="text-lg font-bold text-ink">Noch keine Automationen</h2>
            <p className="max-w-md text-sm text-ink-muted">
              Lass dein Setup für dich arbeiten: z.B. „Wenn ‚Starting Soon‘ 5 Minuten läuft, wechsle zu ‚Live‘“ oder „Wenn der Stream endet, stoppe die Aufnahme“.
            </p>
            <button className="btn btn-create mt-2" onClick={() => setDraft(newDraft())} disabled={!catalog}>
              <IconPlus size={16} /> Neue Automation
            </button>
          </div>
        )}

        {list?.map((a, i) => {
          const trig = describe(a.trigger, 'triggers')
          return (
            <motion.div
              key={a.id}
              className="card p-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div className="flex items-start gap-4">
                <button className="switch mt-0.5" role="switch" aria-checked={a.enabled} aria-label={a.enabled ? 'Deaktivieren' : 'Aktivieren'} onClick={() => void toggle(a)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`truncate font-bold ${a.enabled ? 'text-ink' : 'text-ink-muted'}`}>{a.name}</h3>
                    {a.lastRun && !a.lastRun.ok && (
                      <span className="flex items-center gap-1 rounded-badge bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger" title={a.lastRun.error ?? ''}>
                        <IconAlertTriangle size={12} /> Letzter Lauf fehlgeschlagen
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                    <span className="flex items-center gap-1.5 rounded-badge bg-brand-soft px-2 py-0.5 font-semibold text-brand">
                      <IconBolt size={13} /> Wenn
                    </span>
                    <span className="flex items-center gap-1.5 text-ink">
                      <KeyIcon name={trig.icon} size={15} /> {trig.name}
                      {trig.detail && <span className="text-ink-muted">({trig.detail})</span>}
                    </span>
                    {a.conditions.map((c, ci) => {
                      const d = describe(c, 'conditions')
                      return (
                        <span key={ci} className="flex items-center gap-1.5 text-ink-muted">
                          <IconFilter size={13} /> und {d.name} {d.detail && `(${d.detail})`}
                        </span>
                      )
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                    <span className="font-semibold text-ink">dann</span>
                    {a.actions.map((s, si) => {
                      const d = describe(s, 'actions')
                      return (
                        <span key={si} className="flex items-center gap-1.5">
                          <KeyIcon name={d.icon} size={14} /> {d.name}
                          {d.detail && <span className="text-ink-faint">({d.detail})</span>}
                        </span>
                      )
                    })}
                  </div>
                  {a.lastRun?.ok && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-ink-faint">
                      <IconCheck size={12} /> Zuletzt ausgeführt {new Date(a.lastRun.at).toLocaleString('de-DE')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="btn btn-ghost btn-icon" title="Aktionen jetzt einmal testen" onClick={() => void test(a)}>
                    <IconPlayerPlay size={16} />
                  </button>
                  <button className="btn btn-ghost btn-icon" title="Bearbeiten" onClick={() => setDraft({ ...a })}>
                    <IconPencil size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {draft && catalog && (
        <AutomationEditor
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null)
            void load()
          }}
          actionDefs={serverActions}
        />
      )}
    </AppShell>
  )
}

function AutomationEditor({
  draft,
  onChange,
  onClose,
  onSaved,
  actionDefs,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  onClose: () => void
  onSaved: () => void
  actionDefs: ActionDefinition[]
}) {
  const catalog = useStore((s) => s.catalog)!
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    if (!draft.name.trim()) return toast('Bitte der Automation einen Namen geben.', 'error')
    const problem =
      validateSteps([draft.trigger], catalog.triggers) ?? validateSteps(draft.conditions, catalog.conditions) ?? validateSteps(draft.actions, actionDefs)
    if (problem) return toast(problem, 'error')
    if (draft.actions.length === 0) return toast('Füge mindestens eine Aktion hinzu („dann …“).', 'error')
    try {
      const body = { name: draft.name.trim(), enabled: draft.enabled, trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions }
      if (draft.id) await api(`/api/automations/${draft.id}`, { method: 'PUT', body })
      else await api('/api/automations', { body })
      toast('Automation gespeichert.', 'success')
      onSaved()
    } catch (e) {
      toast(`Automation konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    }
  }

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      await api(`/api/automations/${draft.id}`, { method: 'DELETE' })
      onSaved()
    } catch (e) {
      toast(`Automation konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <Modal
      open
      title={draft.id ? 'Automation bearbeiten' : 'Neue Automation'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          {draft.id && (
            <button className={confirmDelete ? 'btn btn-danger mr-auto' : 'btn btn-danger-ghost mr-auto'} onClick={() => void remove()}>
              <IconTrash size={16} /> {confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-confirm" onClick={() => void save()}>
            <IconCheck size={16} /> Speichern
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="label" htmlFor="auto-name">Name</label>
            <input id="auto-name" autoFocus className="field" maxLength={80} placeholder="z.B. Starting Soon → Live" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm font-semibold text-ink-muted">
            <button className="switch" role="switch" aria-checked={draft.enabled} onClick={() => onChange({ ...draft, enabled: !draft.enabled })} />
            Aktiv
          </label>
        </div>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconBolt size={16} className="text-brand" /> Wenn …
          </h3>
          <StepEditor
            steps={[draft.trigger]}
            definitions={catalog.triggers}
            onChange={(steps) => {
              // Genau ein Ausloeser: ein neu gewaehlter ersetzt den bisherigen, Entfernen wird ignoriert.
              const trigger = steps.at(-1)
              if (trigger) onChange({ ...draft, trigger })
            }}
            addLabel="Auslöser ändern"
          />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconFilter size={16} className="text-brand" /> … und nur wenn (optional)
          </h3>
          <StepEditor steps={draft.conditions} definitions={catalog.conditions} onChange={(conditions) => onChange({ ...draft, conditions })} addLabel="Bedingung hinzufügen" />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <IconPlayerPlay size={16} className="text-brand" /> … dann
          </h3>
          <StepEditor steps={draft.actions} definitions={actionDefs} onChange={(actions) => onChange({ ...draft, actions })} />
        </section>
      </div>
    </Modal>
  )
}
