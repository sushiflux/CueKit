import { IconArrowsMaximize, IconArrowsMinimize, IconChevronRight, IconEye, IconEyeOff, IconKeyboard, IconPencil, IconPlugConnectedX } from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { errorMessage } from '../api/client'
import type { ButtonModel, DeckModel, PageModel } from '../api/types'
import { AppShell } from '../components/AppShell'
import { DeckGrid } from '../components/DeckGrid'
import { DeckKey } from '../components/DeckKey'
import { toast } from '../components/Toasts'
import { DeckEditor } from '../deck/DeckEditor'
import { deleteTile } from '../deck/tileOps'
import { TileMenu, type MenuItem } from '../editor/TileMenu'
import { buttonLevel, buttonNeedsSystemMonitor, displayMetric, formatDuration, isButtonActive } from '../lib/buttonState'
import { hotkeyFromEvent, isTypingTarget } from '../lib/hotkeys'
import { useMediaQuery } from '../lib/useMediaQuery'
import { HotkeyCaps } from '../components/HotkeyRecorder'
import { Modal } from '../components/Modal'
import { pressButton, setPreviewEnabled, setSystemMonitorEnabled } from '../state/realtime'
import { useStore } from '../state/store'

const DECK_KEY = 'deck.selectedDeck'
const PREVIEW_KEY = 'deck.preview'

