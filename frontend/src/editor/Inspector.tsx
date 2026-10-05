import { IconCheck, IconFolderOpen, IconPhoto, IconStack3, IconToggleRight, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ActionStep, ButtonModel, Catalog, DeckModel } from '../api/types'
import { DeckKey } from '../components/DeckKey'
import { HotkeyRecorder } from '../components/HotkeyRecorder'
import { IconPicker } from '../components/IconPicker'
import { KeyIcon } from '../components/KeyIcon'
import { toast } from '../components/Toasts'
import { KEY_COLORS } from '../lib/keyColors'
import { useStore } from '../state/store'
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
  const [pickOffIcon, setPickOffIcon] = useState(false)
  const appearance = useStore((s) => s.appearance)

  const isMultiSwitch = draft.actions.length === 1 && draft.actions[0].type === 'deck.multiSwitch'
  const [switchTab, setSwitchTab] = useState<'on' | 'off'>('on')
  const [previewState, setPreviewState] = useState(true)

  // Eine Taste ist im Multifunktions-Modus, wenn sie mehr als 1 Aktion hat,
  // oder als Multifunktion angelegt wurde (0 Aktionen), oder explizit umgewandelt wurde.
  const isMultiInitially = button.actions.length !== 1 || (button.label === 'Multi' && button.icon === 'tabler:stack-3')
  const [isMultiMode, setIsMultiMode] = useState(isMultiInitially)

  // Andere Taste gewaehlt oder von aussen (anderes Geraet) geaendert -> Entwurf neu laden.
  useEffect(() => {
    setDraft(button)
    setIsMultiMode(button.actions.length !== 1 || (button.label === 'Multi' && button.icon === 'tabler:stack-3'))
    setSwitchTab('on')
    setPreviewState(true)
  }, [button])

  const switchParams = (draft.actions[0]?.params ?? {}) as {
    onSteps?: ActionStep[]
    offSteps?: ActionStep[]
    labelOff?: string
    iconOff?: string
  }
  const onSteps: ActionStep[] = Array.isArray(switchParams.onSteps) ? switchParams.onSteps : []
  const offSteps: ActionStep[] = Array.isArray(switchParams.offSteps) ? switchParams.offSteps : []

  const setOnSteps = (steps: ActionStep[]) => {
    const updated = { ...switchParams, onSteps: steps }
    setDraft({ ...draft, actions: [{ type: 'deck.multiSwitch', params: updated }] })
  }

  const setOffSteps = (steps: ActionStep[]) => {
    const updated = { ...switchParams, offSteps: steps }
    setDraft({ ...draft, actions: [{ type: 'deck.multiSwitch', params: updated }] })
  }

  const setSwitchMeta = (patch: { labelOff?: string; iconOff?: string | null }) => {
    const updated = { ...switchParams, ...patch }
    setDraft({ ...draft, actions: [{ type: 'deck.multiSwitch', params: updated }] })
  }

  const convertToMultiSwitch = () => {
    const currentActions = [...draft.actions]
    const invertedActions: ActionStep[] = currentActions.map((s) => {
      if (s.type === 'obs.audio.mute' || s.type === 'obs.source.visibility' || s.type === 'system.mute') {
        const mode = s.params?.mode ?? 'toggle'
        const inverted = mode === 'off' ? 'on' : mode === 'on' ? 'off' : 'toggle'
        return { type: s.type, params: { ...s.params, mode: inverted } }
      }
      return { type: s.type, params: s.params ? { ...s.params } : {} }
    })
    setDraft({
      ...draft,
      label: draft.label || 'Schalter',
      icon: draft.icon || 'tabler:toggle-right',
      actions: [
        {
          type: 'deck.multiSwitch',
          params: {
            onSteps: currentActions,
            offSteps: invertedActions,
            labelOff: '',
            iconOff: '',
          },
        },
      ],
    })
    setSwitchTab('on')
    setPreviewState(true)
  }

  const convertToMultiAction = () => {
    setDraft({ ...draft, actions: onSteps })
    setIsMultiMode(true)
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(button)
  const folderTarget = button.actions.find((a) => a.type === 'deck.openPage')?.params?.page

  const save = async () => {
    if (isMultiSwitch) {
      const problemOn = validateSteps(onSteps, catalog?.actions ?? [])
      if (problemOn) return toast(`Zustand 1 (An): ${problemOn}`, 'error')
      const problemOff = validateSteps(offSteps, catalog?.actions ?? [])
      if (problemOff) return toast(`Zustand 2 (Aus): ${problemOff}`, 'error')
    } else {
      const problem = validateSteps(draft.actions, catalog?.actions ?? [])
      if (problem) return toast(problem, 'error')
    }
    setSaving(true)
    try {
      await api(`/api/buttons/${button.id}`, {
        method: 'PUT',
        body: {
          row: draft.row,
          column: draft.column,
          label: draft.label,
          icon: draft.icon,
          color: draft.color,
          actions: draft.actions,
          hotkey: draft.hotkey ?? '',
        },
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
        <div className="flex flex-col items-center gap-2.5 py-2">
          <div className="h-28 w-28">
            <DeckKey
              button={
                isMultiSwitch && !previewState
                  ? {
                      ...draft,
                      label: switchParams.labelOff || draft.label,
                      icon: switchParams.iconOff || draft.icon,
                    }
                  : draft
              }
              size={112}
              active={isMultiSwitch ? previewState : undefined}
              pressBehavior={appearance?.pressBehavior}
            />
          </div>
          {isMultiSwitch && (
            <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1 border border-line text-xs">
              <button
                type="button"
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                  previewState ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
                onClick={() => {
                  setPreviewState(true)
                  setSwitchTab('on')
                }}
                title="Vorschau im Zustand 1 (An)"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Zustand 1 (An)
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                  !previewState ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
                onClick={() => {
                  setPreviewState(false)
                  setSwitchTab('off')
                }}
                title="Vorschau im Zustand 2 (Aus)"
              >
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Zustand 2 (Aus)
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="key-label">
            {isMultiSwitch ? 'Beschriftung (Zustand 1 / Standard)' : 'Beschriftung'}
          </label>
          <input id="key-label" className="field" maxLength={60} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>

        <div>
          <span className="label">{isMultiSwitch ? 'Icon (Zustand 1 / Standard)' : 'Icon'}</span>
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

        {isMultiSwitch ? (
          <div className="space-y-4 rounded-xl border border-line-strong bg-surface-1/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <IconToggleRight size={18} />
                </span>
                <div>
                  <span className="text-sm font-semibold text-ink">Multi-Aktionsschalter</span>
                  <p className="text-[11px] text-ink-muted">Schaltet bei jedem Tastendruck zwischen Zustand 1 und Zustand 2 um</p>
                </div>
              </div>
              <button
                type="button"
                className="text-xs text-ink-muted hover:text-ink hover:underline"
                onClick={convertToMultiAction}
                title="In reguläre Multifunktion umwandeln"
              >
                In Multifunktion umwandeln
              </button>
            </div>

            {/* Zustand Tabs */}
            <div className="flex rounded-lg border border-line bg-surface-2 p-1 gap-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={switchTab === 'on'}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all ${
                  switchTab === 'on'
                    ? 'bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30'
                    : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                }`}
                onClick={() => {
                  setSwitchTab('on')
                  setPreviewState(true)
                }}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Zustand 1 (An)
                <span className="ml-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-muted">
                  {onSteps.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={switchTab === 'off'}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all ${
                  switchTab === 'off'
                    ? 'bg-rose-500/20 text-rose-300 shadow-sm border border-rose-500/30'
                    : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                }`}
                onClick={() => {
                  setSwitchTab('off')
                  setPreviewState(false)
                }}
              >
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Zustand 2 (Aus)
                <span className="ml-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-muted">
                  {offSteps.length}
                </span>
              </button>
            </div>

            {switchTab === 'on' ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-surface-2/60 p-2.5 text-xs text-ink-muted border border-line">
                  💡 <strong className="text-ink">Zustand 1 (Einschalten):</strong> Diese Aktionen laufen ab, wenn der Schalter eingeschaltet wird (z. B. Mikrofon unmuten, Audioquelle unmuten, Szene wechseln).
                </div>
                <StepEditor
                  steps={onSteps}
                  definitions={catalog?.actions ?? []}
                  deck={deck}
                  onChange={setOnSteps}
                  addLabel="Aktion für Zustand 1 hinzufügen"
                  allowTypeChange={true}
                  allowAdd={true}
                  allowDelete={true}
                  allowReorder={true}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-surface-2/60 p-2.5 text-xs text-ink-muted border border-line">
                  💡 <strong className="text-ink">Zustand 2 (Ausschalten):</strong> Diese Aktionen laufen ab, wenn der Schalter ausgeschaltet wird (z. B. Mikrofon stummschalten, Audioquelle stummschalten).
                </div>

                {/* Abweichendes Aussehen für Zustand 2 (Aus) */}
                <div className="rounded-lg border border-line bg-surface-2/40 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Aussehen im Zustand 2 (Aus)</span>
                    <span className="text-[10px] text-ink-muted">Optional abweichend</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-ink-muted block mb-1">Beschriftung (Aus)</label>
                      <input
                        className="field text-xs py-1.5"
                        placeholder={draft.label ? `${draft.label} (Aus)` : 'Wie Zustand 1'}
                        value={switchParams.labelOff ?? ''}
                        onChange={(e) => setSwitchMeta({ labelOff: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-muted block mb-1">Icon (Aus)</label>
                      <button
                        type="button"
                        className="btn btn-ghost w-full justify-start text-xs py-1.5"
                        onClick={() => setPickOffIcon(true)}
                      >
                        <KeyIcon name={switchParams.iconOff || draft.icon || 'tabler:circle'} size={14} />
                        <span className="truncate">{switchParams.iconOff || 'Wie Zustand 1'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <StepEditor
                  steps={offSteps}
                  definitions={catalog?.actions ?? []}
                  deck={deck}
                  onChange={setOffSteps}
                  addLabel="Aktion für Zustand 2 hinzufügen"
                  allowTypeChange={true}
                  allowAdd={true}
                  allowDelete={true}
                  allowReorder={true}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">
                {isMultiMode ? 'Aktionen – laufen nacheinander ab' : 'Aktion'}
              </span>
              <div className="flex items-center gap-2">
                {!isMultiMode ? (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                    onClick={() => setIsMultiMode(true)}
                    title="Weitere Aktionen nacheinander auf dieser Taste ausführen"
                  >
                    <IconStack3 size={14} />
                    In Multifunktion umwandeln
                  </button>
                ) : draft.actions.length === 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-ink-muted hover:text-ink hover:underline"
                    onClick={() => setIsMultiMode(false)}
                    title="Als feste Einzeltaste fixieren"
                  >
                    Als Einzeltaste fixieren
                  </button>
                ) : null}
                <span className="text-ink-faint">·</span>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:underline"
                  onClick={convertToMultiSwitch}
                  title="In Schalter mit zwei Zuständen (An/Aus) umwandeln"
                >
                  <IconToggleRight size={14} />
                  In Multi-Schalter umwandeln
                </button>
              </div>
            </div>
            <StepEditor
              steps={draft.actions}
              definitions={catalog?.actions ?? []}
              deck={deck}
              onChange={(actions) => setDraft({ ...draft, actions })}
              allowTypeChange={isMultiMode}
              allowAdd={isMultiMode}
              allowDelete={isMultiMode}
              allowReorder={isMultiMode}
            />
          </div>
        )}

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

      <IconPicker
        open={pickOffIcon}
        value={switchParams.iconOff || draft.icon}
        onClose={() => setPickOffIcon(false)}
        onPick={(icon) => {
          setSwitchMeta({ iconOff: icon })
          setPickOffIcon(false)
        }}
      />
    </div>
  )
}
