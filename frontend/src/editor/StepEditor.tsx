import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react'
import { useId } from 'react'
import type { ActionDefinition, ActionField, ActionStep, DeckModel, Params } from '../api/types'
import { KeyIcon } from '../components/KeyIcon'
import { useStore } from '../state/store'

export function defaultParams(def: ActionDefinition | undefined): Params {
  const params: Params = {}
  def?.fields.forEach((f) => {
    if (f.default != null) params[f.key] = f.default
  })
  return params
}

/** Formularfeld fuer einen Aktionsparameter - Szenen/Quellen/Audio kommen live aus OBS. */
function FieldInput({ field, params, deck, onChange }: { field: ActionField; params: Params; deck?: DeckModel; onChange: (value: string) => void }) {
  const obs = useStore((s) => s.obs)
  const id = useId()
  const value = params[field.key] == null ? '' : String(params[field.key])

  let options: { value: string; label: string }[] | null = null
  switch (field.kind) {
    case 'select':
      options = field.options ?? []
      break
    case 'scene':
      options = (obs?.scenes ?? []).map((s) => ({ value: s.name, label: s.name }))
      break
    case 'sceneItem':
      options = (obs?.scenes.find((s) => s.name === params.scene)?.items ?? []).map((i) => ({ value: i.sourceName, label: i.sourceName }))
      break
    case 'audioInput':
      options = (obs?.audioInputs ?? []).map((a) => ({ value: a.name, label: a.name }))
      break
    case 'page':
      options = (deck?.pages ?? []).filter((p) => p.parentPageId !== null).map((p) => ({ value: String(p.id), label: p.name }))
      break
  }

  // OBS offline: gespeicherten Wert trotzdem anzeigen/behalten, statt ihn stillschweigend zu verlieren.
  if (options && value && !options.some((o) => o.value === value)) options = [{ value, label: `${value} (nicht gefunden)` }, ...options]

  return (
    <div>
      <label htmlFor={id} className="label">
        {field.label}
        {field.required && ' *'}
      </label>
      {options ? (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{options.length === 0 ? (field.kind === 'page' ? 'Noch keine Ordner' : 'Keine Einträge – OBS verbunden?') : 'Bitte wählen …'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="field"
          type={field.kind === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

interface Props {
  steps: ActionStep[]
  definitions: ActionDefinition[]
  onChange: (steps: ActionStep[]) => void
  deck?: DeckModel
  addLabel?: string
}

/** Liste von Aktionsschritten (Multi-Action): hinzufuegen, konfigurieren, umsortieren, entfernen. */
export function StepEditor({ steps, definitions, onChange, deck, addLabel = 'Aktion hinzufügen' }: Props) {
  const byType = new Map(definitions.map((d) => [d.type, d]))
  const categories = [...new Set(definitions.map((d) => d.category))]

  const update = (index: number, step: ActionStep) => onChange(steps.map((s, i) => (i === index ? step : s)))
  const move = (index: number, delta: number) => {
    const next = [...steps]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const def = byType.get(step.type)
        return (
          <div key={index} className="rounded-card border border-line bg-surface-2/60 p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-badge bg-surface-3 text-[11px] font-bold text-ink-muted">
                {index + 1}
              </span>
              <KeyIcon name={def?.icon ?? 'tabler:help'} size={16} className="shrink-0 text-brand" />
              <select
                className="field h-8 min-w-0 flex-1 font-semibold"
                value={step.type}
                onChange={(e) => update(index, { type: e.target.value, params: defaultParams(byType.get(e.target.value)) })}
                aria-label="Aktionstyp"
              >
                {!def && <option value={step.type}>{step.type} (nicht verfügbar)</option>}
                {categories.map((c) => (
                  <optgroup key={c} label={c}>
                    {definitions.filter((d) => d.category === c).map((d) => (
                      <option key={d.type} value={d.type}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="flex shrink-0">
                {steps.length > 1 && (
                  <>
                    <button className="btn btn-sm btn-icon text-ink-muted hover:text-ink" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Nach oben">
                      <IconArrowUp size={15} />
                    </button>
                    <button
                      className="btn btn-sm btn-icon text-ink-muted hover:text-ink"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Nach unten"
                    >
                      <IconArrowDown size={15} />
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-icon text-danger hover:bg-danger-soft" onClick={() => onChange(steps.filter((_, i) => i !== index))} aria-label="Schritt entfernen">
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
            {def && def.fields.length > 0 && (
              <div className="grid gap-3">
                {def.fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    params={step.params ?? {}}
                    deck={deck}
                    onChange={(v) => {
                      const params: Params = { ...step.params, [f.key]: f.kind === 'number' ? (v === '' ? null : Number(v)) : v }
                      // Szene gewechselt -> Quellenauswahl zuruecksetzen, sie gehoert zur alten Szene.
                      if (f.kind === 'scene') def.fields.filter((x) => x.kind === 'sceneItem').forEach((x) => (params[x.key] = ''))
                      update(index, { ...step, params })
                    }}
                  />
                ))}
              </div>
            )}
            {def?.description && <p className="mt-2 text-xs text-ink-faint">{def.description}</p>}
          </div>
        )
      })}

      <select
        className="field text-brand"
        value=""
        onChange={(e) => {
          if (!e.target.value) return
          onChange([...steps, { type: e.target.value, params: defaultParams(byType.get(e.target.value)) }])
        }}
        aria-label={addLabel}
      >
        <option value="">＋ {addLabel} …</option>
        {categories.map((c) => (
          <optgroup key={c} label={c}>
            {definitions.filter((d) => d.category === c).map((d) => (
              <option key={d.type} value={d.type}>
                {d.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

/** Validiert Pflichtfelder vor dem Speichern - liefert eine konkrete Meldung oder null. */
export function validateSteps(steps: ActionStep[], definitions: ActionDefinition[]): string | null {
  for (const [i, step] of steps.entries()) {
    const def = definitions.find((d) => d.type === step.type)
    if (!def) continue
    const missing = def.fields.find((f) => f.required && (step.params?.[f.key] == null || step.params[f.key] === ''))
    if (missing) return `Schritt ${i + 1} („${def.name}“): „${missing.label}“ fehlt noch.`
  }
  return null
}
