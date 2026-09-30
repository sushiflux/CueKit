import { IconCrown, IconDeviceMobile, IconPencil, IconQrcode, IconRefresh, IconTrash } from '@tabler/icons-react'
import { motion } from 'motion/react'
import QRCode from 'qrcode'
import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { DeviceModel, Me } from '../api/types'
import { setState } from '../state/store'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toasts'

interface Pairing {
  code: string
  expiresAt: string
  url: string
  baseUrl: string
  addresses: string[]
}

function PairingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [left, setLeft] = useState(0)

  const create = useCallback(async () => {
    try {
      const p = await api<Pairing>('/api/devices/pairing', { method: 'POST' })
      setPairing(p)
      setQr(await QRCode.toDataURL(p.url, { margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#10131a', light: '#ffffff' } }))
    } catch (e) {
      toast(`Kopplungscode konnte nicht erzeugt werden: ${errorMessage(e)}`, 'error')
    }
  }, [])

  useEffect(() => {
    if (open) void create()
    else {
      setPairing(null)
      setQr(null)
    }
  }, [open, create])

  useEffect(() => {
    if (!pairing) return
    const tick = () => setLeft(Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [pairing])

  const expired = pairing != null && left === 0

  return (
    <Modal open={open} title="Neues Gerät koppeln" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-ink-muted">Scanne den Code in der CueKit-App (oder mit der Handy-Kamera). Das Gerät muss im selben WLAN/Netzwerk sein wie dieser PC.</p>
        <div className="relative rounded-card bg-white p-3 shadow-lg">
          {qr ? <img src={qr} alt="QR-Code zum Koppeln" className={`h-60 w-60 transition ${expired ? 'opacity-15 blur-[2px]' : ''}`} /> : <div className="h-60 w-60" />}
          {expired && (
            <button className="btn btn-create absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" onClick={() => void create()}>
              <IconRefresh size={16} /> Neuen Code
            </button>
          )}
        </div>
        {pairing && (
          <>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Oder manuell</div>
              <div className="mt-1 text-sm text-ink-muted">
                In der App „Code eintippen“ bzw. im Browser <span className="font-mono text-ink">{pairing.baseUrl.replace(/^https?:\/\//, '')}</span> angeben
                und diesen Code eingeben:
              </div>
              <div className="mt-2 font-mono text-3xl font-bold tracking-[0.25em] text-ink">
                {pairing.code.slice(0, 4)}-{pairing.code.slice(4)}
              </div>
            </div>
            <p className={`tabular text-xs ${left < 30 ? 'text-danger' : 'text-ink-faint'}`}>
              {expired ? 'Abgelaufen' : `Gültig noch ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · nur einmal verwendbar`}
            </p>
            <p className="text-xs text-ink-faint">Verbindet das Handy nicht? Stimmt die Adresse? Sie lässt sich unter Einstellungen → Netzwerk ändern.</p>
            {pairing.addresses.length > 1 && (
              <p className="text-xs text-ink-faint">
                Mehrere Netzwerke erkannt ({pairing.addresses.join(', ')}). Falls das Handy nicht verbindet: unter Einstellungen die richtige Adresse festlegen.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/** Geraetename mit Bleistift zum Umbenennen (Enter speichert, Esc bricht ab). */
function DeviceName({ device, onRenamed }: { device: DeviceModel; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.name)
  useEffect(() => setName(device.name), [device.name])

  const save = async () => {
    const trimmed = name.trim()
    setEditing(false)
    if (!trimmed || trimmed === device.name) return setName(device.name)
    try {
      await api(`/api/devices/${device.id}`, { method: 'PATCH', body: { name: trimmed } })
      // Eigener Name steht auch unten in der Seitenleiste -> dort ebenfalls aktualisieren.
      if (device.isCurrent) setState({ me: await api<Me>('/api/auth/me') })
      toast('Gerät umbenannt.', 'success')
      onRenamed()
    } catch (e) {
      setName(device.name)
      toast(`„${device.name}“ konnte nicht umbenannt werden: ${errorMessage(e)}`, 'error')
    }
  }

  if (editing)
    return (
      <input
        autoFocus
        className="field h-8 max-w-xs font-bold"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setName(device.name)
            setEditing(false)
          }
        }}
        aria-label="Gerätename"
      />
    )

  return (
    <button className="group flex min-w-0 items-center gap-1.5 text-left" onClick={() => setEditing(true)} title="Umbenennen">
      <span className="truncate font-bold text-ink">{device.name}</span>
      <IconPencil size={14} className="shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
    </button>
  )
}

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceModel[] | null>(null)
  const [pairOpen, setPairOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setDevices(await api<DeviceModel[]>('/api/devices'))
    } catch (e) {
      toast(`Geräte konnten nicht geladen werden: ${errorMessage(e)}`, 'error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Nach dem Schliessen des QR-Dialogs neu laden - vielleicht ist gerade ein Geraet dazugekommen.
  useEffect(() => {
    if (!pairOpen) void load()
  }, [pairOpen, load])

  const setRole = async (d: DeviceModel) => {
    try {
      await api(`/api/devices/${d.id}`, { method: 'PATCH', body: { role: d.role === 'owner' ? 'controller' : 'owner' } })
      await load()
    } catch (e) {
      toast(`Rolle von „${d.name}“ konnte nicht geändert werden: ${errorMessage(e)}`, 'error')
    }
  }

  const remove = async (d: DeviceModel) => {
    if (confirmId !== d.id) return setConfirmId(d.id)
    try {
      await api(`/api/devices/${d.id}`, { method: 'DELETE' })
      setConfirmId(null)
      await load()
    } catch (e) {
      toast(`„${d.name}“ konnte nicht entfernt werden: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <AppShell title="Geräte">
      <div className="mx-auto max-w-3xl space-y-3 p-4 lg:p-8">
        <p className="text-sm text-ink-muted">
          <strong className="text-ink">Besitzer-Geräte</strong> dürfen Decks, Automationen und Einstellungen bearbeiten.{' '}
          <strong className="text-ink">Steuergeräte</strong> dürfen nur Tasten drücken und die Vorschau sehen.
        </p>
        <motion.div className="card flex flex-wrap items-center gap-4 border-brand/40 bg-brand-soft/40 p-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
            <IconQrcode size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-ink">Neues Gerät koppeln</div>
            <div className="text-xs text-ink-muted">Handy oder Tablet verbinden: QR-Code anzeigen und mit der CueKit-App scannen – im selben WLAN, dann geht alles automatisch.</div>
          </div>
          <button className="btn btn-create" onClick={() => setPairOpen(true)}>
            <IconQrcode size={16} /> QR-Code anzeigen
          </button>
        </motion.div>
        {devices?.map((d, i) => (
          <motion.div key={d.id} className="card flex items-center gap-4 p-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-card ${d.role === 'owner' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink-muted'}`}>
              {d.role === 'owner' ? <IconCrown size={20} /> : <IconDeviceMobile size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DeviceName device={d} onRenamed={() => void load()} />
                {d.isCurrent && <span className="shrink-0 rounded-badge bg-select-soft px-1.5 py-0.5 text-[11px] font-semibold text-select">Dieses Gerät</span>}
              </div>
              <div className="text-xs text-ink-faint">
                {d.role === 'owner' ? 'Besitzer' : 'Steuergerät'} · gekoppelt {new Date(d.createdAt).toLocaleDateString('de-DE')}
                {d.lastSeenAt && ` · zuletzt aktiv ${new Date(d.lastSeenAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => void setRole(d)}>
              {d.role === 'owner' ? 'Zum Steuergerät' : 'Zum Besitzer'}
            </button>
            <button
              className={confirmId === d.id ? 'btn btn-danger btn-sm' : 'btn btn-danger-ghost btn-sm btn-icon'}
              onClick={() => void remove(d)}
              onBlur={() => setConfirmId(null)}
              title="Gerät entfernen"
            >
              <IconTrash size={15} /> {confirmId === d.id && 'Entfernen?'}
            </button>
          </motion.div>
        ))}
      </div>
      <PairingModal open={pairOpen} onClose={() => setPairOpen(false)} />
    </AppShell>
  )
}
