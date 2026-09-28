import { IconCopy, IconKey, IconPuzzle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { PluginModel } from '../api/types'
import { AppShell } from '../components/AppShell'
import { KeyIcon } from '../components/KeyIcon'
import { toast } from '../components/Toasts'
import { useStore } from '../state/store'

interface PluginInfo {
  plugins: PluginModel[]
  connectUrl: string
  key: string
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} kopiert.`, 'success')
  } catch {
    toast(`${what} konnte nicht in die Zwischenablage kopiert werden – bitte manuell markieren.`, 'error')
  }
}

export function PluginsPage() {
  const catalog = useStore((s) => s.catalog)
  const [info, setInfo] = useState<PluginInfo | null>(null)
  const [showKey, setShowKey] = useState(false)

  const load = useCallback(async () => {
    try {
      setInfo(await api<PluginInfo>('/api/settings/plugins'))
    } catch (e) {
      toast(`Plugins konnten nicht geladen werden: ${errorMessage(e)}`, 'error')
    }
  }, [])

  // Katalog aendert sich, sobald sich ein Plugin an- oder abmeldet.
  useEffect(() => {
    void load()
  }, [load, catalog])

  const rotate = async () => {
    try {
      await api('/api/settings/plugins/rotate-key', { method: 'POST' })
      toast('Neuer Plugin-Schlüssel erzeugt. Laufende Plugins müssen mit dem neuen Schlüssel neu gestartet werden.', 'success')
      await load()
    } catch (e) {
      toast(`Schlüssel konnte nicht erneuert werden: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <AppShell title="Plugins">
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-faint">Verbunden</h2>
          {info?.plugins.length === 0 && (
            <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
              <IconPuzzle size={36} stroke={1.3} className="text-brand" />
              <p className="font-semibold text-ink">Gerade ist kein Plugin verbunden</p>
              <p className="max-w-md text-sm text-ink-muted">
                Plugins sind kleine, eigenständige Programme der Community, die weitere Anwendungen steuerbar machen – etwa Photoshop, Lightroom, DaVinci Resolve oder Smart-Home-Geräte.
              </p>
            </div>
          )}
          {info?.plugins.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
                  <KeyIcon name={p.icon} size={20} />
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-ink">
                    {p.name} <span className="text-xs font-medium text-ink-faint">v{p.version}</span>
                  </div>
                  <div className="text-xs text-ink-faint">
                    {p.id}
                    {p.author && ` · von ${p.author}`}
                  </div>
                </div>
                <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                  <span className="h-2 w-2 rounded-full bg-[var(--c-toggle-on)]" /> verbunden
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.actions.map((a) => (
                  <span key={a.type} className="flex items-center gap-1.5 rounded-badge bg-surface-2 px-2 py-1 text-xs text-ink-muted">
                    <KeyIcon name={a.icon} size={13} /> {a.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <IconKey size={18} className="text-brand" /> Plugin-Verbindung
          </h2>
          <p className="text-sm text-ink-muted">
            Plugins verbinden sich per WebSocket mit dieser Adresse und authentifizieren sich mit dem Schlüssel. Das Protokoll steht in <span className="font-mono">docs/PLUGIN_PROTOCOL.md</span>.
          </p>
          {info && (
            <div className="space-y-3">
              <div>
                <span className="label">Adresse</span>
                <div className="flex gap-2">
                  <input readOnly className="field font-mono" value={info.connectUrl} />
                  <button className="btn btn-ghost btn-icon" onClick={() => void copy(info.connectUrl, 'Adresse')} aria-label="Adresse kopieren">
                    <IconCopy size={16} />
                  </button>
                </div>
              </div>
              <div>
                <span className="label">Schlüssel</span>
                <div className="flex gap-2">
                  <input readOnly className="field font-mono" type={showKey ? 'text' : 'password'} value={info.key} onFocus={() => setShowKey(true)} />
                  <button className="btn btn-ghost btn-icon" onClick={() => void copy(info.key, 'Schlüssel')} aria-label="Schlüssel kopieren">
                    <IconCopy size={16} />
                  </button>
                  <button className="btn btn-danger-ghost" onClick={() => void rotate()}>
                    <IconRefresh size={16} /> Erneuern
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
