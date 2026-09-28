import {
  IconAlertTriangle,
  IconCode,
  IconCopy,
  IconDownload,
  IconFileZip,
  IconKey,
  IconPuzzle,
  IconRefresh,
  IconRotateClockwise,
  IconSearch,
  IconTerminal2,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { api, ApiError, errorMessage, getToken } from '../api/client'
import { AppShell } from '../components/AppShell'
import { KeyIcon } from '../components/KeyIcon'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toasts'
import { branding } from '../config/branding'

interface InstalledPlugin {
  id: string
  name: string
  version: string
  author: string | null
  description: string | null
  icon: string
  enabled: boolean
  source: 'file' | 'catalog'
  installedAt: string
  state: 'stopped' | 'starting' | 'running' | 'crashed' | 'error'
  message: string | null
  restarts: number
  connected: boolean
  actionCount: number
}

interface CatalogPlugin {
  id: string
  name: string
  version: string
  author: string | null
  description: string | null
  icon: string
  homepage: string | null
  installedVersion: string | null
}

type Tab = 'installed' | 'catalog'

/** Datei-Upload (multipart) - der JSON-Client in api/client.ts kann das nicht. */
async function uploadPlugin(file: File): Promise<{ name: string; version: string }> {
  const form = new FormData()
  form.append('file', file)
  let res: Response
  try {
    res = await fetch('/api/plugins/install', { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` }, body: form })
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Dienst.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Installation fehlgeschlagen (HTTP ${res.status}).`)
  return body
}

function StatusBadge({ p }: { p: InstalledPlugin }) {
  const map = {
    running: { text: p.connected ? `läuft · ${p.actionCount} ${p.actionCount === 1 ? 'Aktion' : 'Aktionen'}` : 'läuft · verbindet …', dot: 'bg-[var(--c-toggle-on)]' },
    starting: { text: 'startet …', dot: 'bg-amber-500 live-dot' },
    crashed: { text: 'abgestürzt', dot: 'bg-live' },
    error: { text: 'Fehler', dot: 'bg-live' },
    stopped: { text: p.enabled ? 'gestoppt' : 'ausgeschaltet', dot: 'bg-ink-faint' },
  } as const
  const s = map[p.state]
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.text}
    </span>
  )
}

function LogModal({ plugin, onClose }: { plugin: InstalledPlugin | null; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!plugin) return
    let alive = true
    const load = () =>
      api<{ lines: string[] }>(`/api/plugins/${encodeURIComponent(plugin.id)}/log`)
        .then((r) => alive && setLines(r.lines))
        .catch(() => {})
    void load()
    const t = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [plugin])
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [lines])

  return (
    <Modal open={!!plugin} title={`Protokoll · ${plugin?.name ?? ''}`} onClose={onClose} width="max-w-3xl">
      <div className="max-h-[60vh] overflow-auto rounded-ctl bg-canvas p-3 font-mono text-[12px] leading-relaxed text-ink-muted">
        {lines.length === 0 ? <p>Noch keine Ausgaben.</p> : lines.map((l, i) => <div key={i} className={l.includes('[System]') ? 'text-danger' : ''}>{l}</div>)}
        <div ref={bottom} />
      </div>
    </Modal>
  )
}

