import { IconBroadcast, IconCheck, IconNetwork, IconRefresh, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import { AboutCard } from '../components/AboutCard'
import { AppShell } from '../components/AppShell'
import { toast } from '../components/Toasts'
import { useStore } from '../state/store'

interface ObsSettings {
  host: string
  port: number
  hasPassword: boolean
}

interface FoundObs {
  host: string
  port: number
  webSocketVersion: string | null
  isLocal: boolean
}

interface GeneralSettings {
  publicHost: string
  previewFps: number
  lanAddresses: string[]
}

function ObsCard() {
  const obs = useStore((s) => s.obs)
  const [form, setForm] = useState<ObsSettings | null>(null)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<FoundObs[]>([])

  const load = () =>
    api<ObsSettings>('/api/settings/obs')
      .then(setForm)
      .catch((e) => toast(`OBS-Einstellungen konnten nicht geladen werden: ${errorMessage(e)}`, 'error'))

  useEffect(() => {
    void load()
  }, [])

  const discover = async () => {
    setSearching(true)
    setFound([])
    try {
      const res = await api<{ applied: boolean; message: string; found: FoundObs[] }>('/api/settings/obs/discover', { method: 'POST' })
      toast(res.message, res.applied || res.found.length > 0 ? 'success' : 'error')
      setFound(res.found)
      if (res.applied) await load()
    } catch (e) {
      toast(`Automatische Suche fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setSearching(false)
    }
  }

  const save = async (clearPassword = false) => {
    if (!form) return
    setSaving(true)
    try {
      await api('/api/settings/obs', { method: 'PUT', body: { host: form.host, port: form.port, password: password || null, clearPassword } })
      setPassword('')
      // Der Dienst normalisiert Eingaben wie "ws://host:4455" - den gespeicherten Stand anzeigen.
      await load()
      toast('Gespeichert – verbinde neu mit OBS …', 'success')
    } catch (e) {
      toast(`OBS-Einstellungen konnten nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const status = obs?.status ?? 'disconnected'

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconBroadcast size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">OBS-Verbindung</h2>
          <p className="text-xs text-ink-faint">obs-websocket ist seit OBS 28 eingebaut – kein Plugin nötig.</p>
        </div>
        <span
          className={`ml-auto flex items-center gap-2 rounded-badge px-2 py-1 text-xs font-semibold ${
            status === 'connected' ? 'bg-[color-mix(in_oklab,var(--c-toggle-on)_15%,transparent)] text-ink' : 'bg-danger-soft text-danger'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-[var(--c-toggle-on)]' : status === 'connecting' ? 'live-dot bg-amber-500' : 'bg-live'}`} />
          {status === 'connected' ? `Verbunden · OBS ${obs?.obsVersion ?? ''}` : status === 'connecting' ? 'Verbinde …' : 'Getrennt'}
        </span>
      </div>

      {status !== 'connected' && obs?.error && <p className="mb-4 rounded-ctl bg-danger-soft px-3 py-2 text-sm text-danger">{obs.error}</p>}

      {status !== 'connected' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-brand/30 bg-brand-soft px-4 py-3">
          <IconSparkles size={20} className="shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-sm text-ink">
            <strong>Automatisch einrichten:</strong> übernimmt Port und Passwort direkt aus OBS auf diesem PC – oder sucht OBS im Netzwerk.
          </p>
          <button className="btn btn-create" onClick={() => void discover()} disabled={searching}>
            <IconSearch size={16} /> {searching ? 'Suche läuft …' : 'Automatisch finden'}
          </button>
        </div>
      )}

      {found.length > 0 && (
        <div className="mb-5 space-y-2">
          <span className="label">Gefunden – zum Übernehmen anklicken</span>
          {found.map((f) => (
            <button
              key={`${f.host}:${f.port}`}
              className="chip-select h-auto w-full justify-between px-3 py-2"
              aria-pressed={form?.host === f.host && form?.port === f.port}
              onClick={() => form && setForm({ ...form, host: f.host, port: f.port })}
            >
              <span className="font-mono">
                {f.host}:{f.port}
              </span>
              <span className="text-xs font-medium">{f.isLocal ? 'dieser PC' : 'im Netzwerk'} · obs-websocket {f.webSocketVersion ?? '?'}</span>
            </button>
          ))}
          <p className="text-xs text-ink-faint">Danach unten das WebSocket-Passwort dieses OBS eintragen und speichern.</p>
        </div>
      )}

      <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>In OBS: <strong className="text-ink">Werkzeuge → WebSocket-Server-Einstellungen</strong></li>
        <li>„WebSocket-Server aktivieren“ anhaken</li>
        <li>Über „Verbindungsinformationen anzeigen“ Port und Passwort hier eintragen</li>
      </ol>

      {form && (
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label className="label" htmlFor="obs-host">Rechner (IP oder Name)</label>
            <input id="obs-host" className="field" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="127.0.0.1" />
          </div>
          <div>
            <label className="label" htmlFor="obs-port">Port</label>
            <input id="obs-port" className="field" type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="obs-pw">Passwort</label>
            <input
              id="obs-pw"
              className="field"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={form.hasPassword ? '•••••••• (gespeichert – leer lassen, um es zu behalten)' : 'Kein Passwort gespeichert'}
            />
            <p className="mt-1.5 text-xs text-ink-faint">Wird verschlüsselt gespeichert und nie wieder angezeigt.</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {form.hasPassword && (
              <button className="btn btn-danger-ghost" onClick={() => void save(true)} disabled={saving}>
                Passwort entfernen
              </button>
            )}
            <button className="btn btn-ghost ml-auto" onClick={() => void api('/api/settings/obs/reconnect', { method: 'POST' }).catch((e) => toast(errorMessage(e), 'error'))}>
              <IconRefresh size={16} /> Neu verbinden
            </button>
            <button className="btn btn-confirm" onClick={() => void save()} disabled={saving}>
              <IconCheck size={16} /> Speichern & verbinden
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function GeneralCard() {
  const [form, setForm] = useState<GeneralSettings | null>(null)

  useEffect(() => {
    api<GeneralSettings>('/api/settings/general')
      .then(setForm)
      .catch((e) => toast(`Einstellungen konnten nicht geladen werden: ${errorMessage(e)}`, 'error'))
  }, [])

  const save = async () => {
    if (!form) return
    try {
      await api('/api/settings/general', { method: 'PUT', body: { publicHost: form.publicHost, previewFps: form.previewFps } })
      toast('Gespeichert.', 'success')
    } catch (e) {
      toast(`Einstellungen konnten nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconNetwork size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Netzwerk & Vorschau</h2>
          <p className="text-xs text-ink-faint">Adresse für QR-Codes und Bildrate der Live-Vorschau.</p>
        </div>
      </div>
      {form && (
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="public-host">Adresse für Handys (leer = automatisch)</label>
            <input
              id="public-host"
              className="field"
              list="lan-addresses"
              value={form.publicHost}
              onChange={(e) => setForm({ ...form, publicHost: e.target.value })}
              placeholder={form.lanAddresses[0] ?? 'z.B. 192.168.178.20'}
            />
            <datalist id="lan-addresses">
              {form.lanAddresses.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-ink-faint">
              Erkannt: {form.lanAddresses.length ? form.lanAddresses.join(', ') : 'keine Netzwerkadresse'}. Nur nötig, wenn der PC mehrere Netzwerke hat.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="preview-fps">Vorschau: {form.previewFps} Bilder/Sekunde</label>
            <input
              id="preview-fps"
              type="range"
              min={1}
              max={15}
              className="w-full accent-[var(--c-brand-solid)]"
              value={form.previewFps}
              onChange={(e) => setForm({ ...form, previewFps: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-ink-faint">Höher = flüssiger, aber mehr Last für OBS. Die Vorschau läuft nur, solange ein Gerät sie geöffnet hat.</p>
          </div>
          <div className="flex justify-end">
            <button className="btn btn-confirm" onClick={() => void save()}>
              <IconCheck size={16} /> Speichern
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function SettingsPage() {
  return (
    <AppShell title="Einstellungen">
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <ObsCard />
        <GeneralCard />
        <AboutCard />
      </div>
    </AppShell>
  )
}
