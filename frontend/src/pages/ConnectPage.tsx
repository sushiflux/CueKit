import { IconAdjustmentsBolt, IconArrowRight, IconDeviceMobile, IconPlugConnected, IconPuzzle, IconRoute, IconSquareRoundedCheck } from '@tabler/icons-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { api, errorMessage, setToken } from '../api/client'
import { MadeWith } from '../components/MadeWith'
import { branding } from '../config/branding'
import { useStore } from '../state/store'

const FEATURES = [
  { icon: IconSquareRoundedCheck, title: 'Tasten, die sich wie Tasten anfühlen', text: 'Echter Tastenhub, leuchtende Zustände, Haptik auf dem Handy.' },
  { icon: IconPlugConnected, title: 'Direkt an OBS', text: 'Szenen, Quellen, Audio, Stream & Aufnahme – ohne zusätzliches Plugin.' },
  { icon: IconDeviceMobile, title: 'Jedes Gerät wird zum Deck', text: 'Handy, Tablet oder Browser: QR-Code scannen, fertig.' },
  { icon: IconRoute, title: 'Automationen', text: 'Wenn-dann-Regeln und automatische Szenenwechsel nach Zeit.' },
  { icon: IconPuzzle, title: 'Kostenlos & offen', text: 'Community-Plugins für Photoshop, Resolve, Lightroom und mehr.' },
]

function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android-Handy' : 'Android-Tablet'
  if (/Windows/.test(ua)) return 'Windows-PC'
  if (/Macintosh/.test(ua)) return 'Mac'
  return 'Browser'
}

function BrandPanel() {
  const version = useStore((s) => s.version)
  return (
    <div className="relative hidden flex-1 overflow-hidden lg:flex">
      {/* Markenflaeche: tiefes Violett mit weichem Lichtverlauf und dezentem Tastenraster */}
      <div className="absolute inset-0 bg-[#120f2b]" />
      <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[#5b4bf5] opacity-35 blur-[140px]" />
      <div className="absolute -bottom-48 right-0 h-[32rem] w-[32rem] rounded-full bg-[#f5b544] opacity-15 blur-[140px]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }}
      />

      <div className="relative z-10 flex w-full flex-col justify-between p-14 text-white">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-11 w-11" />
          <span className="text-2xl font-extrabold tracking-tight">{branding.productName}</span>
        </motion.div>

        <div className="max-w-xl">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="text-5xl font-extrabold leading-[1.05] tracking-tight"
          >
            {branding.tagline}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-4 text-lg text-white/75">
            Das kostenlose Stream-Deck für OBS – auf jedem Gerät, das du schon besitzt.
          </motion.p>

          <div className="mt-10 grid gap-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.2 + i * 0.06 }}
                className="flex items-start gap-4 rounded-card border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl bg-white/10 text-[#c9c1ff]">
                  <f.icon size={19} />
                </span>
                <div>
                  <div className="font-semibold">{f.title}</div>
                  <div className="text-sm text-white/70">{f.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="text-xs text-white/55">
          <MadeWith onDark /> · © {new Date().getFullYear()} {branding.company} · <span className="tabular">{version}</span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  mode: 'bootstrap' | 'pair'
  initialCode?: string
  /** Vorschlag fuer den Geraetenamen - bei der Ersteinrichtung der Name des PCs. */
  defaultName?: string | null
  onConnected: () => void
}

/** Ersteinrichtung (am PC) bzw. Kopplung eines neuen Geraets - 1/3 Formular, 2/3 Markenflaeche. */
export function ConnectPage({ mode, initialCode = '', defaultName = null, onConnected }: Props) {
  const [name, setName] = useState(() => defaultName?.trim() || (mode === 'bootstrap' ? 'Dieser PC' : guessDeviceName()))
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res =
        mode === 'bootstrap'
          ? await api<{ token: string }>('/api/auth/bootstrap', { body: { deviceName: name.trim() } })
          : await api<{ token: string }>('/api/auth/pair', { body: { code: code.trim(), deviceName: name.trim() } })
      setToken(res.token)
      // Code nicht in der Adresszeile stehen lassen.
      window.history.replaceState(null, '', '/')
      onConnected()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full bg-canvas">
      <BrandPanel />
      <div className="flex w-full flex-col justify-center border-line bg-surface px-6 py-10 sm:px-12 lg:w-1/3 lg:min-w-[26rem] lg:flex-none lg:border-l">
        <motion.form
          onSubmit={(e) => void submit(e)}
          className="mx-auto w-full max-w-sm space-y-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-center gap-3 lg:hidden">
            <img src="/logo.svg" alt="" className="h-10 w-10" />
            <span className="text-xl font-extrabold tracking-tight text-ink">{branding.productName}</span>
          </div>

          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-soft text-brand">
              {mode === 'bootstrap' ? <IconAdjustmentsBolt size={22} /> : <IconDeviceMobile size={22} />}
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink">{mode === 'bootstrap' ? 'Willkommen!' : 'Gerät koppeln'}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {mode === 'bootstrap'
                ? 'Richte diesen PC als Besitzer ein. Von hier aus gestaltest du deine Decks und koppelst danach Handy oder Tablet per QR-Code.'
                : initialCode
                  ? 'Fast geschafft – gib diesem Gerät noch einen Namen.'
                  : 'Öffne auf dem PC die App → Geräte → „Gerät koppeln“ und scanne den QR-Code. Oder gib den angezeigten Code hier ein.'}
            </p>
          </div>

          {mode === 'pair' && !initialCode && (
            <div>
              <label className="label" htmlFor="pair-code">Kopplungscode</label>
              <input
                id="pair-code"
                className="field h-12 text-center font-mono text-xl font-bold uppercase tracking-[0.3em]"
                value={code}
                maxLength={9}
                autoComplete="one-time-code"
                placeholder="XXXX-XXXX"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="device-name">Name dieses Geräts</label>
            <input id="device-name" className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {error && <p className="rounded-ctl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

          <button type="submit" className="btn btn-create h-11 w-full text-[0.95rem]" disabled={busy || !name.trim()}>
            {busy ? 'Einen Moment …' : mode === 'bootstrap' ? 'Einrichten' : 'Koppeln'}
            <IconArrowRight size={17} />
          </button>
        </motion.form>
      </div>
    </div>
  )
}