function InstalledTab({ plugins, onInstallClick }: { plugins: InstalledPlugin[] | null; onInstallClick: () => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [logFor, setLogFor] = useState<InstalledPlugin | null>(null)

  const act = async (p: InstalledPlugin, action: 'toggle' | 'restart' | 'uninstall') => {
    try {
      if (action === 'toggle') await api(`/api/plugins/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { enabled: !p.enabled } })
      if (action === 'restart') await api(`/api/plugins/${encodeURIComponent(p.id)}/restart`, { method: 'POST' })
      if (action === 'uninstall') {
        if (confirmId !== p.id) return setConfirmId(p.id)
        await api(`/api/plugins/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
        toast(`„${p.name}“ deinstalliert.`, 'success')
      }
    } catch (e) {
      toast(`„${p.name}“: ${errorMessage(e)}`, 'error')
    }
  }

  if (plugins?.length === 0)
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <IconPuzzle size={40} stroke={1.3} className="text-brand" />
        <p className="text-lg font-bold text-ink">Noch keine Plugins installiert</p>
        <p className="max-w-md text-sm text-ink-muted">
          Plugins machen weitere Programme steuerbar – etwa Photoshop, Lightroom, DaVinci Resolve oder dein Smart Home. Installiere sie aus dem Katalog oder als ZIP-Datei von der {branding.productName}-Website.
        </p>
        <button className="btn btn-create mt-1" onClick={onInstallClick}>
          <IconUpload size={16} /> Aus Datei installieren
        </button>
      </div>
    )

  return (
    <div className="space-y-3">
      {plugins?.map((p, i) => (
        <motion.div key={p.id} className="card p-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
              <KeyIcon name={p.icon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold text-ink">{p.name}</span>
                <span className="text-xs font-medium text-ink-faint">v{p.version}</span>
                <span className="rounded-badge bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">{p.source === 'catalog' ? 'Katalog' : 'Datei'}</span>
                <StatusBadge p={p} />
              </div>
              <p className="mt-0.5 text-sm text-ink-muted">{p.description ?? p.id}</p>
              {p.author && <p className="text-xs text-ink-faint">von {p.author}</p>}
              {p.message && (p.state === 'crashed' || p.state === 'error') && (
                <p className="mt-2 flex gap-1.5 rounded-ctl bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
                  <IconAlertTriangle size={14} className="mt-px shrink-0" /> {p.message}
                </p>
              )}
            </div>
            <button className="switch mt-1 shrink-0" role="switch" aria-checked={p.enabled} aria-label={p.enabled ? 'Ausschalten' : 'Einschalten'} onClick={() => void act(p, 'toggle')} />
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
            <button className="btn btn-ghost btn-sm" onClick={() => setLogFor(p)}>
              <IconTerminal2 size={15} /> Protokoll
            </button>
            {p.enabled && (
              <button className="btn btn-ghost btn-sm" onClick={() => void act(p, 'restart')}>
                <IconRotateClockwise size={15} /> Neu starten
              </button>
            )}
            <button
              className={confirmId === p.id ? 'btn btn-danger btn-sm' : 'btn btn-danger-ghost btn-sm'}
              onClick={() => void act(p, 'uninstall')}
              onBlur={() => setConfirmId(null)}
            >
              <IconTrash size={15} /> {confirmId === p.id ? 'Wirklich deinstallieren?' : 'Deinstallieren'}
            </button>
          </div>
        </motion.div>
      ))}
      <LogModal plugin={logFor} onClose={() => setLogFor(null)} />
    </div>
  )
}

function CatalogTab() {
  const [data, setData] = useState<{ available: boolean; plugins: CatalogPlugin[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    setError(null)
    try {
      setData(await api(`/api/plugins/catalog${refresh ? '?refresh=true' : ''}`))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener('deck:plugins', onChange)
    return () => window.removeEventListener('deck:plugins', onChange)
  }, [load])

  const install = async (p: CatalogPlugin) => {
    setBusy(p.id)
    try {
      await api(`/api/plugins/catalog/${encodeURIComponent(p.id)}/install`, { method: 'POST' })
      toast(`„${p.name}“ ${p.installedVersion ? 'aktualisiert' : 'installiert'}.`, 'success')
    } catch (e) {
      toast(`„${p.name}“ konnte nicht installiert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (error)
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <IconAlertTriangle size={32} className="text-danger" />
        <p className="max-w-md text-sm text-ink">{error}</p>
        <button className="btn btn-ghost" onClick={() => void load(true)}>
          <IconRefresh size={16} /> Erneut versuchen
        </button>
      </div>
    )

  if (data && !data.available)
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <IconDownload size={40} stroke={1.3} className="text-brand" />
        <p className="text-lg font-bold text-ink">Katalog kommt bald</p>
        <p className="max-w-md text-sm text-ink-muted">
          Hier kannst du Plugins direkt suchen und mit einem Klick installieren, sobald die offizielle {branding.productName}-Website online ist. Bis dahin: Plugin als ZIP herunterladen und unter „Aus Datei installieren“ hinzufügen.
        </p>
      </div>
    )

  const q = query.trim().toLowerCase()
  const list = (data?.plugins ?? []).filter((p) => !q || `${p.name} ${p.description ?? ''} ${p.author ?? ''}`.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="field pl-9" placeholder="Plugins suchen, z.B. Photoshop, Twitch, Philips Hue …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-icon" onClick={() => void load(true)} title="Katalog neu laden">
          <IconRefresh size={16} />
        </button>
      </div>
      {data && list.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">Kein Plugin gefunden.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((p) => {
          const update = p.installedVersion && p.installedVersion !== p.version
          return (
            <div key={p.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
                  <KeyIcon name={p.icon} size={20} />
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-ink">
                    {p.name} <span className="text-xs font-medium text-ink-faint">v{p.version}</span>
                  </div>
                  {p.author && <div className="text-xs text-ink-faint">von {p.author}</div>}
                </div>
              </div>
              <p className="mt-2 flex-1 text-sm text-ink-muted">{p.description}</p>
              <div className="mt-3 flex justify-end">
                {p.installedVersion && !update ? (
                  <span className="text-xs font-semibold text-ink-faint">Installiert</span>
                ) : (
                  <button className="btn btn-create btn-sm" disabled={busy === p.id} onClick={() => void install(p)}>
                    <IconDownload size={15} /> {busy === p.id ? 'Installiert …' : update ? `Aktualisieren (v${p.installedVersion} → v${p.version})` : 'Installieren'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeveloperSection() {
  const [info, setInfo] = useState<{ connectUrl: string; key: string } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (open && !info)
      api<{ connectUrl: string; key: string }>('/api/settings/plugins')
        .then(setInfo)
        .catch((e) => toast(`Verbindungsdaten konnten nicht geladen werden: ${errorMessage(e)}`, 'error'))
  }, [open, info])

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} kopiert.`, 'success')
    } catch {
      toast(`${what} konnte nicht kopiert werden – bitte manuell markieren.`, 'error')
    }
  }

  return (
    <section className="card p-4">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IconCode size={18} className="text-brand" />
        <span className="font-bold text-ink">Für Plugin-Entwickler</span>
        <span className="ml-auto text-xs text-ink-faint">{open ? 'ausblenden' : 'Verbindungsdaten anzeigen'}</span>
      </button>
      {open && info && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink-muted">
            Zum Entwickeln kannst du ein Plugin auch selbst starten und mit diesen Daten verbinden. Protokoll und Paketformat: <span className="font-mono">docs/PLUGIN_PROTOCOL.md</span>.
          </p>
          {[
            ['Adresse', info.connectUrl, 'DECK_URL'],
            ['Schlüssel', info.key, 'DECK_KEY'],
          ].map(([label, value, env]) => (
            <div key={env}>
              <span className="label">
                {label} <span className="font-mono text-ink-faint">({env})</span>
              </span>
              <div className="flex gap-2">
                <input readOnly className="field font-mono" value={value} />
                <button className="btn btn-ghost btn-icon" onClick={() => void copy(value, label)} aria-label={`${label} kopieren`}>
                  {label === 'Schlüssel' ? <IconKey size={16} /> : <IconCopy size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function PluginsPage() {
  const [tab, setTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setPlugins(await api<InstalledPlugin[]>('/api/plugins'))
    } catch (e) {
      toast(`Plugins konnten nicht geladen werden: ${errorMessage(e)}`, 'error')
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener('deck:plugins', onChange)
    return () => window.removeEventListener('deck:plugins', onChange)
  }, [load])

  const choose = (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) return toast(`„${file.name}“ ist keine ZIP-Datei. Plugins werden als .zip installiert.`, 'error')
    setPending(file)
  }

  const confirmInstall = async () => {
    if (!pending) return
    setUploading(true)
    try {
      const res = await uploadPlugin(pending)
      toast(`„${res.name}“ v${res.version} installiert.`, 'success')
      setPending(null)
      setTab('installed')
      await load()
    } catch (e) {
      toast(`Installation fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    choose(e.dataTransfer.files[0])
  }

  return (
    <AppShell
      title="Plugins"
      actions={
        <button className="btn btn-create" onClick={() => fileInput.current?.click()}>
          <IconUpload size={16} /> <span className="hidden sm:inline">Aus Datei installieren</span>
        </button>
      }
    >
      <div
        className="relative mx-auto min-h-full max-w-4xl space-y-5 p-4 lg:p-8"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
        onDrop={onDrop}
      >
        <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => {
            choose(e.target.files?.[0])
            e.target.value = '' // dieselbe Datei erneut waehlbar
          }}
        />

        <div className="flex gap-2">
          <button className="chip-select h-9 px-4 text-sm" aria-pressed={tab === 'installed'} onClick={() => setTab('installed')}>
            Installiert {plugins ? `(${plugins.length})` : ''}
          </button>
          <button className="chip-select h-9 px-4 text-sm" aria-pressed={tab === 'catalog'} onClick={() => setTab('catalog')}>
            Katalog
          </button>
        </div>

        {tab === 'installed' ? <InstalledTab plugins={plugins} onInstallClick={() => fileInput.current?.click()} /> : <CatalogTab />}

        <DeveloperSection />

        <AnimatePresence>
          {dragOver && (
            <motion.div
              className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-brand bg-brand-soft/90 text-brand"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <IconFileZip size={40} />
              <p className="font-bold">Plugin-ZIP hier ablegen</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal
        open={!!pending}
        title="Plugin installieren?"
        onClose={() => !uploading && setPending(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPending(null)} disabled={uploading}>
              Abbrechen
            </button>
            <button className="btn btn-create" onClick={() => void confirmInstall()} disabled={uploading}>
              <IconUpload size={16} /> {uploading ? 'Installiert …' : 'Installieren'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-ctl bg-surface-2 px-3 py-2.5">
            <IconFileZip size={22} className="shrink-0 text-brand" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{pending?.name}</div>
              <div className="text-xs text-ink-faint">{pending ? (pending.size < 1024 * 1024 ? `${Math.max(1, Math.round(pending.size / 1024))} KB` : `${(pending.size / 1024 / 1024).toFixed(1)} MB`) : ''}</div>
            </div>
          </div>
          <p className="flex gap-2 rounded-ctl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-ink">
            <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              Plugins sind Programme und laufen mit den Rechten deines Benutzerkontos. Installiere nur Plugins aus Quellen, denen du vertraust – am sichersten von der offiziellen {branding.productName}-Website.
            </span>
          </p>
          <p className="text-xs text-ink-faint">Ist das Plugin schon installiert, wird es durch diese Version ersetzt.</p>
        </div>
      </Modal>
    </AppShell>
  )
}
