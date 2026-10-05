import { useEffect, useState } from 'react'
import type { AudioDevice, ObsSnapshot, SideDisplay } from '../api/types'
import { Modal } from '../components/Modal'

interface Props {
  open: boolean
  /** null = neues Display. */
  initial: SideDisplay | null
  side: 'left' | 'right'
  obs: ObsSnapshot | null
  audioDevices: AudioDevice[]
  onClose: () => void
  onSave: (display: { source: string; label: string }) => void
  onRemove?: () => void
}

/** Quelle (System oder OBS-Audioquelle) und optionalen Anzeigenamen eines seitlichen OLED-Displays waehlen. */
export function SideDisplayModal({ open, initial, side, obs, audioDevices, onClose, onSave, onRemove }: Props) {
  const [source, setSource] = useState('system')
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!open) return
    setSource(initial?.source ?? 'system')
    setLabel(initial?.label ?? '')
  }, [open, initial])

  const inputs = obs?.status === 'connected' ? obs.audioInputs.map((a) => `obs:${a.name}`) : []
  // Bereits gesetzte Quelle auch dann anbieten, wenn OBS gerade offline ist oder sie nicht mehr existiert.
  const known = new Set(['system', ...inputs, ...audioDevices.map((d) => `win:${d.id}`)])
  const missing = initial && !known.has(initial.source) ? initial.source : null
  const deviceLabel = (d: AudioDevice) => `${d.name}${d.isDefault ? ' · Standard' : ''}`

  return (
    <Modal open={open} title={initial ? 'Display bearbeiten' : `Display ${side === 'left' ? 'links' : 'rechts'} hinzufügen`} onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">Das Display zeigt Name, Live-Pegel und Stumm-Zustand der Audioquelle (Eingang oder Ausgang). Ein Klick darauf schaltet sie stumm.</p>
        {obs?.status !== 'connected' && <p className="text-xs text-ink-faint">OBS ist nicht verbunden – OBS-Quellen erscheinen hier, sobald die Verbindung steht.</p>}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="side-source" className="text-xs font-bold text-ink">Audioquelle</label>
          <select id="side-source" className="field h-10 w-full" value={source} onChange={(e) => setSource(e.target.value)}>
            {missing && <option value={missing}>{missing.replace(/^(obs|win):/, '')} (nicht verfügbar)</option>}
            <option value="system">System (Standard-Ausgabe)</option>
            {audioDevices.some((d) => d.kind === 'input') && (
              <optgroup label="Windows · Eingang / Mikrofone">
                {audioDevices.filter((d) => d.kind === 'input').map((d) => (
                  <option key={d.id} value={`win:${d.id}`}>{deviceLabel(d)}</option>
                ))}
              </optgroup>
            )}
            {audioDevices.some((d) => d.kind === 'output') && (
              <optgroup label="Windows · Ausgabe">
                {audioDevices.filter((d) => d.kind === 'output').map((d) => (
                  <option key={d.id} value={`win:${d.id}`}>{deviceLabel(d)}</option>
                ))}
              </optgroup>
            )}
            {inputs.length > 0 && (
              <optgroup label="OBS">
                {inputs.map((o) => (
                  <option key={o} value={o}>{o.replace(/^obs:/, '')}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="side-label" className="text-xs font-bold text-ink">Anzeigename (optional)</label>
          <input id="side-label" className="field h-10 w-full" maxLength={40} placeholder="z. B. Mikro" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          {initial && onRemove && (
            <button type="button" className="btn btn-danger" onClick={onRemove}>Entfernen</button>
          )}
          <button type="button" className="btn btn-ghost ml-auto" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-confirm" onClick={() => onSave({ source, label: label.trim() })}>Speichern</button>
        </div>
      </div>
    </Modal>
  )
}