const LIVE_MENU: MenuItem[] = [
  { id: 'edit', label: 'Bearbeiten', hint: 'Öffnet diese Taste im Editor', icon: 'tabler:pencil' },
  { id: 'delete', label: 'Löschen', icon: 'tabler:trash', danger: true },
]

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
  const automations = useStore((s) => s.automations)
  const catalog = useStore((s) => s.catalog)
  const systemMonitor = useStore((s) => s.systemMonitor)
  const isOwner = me?.role === 'owner'

  // Bearbeiten-Modus direkt im Deck (Bleistift) - in der URL, damit Zurueck/Neuladen passt.
  const [searchParams, setSearchParams] = useSearchParams()
  const editing = searchParams.get('edit') === '1' && isOwner
  const editKey = Number(searchParams.get('key')) || null
  const setEditing = (on: boolean, keyId?: number) =>
    setSearchParams(on ? { edit: '1', ...(keyId ? { key: String(keyId) } : {}) } : {}, { replace: true })

  const [deckId, setDeckId] = useState<number | null>(() => Number(readLocal(DECK_KEY)) || null)
  const deck: DeckModel | undefined = decks.find((d) => d.id === deckId) ?? decks[0]
  const root = deck?.pages.find((p) => p.parentPageId === null)

  const [stack, setStack] = useState<number[]>([])
  const pageId = stack.at(-1) ?? root?.id
  const page: PageModel | undefined = deck?.pages.find((p) => p.id === pageId) ?? root

  const [focus, setFocus] = useState(false)
  const [preview, setPreview] = useState(() => readLocal(PREVIEW_KEY) === '1')
  const [errorKey, setErrorKey] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; button: ButtonModel } | null>(null)

  // Deck gewechselt oder aktuelle Seite geloescht -> zurueck zur Startseite.
  useEffect(() => {
    if (stack.length && !stack.every((id) => deck?.pages.some((p) => p.id === id))) setStack([])
  }, [deck, stack])

  useEffect(() => {
    void setPreviewEnabled(preview && !editing)
    writeLocal(PREVIEW_KEY, preview ? '1' : '0')
    return () => void setPreviewEnabled(false)
  }, [preview, editing])

  // Live-Systemwerte nur abonnieren, waehrend mindestens eine Taste auf der aktuellen Seite sie
  // braucht - Anzeige-Kachel (Kennwert) oder eine Taste mit system.mute/system.volume (LED/Pegel) -
  // und nur in der Live-Ansicht, nicht im Editor (dort reicht der statische Platzhalter).
  const hasVisibleMonitor = !editing && (page?.buttons.some((b) => buttonNeedsSystemMonitor(b)) ?? false)
  useEffect(() => {
    void setSystemMonitorEnabled(hasVisibleMonitor)
    return () => void setSystemMonitorEnabled(false)
  }, [hasVisibleMonitor])

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
      // Reine Anzeige-Kacheln (z.B. Live-Systemwert) loesen nichts aus.
      if (displayMetric(button, catalog) != null) return
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
    [deck, catalog],
  )

  // ---------- Tastenkuerzel ----------
  // Gilt fuer alle Tasten aller Decks - egal, welche Seite gerade offen ist.
  const hotkeyMap = useMemo(() => {
    const map = new Map<string, ButtonModel>()
    decks.forEach((d) => d.pages.forEach((p) => p.buttons.forEach((b) => b.hotkey && map.set(b.hotkey, b))))
    return map
  }, [decks])
  const [flashKey, setFlashKey] = useState<number | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const hasKeyboard = useMediaQuery('(pointer: fine)')

  useEffect(() => {
    if (editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return
      const combo = hotkeyFromEvent(e)
      const button = combo ? hotkeyMap.get(combo) : undefined
      if (!button) return
      e.preventDefault()
      setFlashKey(button.id)
      setTimeout(() => setFlashKey((k) => (k === button.id ? null : k)), 160)
      void press(button)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, hotkeyMap, press])

  // Systemweites Kuerzel am PC gedrueckt (Dienst hat ausgeloest) -> Taste kurz einsinken lassen / Fehler zeigen.
  useEffect(() => {
    const onTriggered = (e: Event) => {
      const { buttonId, error } = (e as CustomEvent<{ buttonId: number; error: string | null }>).detail
      setFlashKey(buttonId)
      setTimeout(() => setFlashKey((k) => (k === buttonId ? null : k)), 160)
      if (error) toast(error, 'error')
    }
    window.addEventListener('deck:keyTriggered', onTriggered)
    return () => window.removeEventListener('deck:keyTriggered', onTriggered)
  }, [])

  const onMenuPick = async (id: string) => {
    if (!menu) return
    if (id === 'edit') return setEditing(true, menu.button.id)
    if (id === 'delete') {
      try {
        await deleteTile(menu.button)
        toast(`„${menu.button.label || 'Taste'}“ gelöscht.`, 'success')
      } catch (e) {
        toast(`Taste konnte nicht gelöscht werden: ${errorMessage(e)}`, 'error')
      }
    }
  }

  if (!deck || !page) {
    return <div className="flex h-full items-center justify-center text-ink-muted">Lade Deck …</div>
  }

  const breadcrumb = [root, ...stack.map((id) => deck.pages.find((p) => p.id === id))].filter(Boolean) as PageModel[]
  const obsDown = obs?.status !== 'connected'

  const title = (
    <>
      <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Ordnerpfad">
        {decks.length > 1 && stack.length === 0 ? (
          <select
            className="field h-9 w-auto max-w-[14rem] py-0 font-bold"
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
              {i > 0 && <IconChevronRight size={15} className="shrink-0 text-ink-faint" />}
              <button
                className={`truncate rounded-ctl px-1.5 py-1 text-lg font-bold tracking-tight ${i === breadcrumb.length - 1 ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
                onClick={() => setStack(stack.slice(0, i))}
              >
                {i === 0 ? deck.name : p.name}
              </button>
            </span>
          ))
        )}
      </nav>
      {editing ? (
        <span className="flex items-center gap-1.5 rounded-badge bg-brand-soft px-2 py-1 text-xs font-bold text-brand">
          <IconPencil size={13} /> Bearbeiten
        </span>
      ) : (
        <OutputChips />
      )}
    </>
  )

  const obsBanner = (obsDown || link !== 'online') && (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-3 flex items-center gap-3 rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm"
    >
      <IconPlugConnectedX size={18} className="shrink-0 text-danger" />
      <span className="text-ink">
        {link !== 'online'
          ? 'Keine Verbindung zum PC – wird automatisch wiederhergestellt …'
          : (obs?.error ?? (obs?.status === 'connecting' ? 'Verbinde mit OBS …' : 'OBS ist nicht verbunden.'))}
      </span>
      {isOwner && link === 'online' && (
        <Link to="/settings" className="ml-auto shrink-0 font-semibold text-danger hover:underline">
          OBS einrichten
        </Link>
      )}
    </motion.div>
  )

  /** Deck-Aktionen direkt am Raster (rechts neben der letzten Kachel) statt am Bildschirmrand. */
  const rail = (orientation: 'vertical' | 'horizontal') => (
    <>
      <button
        className="btn btn-ghost btn-icon h-10 w-10"
        aria-pressed={preview}
        onClick={() => setPreview((v) => !v)}
        title={preview ? 'Vorschau ausblenden' : 'Live-Vorschau einblenden'}
      >
        {preview ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
      {hasKeyboard && (
        <button className="btn btn-ghost btn-icon h-10 w-10" onClick={() => setShortcutsOpen(true)} title="Tastenkürzel">
          <IconKeyboard size={18} />
        </button>
      )}
      <button className="btn btn-ghost btn-icon h-10 w-10" onClick={() => void toggleFocus()} title="Nur Tasten (Vollbild)">
        <IconArrowsMaximize size={18} />
      </button>
      {isOwner && (
        <button
          className={`btn btn-create btn-icon h-12 w-12 shadow-lg ${orientation === 'vertical' ? 'mt-1' : 'ml-1'}`}
          onClick={() => setEditing(true)}
          title="Tasten bearbeiten"
          aria-label="Tasten bearbeiten"
        >
          <IconPencil size={22} />
        </button>
      )}
    </>
  )

  const liveGrid = (
    <main className={`flex min-h-0 flex-1 gap-4 p-4 ${preview && !focus ? 'flex-col landscape:flex-row' : ''}`}>
      {preview && !focus && <PreviewPanel />}
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
              rail={focus ? undefined : rail}
              renderSlot={(row, column, size) => {
                const b = buttonsBySlot.get(`${row}-${column}`)
                if (!b) return <div className="deck-slot-empty opacity-40" />
                return (
                  <div
                    className="h-full w-full"
                    onContextMenu={(e) => {
                      // Rechtsklick (Maus) fuer Besitzer: Bearbeiten/Loeschen. Auf Touch nicht, dort loest der Druck bereits aus.
                      e.preventDefault()
                      const pointerType = (e.nativeEvent as PointerEvent).pointerType
                      if (!isOwner || pointerType === 'touch') return
                      setMenu({ x: e.clientX, y: e.clientY, button: b })
                    }}
                  >
                    <DeckKey
                      button={b}
                      size={size}
                      active={isButtonActive(b, obs, automations, systemMonitor)}
                      level={buttonLevel(b, obs, systemMonitor)}
                      showHotkey={hasKeyboard}
                      flash={flashKey === b.id}
                      error={errorKey === b.id}
                      monitorMetric={displayMetric(b, catalog)}
                      systemMonitor={systemMonitor}
                      onPress={() => void press(b)}
                    />
                  </div>
                )
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  )

  // Vollbild: nur Tasten, ohne Seitenleiste.
  if (focus && !editing) {
    return (
      <div className="flex h-full flex-col bg-canvas" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {liveGrid}
        <button
          className="fixed right-3 top-3 z-50 rounded-ctl bg-surface/60 p-2 text-ink-muted opacity-40 backdrop-blur transition-opacity hover:opacity-100 focus-visible:opacity-100"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
          onClick={() => void toggleFocus()}
          title="Vollbild verlassen"
        >
          <IconArrowsMinimize size={18} />
        </button>
      </div>
    )
  }

  return (
    <AppShell title={title}>
      <div className="flex h-full flex-col">
        <AnimatePresence>{obsBanner}</AnimatePresence>
        {editing ? (
          <div className="min-h-0 flex-1">
            <DeckEditor
              deck={deck}
              page={page}
              initialSelectedId={editKey}
              onDone={() => setEditing(false)}
              onOpenFolder={(id) => setStack((s) => [...s, id])}
              onDeckCreated={(id) => {
                setDeckId(id)
                writeLocal(DECK_KEY, String(id))
                setStack([])
              }}
            />
          </div>
        ) : (
          liveGrid
        )}
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} isOwner={isOwner} onEdit={(id) => { setShortcutsOpen(false); setEditing(true, id) }} />

      {menu && <TileMenu x={menu.x} y={menu.y} title={menu.button.label || 'Taste'} items={LIVE_MENU} onPick={(id) => void onMenuPick(id)} onClose={() => setMenu(null)} />}
    </AppShell>
  )
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

/** Uebersicht aller Tastenkuerzel ueber alle Decks. */
function ShortcutsModal({ open, onClose, isOwner, onEdit }: { open: boolean; onClose: () => void; isOwner: boolean; onEdit: (buttonId: number) => void }) {
  const decks = useStore((s) => s.decks)
  const rows = decks.flatMap((d) =>
    d.pages.flatMap((p) => p.buttons.filter((b) => b.hotkey).map((b) => ({ b, where: p.parentPageId === null ? d.name : `${d.name} › ${p.name}` }))),
  )
  return (
    <Modal open={open} title="Tastenkürzel" onClose={onClose}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          Noch keine Tastenkürzel vergeben.{isOwner && ' Im Bearbeiten-Modus eine Taste wählen und unter „Tastenkürzel“ eine Kombination aufnehmen.'}
        </p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map(({ b, where }) => (
            <button
              key={b.id}
              className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
              disabled={!isOwner}
              onClick={() => onEdit(b.id)}
              title={isOwner ? 'Taste bearbeiten' : undefined}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{b.label || 'Taste ohne Beschriftung'}</span>
                <span className="block truncate text-xs text-ink-faint">{where}</span>
              </span>
              <HotkeyCaps hotkey={b.hotkey!} size="sm" />
            </button>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-ink-faint">Die Kürzel wirken, solange das Deck in diesem Browser im Vordergrund ist.</p>
    </Modal>
  )
}