import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlugConnectedX,
  IconSettings,
} from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ButtonModel, DeckModel, PageModel } from '../api/types'
import { DeckGrid } from '../components/DeckGrid'
import { DeckKey } from '../components/DeckKey'
import { toast } from '../components/Toasts'
import { branding } from '../config/branding'
import { formatDuration, isButtonActive } from '../lib/buttonState'
import { pressButton, setPreviewEnabled } from '../state/realtime'
import { useStore } from '../state/store'

const DECK_KEY = 'deck.selectedDeck'
const PREVIEW_KEY = 'deck.preview'

function readLocal(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignorieren */
  }
}

export function DeckPage() {
  const decks = useStore((s) => s.decks)
  const obs = useStore((s) => s.obs)
  const me = useStore((s) => s.me)
  const link = useStore((s) => s.link)

  const [deckId, setDeckId] = useState<number | null>(() => Number(readLocal(DECK_KEY)) || null)
  const deck: DeckModel | undefined = decks.find((d) => d.id === deckId) ?? decks[0]
  const root = deck?.pages.find((p) => p.parentPageId === null)

  const [stack, setStack] = useState<number[]>([])
  const pageId = stack.at(-1) ?? root?.id
  const page: PageModel | undefined = deck?.pages.find((p) => p.id === pageId) ?? root

  const [focus, setFocus] = useState(false)
  const [preview, setPreview] = useState(() => readLocal(PREVIEW_KEY) === '1')
  const [errorKey, setErrorKey] = useState<number | null>(null)

  // Deck gewechselt oder aktuelle Seite geloescht -> zurueck zur Startseite.
  useEffect(() => {
    if (stack.length && !stack.every((id) => deck?.pages.some((p) => p.id === id))) setStack([])
  }, [deck, stack])

  useEffect(() => {
    void setPreviewEnabled(preview)
    writeLocal(PREVIEW_KEY, preview ? '1' : '0')
    return () => void setPreviewEnabled(false)
  }, [preview])

  // Echter Browser-Vollbildmodus zusaetzlich zum "nur Tasten"-Modus.
  useEffect(() => {
    const onChange = () => setFocus(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFocus = async () => {
    if (!focus) {
      setFocus(true)
      await document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      setFocus(false)
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    }
  }

  const buttonsBySlot = useMemo(() => {
    const map = new Map<string, ButtonModel>()
    page?.buttons.forEach((b) => map.set(`${b.row}-${b.column}`, b))
    return map
  }, [page])

  const press = useCallback(
    async (button: ButtonModel) => {
      const nav = button.actions.filter((a) => a.type.startsWith('deck.'))
      const serverSteps = button.actions.length - nav.length

      if (serverSteps > 0) {
        const result = await pressButton(button.id)
        if (!result.ok) {
          setErrorKey(button.id)
          setTimeout(() => setErrorKey(null), 400)
          toast(result.error ?? 'Aktion fehlgeschlagen.', 'error')
          return
        }
      } else if (button.actions.length === 0) {
        toast(`„${button.label || 'Diese Taste'}“ hat noch keine Aktion.`, 'info')
        return
      }

      for (const step of nav) {
        if (step.type === 'deck.openPage') {
          const target = Number(step.params?.page)
          if (deck?.pages.some((p) => p.id === target)) setStack((s) => [...s, target])
          else toast('Der Ordner dieser Taste existiert nicht mehr.', 'error')
        } else if (step.type === 'deck.back') setStack((s) => s.slice(0, -1))
        else if (step.type === 'deck.home') setStack([])
      }
    },
    [deck],
  )

  if (!deck || !page) {
    return <div className="flex h-full items-center justify-center text-ink-muted">Lade Deck …</div>
  }

  const breadcrumb = [root, ...stack.map((id) => deck.pages.find((p) => p.id === id))].filter(Boolean) as PageModel[]
  const obsDown = obs?.status !== 'connected'

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <AnimatePresence initial={false}>
        {!focus && (
          <motion.header
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="shrink-0 overflow-hidden"
          >
            <div className="flex h-14 items-center gap-3 px-4">
              <img src="/logo.svg" alt="" className="h-7 w-7" />
              <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Ordnerpfad">
                {decks.length > 1 && stack.length === 0 ? (
                  <select
                    className="field h-8 w-auto max-w-[10rem] py-0 font-semibold"
                    value={deck.id}
                    onChange={(e) => {
                      setDeckId(Number(e.target.value))
                      writeLocal(DECK_KEY, e.target.value)
                      setStack([])
                    }}
                    aria-label="Deck wählen"
                  >
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  breadcrumb.map((p, i) => (
                    <span key={p.id} className="flex min-w-0 items-center gap-1">
                      {i > 0 && <IconChevronRight size={14} className="shrink-0 text-ink-faint" />}
                      <button
                        className={`truncate rounded-ctl px-1.5 py-1 font-semibold ${i === breadcrumb.length - 1 ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
                        onClick={() => setStack(stack.slice(0, i))}
                      >
                        {i === 0 ? deck.name : p.name}
                      </button>
                    </span>
                  ))
                )}
              </nav>

              <div className="ml-auto flex items-center gap-2">
                <OutputChips />
                <button
                  className="btn btn-ghost btn-icon"
                  aria-pressed={preview}
                  onClick={() => setPreview((v) => !v)}
                  title={preview ? 'Vorschau ausblenden' : 'Live-Vorschau einblenden'}
                >
                  {preview ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
                <button className="btn btn-ghost btn-icon" onClick={toggleFocus} title="Nur Tasten (Vollbild)">
                  <IconArrowsMaximize size={18} />
                </button>
                {me?.role === 'owner' && (
                  <>
                    <Link to="/edit" className="btn btn-ghost btn-icon" title="Deck bearbeiten">
                      <IconPencil size={18} />
                    </Link>
                    <Link to="/settings" className="btn btn-ghost btn-icon hidden sm:inline-flex" title="Einstellungen">
                      <IconSettings size={18} />
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(obsDown || link !== 'online') && !focus && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mx-4 mb-1 flex items-center gap-3 rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm"
          >
            <IconPlugConnectedX size={18} className="shrink-0 text-danger" />
            <span className="text-ink">
              {link !== 'online'
                ? 'Keine Verbindung zum PC – wird automatisch wiederhergestellt …'
                : (obs?.error ?? (obs?.status === 'connecting' ? 'Verbinde mit OBS …' : 'OBS ist nicht verbunden.'))}
            </span>
            {me?.role === 'owner' && link === 'online' && (
              <Link to="/settings" className="ml-auto shrink-0 font-semibold text-danger hover:underline">
                OBS einrichten
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <main className={`flex min-h-0 flex-1 gap-4 p-4 ${preview ? 'flex-col landscape:flex-row' : ''}`}>
        {preview && <PreviewPanel />}
        <div className="min-h-0 min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page.id}
              className="h-full"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              <DeckGrid
                rows={deck.rows}
                columns={deck.columns}
                maxKeySize={focus ? 260 : 190}
                rotatePortrait
                renderSlot={(row, column, size) => {
                  const b = buttonsBySlot.get(`${row}-${column}`)
                  if (!b) return <div className="deck-slot-empty opacity-40" />
                  return <DeckKey button={b} size={size} active={isButtonActive(b, obs)} error={errorKey === b.id} onPress={() => void press(b)} />
                }}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {focus && (
        <button
          className="fixed right-3 top-3 z-50 rounded-ctl bg-surface/60 p-2 text-ink-muted opacity-40 backdrop-blur transition-opacity hover:opacity-100 focus-visible:opacity-100"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
          onClick={toggleFocus}
          title="Vollbild verlassen"
        >
          <IconArrowsMinimize size={18} />
        </button>
      )}

      {!focus && (
        <footer className="shrink-0 pb-2 text-center text-[11px] text-ink-faint">
          {branding.productName} <VersionText />
        </footer>
      )}
    </div>
  )
}

function VersionText() {
  const version = useStore((s) => s.version)
  return <span className="tabular">{version ?? ''}</span>
}

/** LIVE/REC-Anzeige mit laufender Zeit - nur sichtbar, wenn aktiv. */
function OutputChips() {
  const obs = useStore((s) => s.obs)
  const [now, setNow] = useState(() => Date.now())
  const active = obs?.streaming || obs?.recording
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  if (!obs || !active) return null

  return (
    <div className="hidden items-center gap-2 min-[420px]:flex">
      {obs.streaming && (
        <span className="flex items-center gap-1.5 rounded-badge bg-live px-2 py-1 text-xs font-bold text-white">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
          LIVE <span className="tabular font-semibold">{formatDuration(obs.streamStartedAt, now)}</span>
        </span>
      )}
      {obs.recording && (
        <span className="flex items-center gap-1.5 rounded-badge border border-live/60 px-2 py-1 text-xs font-bold text-danger">
          <span className={`h-1.5 w-1.5 rounded-full bg-live ${obs.recordPaused ? '' : 'live-dot'}`} />
          {obs.recordPaused ? 'PAUSE' : 'REC'} <span className="tabular font-semibold">{formatDuration(obs.recordStartedAt, now)}</span>
        </span>
      )}
    </div>
  )
}

function PreviewPanel() {
  const preview = useStore((s) => s.preview)
  const obs = useStore((s) => s.obs)
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card relative mx-auto aspect-video w-full max-w-3xl shrink-0 overflow-hidden bg-black landscape:w-[42%] landscape:self-center"
      aria-label="Live-Vorschau"
    >
      {preview ? (
        <img src={preview} alt="Programmausgabe von OBS" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/60">
          {obs?.status === 'connected' ? 'Vorschau wird geladen …' : 'Keine Vorschau – OBS nicht verbunden'}
        </div>
      )}
      {obs?.programScene && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <span className="rounded-badge bg-black/65 px-2 py-1 text-xs font-semibold text-white backdrop-blur">{obs.programScene}</span>
          {obs.streaming && <span className="rounded-badge bg-live px-1.5 py-1 text-[10px] font-bold text-white">LIVE</span>}
        </div>
      )}
    </motion.section>
  )
}
