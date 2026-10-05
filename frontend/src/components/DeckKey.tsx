import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ButtonModel, SystemMonitorSnapshot } from '../api/types'
import { activeIcon, activeLabel, buttonHasToggleState, buttonStateKind, isMonitorLoadMetric, isMuteAction, isTwitchMetric, monitorDisplay, twitchDisplay } from '../lib/buttonState'
import { hotkeyParts } from '../lib/hotkeys'
import { INPUT_LEVEL_SUFFIX, useMeterDb } from '../state/meters'
import { useStore } from '../state/store'
import { KeyIcon } from './KeyIcon'
import { RingGauge } from './RingGauge'

interface Props {
  button: ButtonModel
  active?: boolean
  error?: boolean
  selected?: boolean
  /** 0..1 - Lautstaerke-Pegel als Fader-Balken am unteren Rand. Wenn gesetzt, erscheint dieser
   * Balken IMMER (unabhaengig von volumeIndicator) - er zeigt den tatsaechlichen Pegelwert, nicht
   * nur einen An/Aus-Status. */
  level?: number | null
  /** Betrifft den OBEREN An/Aus-Status-Indikator JEDER Taste mit echtem Toggle-Zustand - NICHT den
   * unteren Pegelbalken (der laeuft bei Lautstaerke-Tasten immer unabhaengig davon, siehe `level`
   * oben). "led" (Standard) = oben rechts die runde LED-Fassung. "level" = oben mittig ein kurzer
   * Status-Strich (.key-status-bar) statt der LED - ebenfalls nur ein reiner rot/gruen-EIN/AUS-
   * Status, kein Pegelwert. Gilt fuer ALLE Toggle-Tasten, nicht nur Lautstaerke-Tasten. */
  volumeIndicator?: 'led' | 'level' | 'corner' | 'glow' | 'none'
  stateStyle?: 'fill' | 'glow' | 'corner' | 'led' | 'level' | 'icon'
  /** Optisches Subpixel-Mesh ueber alle Tasten (LCD CueDeck Look). */
  displayMesh?: boolean
  /** OLED: flaches Display statt Tastenkappe - kein Tastenhub, keine Bewegung beim Druck, Druck = kurzes Aufleuchten. */
  keySurface?: 'smooth' | 'mesh' | 'oled'
  /** Live-Pegel unter dem Lautstaerke-Balken: Schluessel im Pegel-Store (siehe state/meters.ts) und ob die
   * Quelle stummgeschaltet ist (dann grau). Nur zusammen mit `level` sinnvoll. */
  meterKey?: string | null
  meterMuted?: boolean
  /** Taste hat gerade keine Funktion (steuert nur OBS, OBS ist nicht verbunden): bleibt sichtbar,
   * wird aber abgeblendet und zeigt keinen (dann irrefuehrenden) An/Aus-Zustand. */
  unavailable?: boolean
  /** Tastenkuerzel als kleines Etikett oben links anzeigen (nur auf Geraeten mit Tastatur sinnvoll). */
  showHotkey?: boolean
  /** Von aussen ausgeloester Druck (z.B. per Tastenkuerzel) - Taste sinkt kurz ein. */
  flash?: boolean
  /** Rastergroesse in px - Icon/Label skalieren mit der Taste. */
  size: number
  /**
   * "spring" (Standard) = Taste sinkt beim Klick kurz ein und geht sofort wieder hoch.
   * "stay" = bei Tasten MIT echtem An/Aus-Zustand bleibt die Taste optisch eingedrueckt, bis sich
   * der Zustand aendert (data-pressed folgt dann `active` statt dem Zeiger-Zyklus). Bei reinen
   * Einmal-Aktionen (kein Toggle-Zustand) bleibt in jedem Fall das kurze Feedback.
   */
  pressBehavior?: 'spring' | 'stay'
  /**
   * Reine Anzeige-Kachel (z.B. Live-Systemwert) statt klickbarer Auslöser: der Kennwert-Schlüssel
   * (z.B. "cpuLoad"). Wenn gesetzt, ersetzt die Taste Icon/Label durch eine Live-Wert-Anzeige
   * (Tastenhub/LED/Pegel bleiben aus). onPress feuert weiterhin (z.B. im Editor zum Auswaehlen) -
   * der Aufrufer entscheidet, ob ein Druck ueberhaupt etwas ausloesen soll.
   */
  monitorMetric?: string | null
  systemMonitor?: SystemMonitorSnapshot | null
  onPress?: () => void
  style?: CSSProperties
}

const MIN_LABEL_SCALE = 0.4

/**
 * Passt die Beschriftung ein: ein einzelnes Wort, das breiter ist als die Taste, wird nicht mitten im
 * Wort umgebrochen, sondern die Schrift schrittweise verkleinert, bis es passt (ebenso bei zu vielen
 * Zeilen). Laeuft vor dem ersten Zeichnen und erneut, wenn sich etwas aendert, das die Textbreite
 * beeinflusst: Schriftart wird (nach-)geladen, die Taste wird groesser/kleiner (Fenster, Editor).
 */
function useFitLabel(text: string, size: number) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      let scale = 1
      while ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1) && scale > MIN_LABEL_SCALE) {
        scale = Math.round((scale - 0.05) * 100) / 100
        el.style.fontSize = `${scale}em`
      }
    }
    fit()
    // Die Schriftart kann nach dem ersten Layout nachladen (andere Breite) - dann noch einmal einpassen.
    document.fonts?.addEventListener('loadingdone', fit)
    void document.fonts?.ready.then(fit)
    // Die Taste selbst (nicht das Label, dessen Breite sich beim Einpassen aendert) beobachten.
    const key = el.parentElement
    const observer = key ? new ResizeObserver(fit) : null
    if (key) observer?.observe(key)
    return () => {
      document.fonts?.removeEventListener('loadingdone', fit)
      observer?.disconnect()
    }
  }, [text, size])
  return ref
}

const METER_MIN_DB = -60

/** Live-Pegel unter dem Lautstaerke-Balken: gruen/orange/rot wie in OBS (bis -20 dB / bis -9 dB / darueber),
 * grau, solange die Quelle stummgeschaltet ist. Eigene Komponente, damit nur der Balken pro Pegel-Update
 * neu zeichnet (siehe state/meters.ts). */
function KeyMeter({ meterKey, muted }: { meterKey: string; muted: boolean }) {
  // Stumm: Eingangspegel (vor Fader/Stumm), damit der Balken grau ausschlaegt, obwohl nichts durchgeht.
  const db = useMeterDb(muted ? `${meterKey}${INPUT_LEVEL_SUFFIX}` : meterKey)
  const fill = db == null ? 0 : Math.min(1, Math.max(0, (db - METER_MIN_DB) / -METER_MIN_DB))
  return (
    <span className="key-meter" data-muted={muted || undefined} aria-hidden="true">
      <span style={{ clipPath: `inset(0 ${((1 - fill) * 100).toFixed(1)}% 0 0)` }} />
    </span>
  )
}

function WarnBadge({ hint, size }: { hint: string; size: number }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; placeBelow: boolean } | null>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)

  const updatePos = () => {
    if (badgeRef.current) {
      const btn = badgeRef.current.closest('button')
      const bRect = btn ? btn.getBoundingClientRect() : badgeRef.current.getBoundingClientRect()
      const tooltipHeight = 72
      const tooltipWidth = 270

      // Immer komplett außerhalb des Buttons platzieren, damit der Button selbst nie überdeckt wird!
      const spaceBelow = window.innerHeight - bRect.bottom
      const placeBelow = spaceBelow >= tooltipHeight + 14
      const top = placeBelow ? bRect.bottom + 8 : bRect.top - 8
      const left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, bRect.right - tooltipWidth + 8))
      setPos({ top, left, placeBelow })
    }
  }

  const show = () => {
    updatePos()
    setOpen(true)
  }

  const hide = () => setOpen(false)

  return (
    <>
      <span
        ref={badgeRef}
        className="key-warn-badge absolute z-20 flex cursor-help items-center justify-center p-1 transition-transform hover:scale-110 active:scale-95"
        style={{
          bottom: Math.max(2, Math.round(size * 0.03)),
          right: Math.max(2, Math.round(size * 0.03)),
          minWidth: Math.max(18, Math.round(size * 0.2)),
          minHeight: Math.max(18, Math.round(size * 0.2)),
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation()
          updatePos()
          setOpen((prev) => !prev)
        }}
      >
        <KeyIcon
          name="tabler:alert-triangle"
          size={Math.max(11, Math.round(size * 0.14))}
          className="text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-colors hover:text-white"
        />
      </span>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[999999] transition-opacity duration-150 animate-in fade-in zoom-in-95"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.placeBelow ? 'none' : 'translateY(-100%)',
          }}
        >
          <div className="flex max-w-[270px] items-start gap-2.5 rounded-ctl border border-line-strong bg-surface-2/95 p-3 text-xs text-ink shadow-float backdrop-blur-md">
            <KeyIcon name="tabler:alert-triangle" size={17} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="leading-snug">
              <span className="block font-bold text-ink">Hinweis</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">{hint}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/**
 * Eine Taste, die sich wie eine echte anfuehlt: Koerper mit Glanzkante und Tastenhub, sinkt beim
 * Druecken ein, leuchtet im aktiven Zustand in ihrer Farbe (inkl. LED), schuettelt bei Fehlern.
 */
export function DeckKey({
  button,
  active = false,
  error = false,
  selected = false,
  level = null,
  volumeIndicator = 'led',
  stateStyle = 'fill',
  displayMesh = false,
  keySurface = 'smooth',
  unavailable = false,
  meterKey = null,
  meterMuted = false,
  showHotkey = false,
  flash = false,
  size,
  pressBehavior = 'spring',
  monitorMetric = null,
  systemMonitor = null,
  onPress,
  style,
}: Props) {
  const [pressed, setPressed] = useState(false)
  const icon = activeIcon(button, active)
  const label = activeLabel(button, active)
  const hasLabel = label.trim().length > 0
  const labelRef = useFitLabel(label, size)
  const iconSize = Math.round(size * (hasLabel ? 0.36 : 0.46))
  const fontSize = Math.max(10, Math.round(size * 0.115))
  // Twitch-Kacheln (Zuschauer/Follower/Subs/Stream-Zeit) lesen den gemeinsamen Twitch-Stand; die Stream-Zeit tickt sekuendlich.
  const twitch = useStore((s) => s.twitch)
  const obsStreamStartedAt = useStore((s) => s.obs?.streamStartedAt ?? null)
  const ticking = monitorMetric === 'twitchUptime'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [ticking])
  const monitor = monitorMetric
    ? isTwitchMetric(monitorMetric)
      ? twitchDisplay(monitorMetric, twitch, obsStreamStartedAt, now)
      : monitorDisplay(monitorMetric, systemMonitor)
    : null
  const isRing = monitorMetric != null && isMonitorLoadMetric(monitorMetric)
  // "stay": Taste bleibt eingedrueckt, WENN "stay" gewaehlt ist, die Taste einen echten Toggle-Zustand hat
  // UND die Taste verfuegbar ist (nicht durch offline-OBS blockiert).
  // Monitor-Tasten (CPU, GPU, RAM) und Einmal-Aktionen springen IMMER sofort wieder zurueck!
  const oled = keySurface === 'oled'
  const stays = !oled && pressBehavior === 'stay' && buttonHasToggleState(button) && !unavailable
  const mute = isMuteAction(button)
  const hasToggle = buttonHasToggleState(button)
  // Bei "bleibt gedrueckt" soll der GRUENE (gute) Zustand unten/eingedrueckt wirken - bei normalen
  // Toggle-Tasten ist das active=true, bei Mute-Tasten aber genau umgekehrt active=false ("nicht
  // stumm" ist gruen, siehe .deck-key[data-mute='true']-Farblogik in index.css). Ohne diese
  // Unterscheidung blieben Mute-Tasten im gruenen (guten) Zustand faelschlich oben/entspannt.
  const visuallyOn = !unavailable && (mute ? !active : active)
  // Zustandsfarbe: "gut" (gruen) = an bzw. bei Mute-Tasten nicht stumm; "aus" (rot) nur bei echten
  // An/Aus-Tasten - eine nicht gewaehlte Szene o.ae. bleibt neutral.
  const stateKind = buttonStateKind(button)
  const stateOn = mute ? !active : active
  const fillMode = stateStyle === 'fill'
  const off = !unavailable && stateKind === 'onoff' && !stateOn
  const tone: 'on' | 'off' | undefined = unavailable || stateKind == null ? undefined : stateOn ? 'on' : off ? 'off' : undefined

  // Harmonische Zustandsanzeige ohne Kollision:
  // Wenn stateStyle ein Indikator ist ('glow' | 'corner' | 'led' | 'level'), bleibt der Tastenkörper neutral
  // und nur der gewählte Indikator leuchtet farbig.
  // Bei 'fill' leuchtet die ganze Taste (ohne extra LED). Bei 'icon' nur Symbol & Text (ohne extra LED).
  const effectiveIndicator =
    stateStyle === 'glow' ? 'glow' :
    stateStyle === 'corner' ? 'corner' :
    stateStyle === 'led' ? 'led' :
    stateStyle === 'level' ? 'level' :
    stateStyle === 'fill' || stateStyle === 'icon' ? undefined :
    volumeIndicator

  const showLed = hasToggle && !unavailable && effectiveIndicator === 'led'
  const showStatusBar = hasToggle && !unavailable && effectiveIndicator === 'level'
  const showCorner = hasToggle && !unavailable && effectiveIndicator === 'corner'
  const showGlow = hasToggle && !unavailable && effectiveIndicator === 'glow'
  // Unterer Pegelbalken (tatsaechlicher Lautstaerke-Pegel): laeuft IMMER mit, wenn die Taste einen
  // Lautstaerke-Bezug hat - unabhaengig vom oberen Status-Indikator (LED oder Strich).
  const showLevel = level != null
  // Live-Pegel gehoert zum Lautstaerke-Balken: nur dort, wo dieser sichtbar ist.
  const showMeter = showLevel && meterKey != null

  const isWarn = unavailable || (monitor?.unavailable ?? false) || error
  const warnHint =
    monitor?.unavailable
      ? (monitor.hint ?? 'Sensorwert nicht verfügbar.')
      : unavailable
        ? 'OBS ist nicht verbunden – diese Taste hat gerade keine Funktion.'
        : error
          ? 'Fehler beim Ausführen dieser Aktion.'
          : null

  const release = () => setPressed(false)

  return (
    <button
      type="button"
      className="deck-key"
      data-surface={oled ? 'oled' : undefined}
      data-color={button.color}
      data-active={fillMode ? active : false}
      data-mute={(fillMode && mute && !unavailable) || undefined}
      data-off={(fillMode && off && !mute) || undefined}
      data-tone={fillMode ? undefined : tone}
      data-unavailable={unavailable || undefined}
      data-meter={showMeter || undefined}
      data-pressed={stays ? visuallyOn : pressed || flash}
      data-error={error}
      aria-pressed={monitor ? undefined : active}
      aria-label={monitor ? `${monitor.label}: ${monitor.unavailable ? 'nicht verfügbar' : monitor.value}` : label || 'Taste ohne Beschriftung'}
      aria-keyshortcuts={monitor ? undefined : (button.hotkey?.replace('Ctrl', 'Control') ?? undefined)}
      style={{
        fontSize,
        outline: selected ? '2px solid var(--c-select)' : undefined,
        outlineOffset: selected ? 3 : undefined,
        cursor: monitor ? 'default' : undefined,
        ...style,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        if (!stays) setPressed(true)
        onPress?.()
        if (navigator.vibrate) navigator.vibrate(12)
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!e.repeat) onPress?.()
        }
      }}
    >
      {displayMesh && !oled && <span className="key-mesh-overlay" aria-hidden="true" />}
      {monitor && isRing ? (
        <span className="key-ring" style={{ width: Math.round(size * 0.82), height: Math.round(size * 0.82) }}>
          <RingGauge percent={monitor.raw} size={Math.round(size * 0.82)} />
          <span className="key-ring-center">
            <span className="key-ring-label">{monitor.label}</span>
            <span className={`key-ring-value ${monitor.unavailable ? 'text-ink-muted opacity-100' : ''}`}>{monitor.value}</span>
          </span>
        </span>
      ) : monitor ? (
        <>
          <KeyIcon
            name={monitor.icon}
            size={Math.round(size * 0.3)}
            className={`key-icon ${monitor.unavailable ? 'text-ink-muted opacity-100' : ''}`}
          />
          <span className={`key-monitor-value ${monitor.unavailable ? 'text-ink-muted opacity-100' : ''}`}>{monitor.value}</span>
          <span className="key-label">{monitor.label}</span>
        </>
      ) : (
        <>
          {showLed && <span className="key-led" data-led={stateOn ? 'on' : 'off'}><span className="key-led-emitter" /></span>}
          {showStatusBar && <span className="key-status-bar" data-led={stateOn ? 'on' : 'off'} aria-hidden="true" />}
          {showCorner && <span className="key-corner-indicator" data-led={stateOn ? 'on' : 'off'} aria-hidden="true" />}
          {showGlow && <span className="key-backlight-indicator" data-led={stateOn ? 'on' : 'off'} aria-hidden="true" />}
          {showHotkey && button.hotkey && size >= 72 && <span className="key-hotkey">{hotkeyParts(button.hotkey).join('+')}</span>}
          {icon && <KeyIcon name={icon} size={iconSize} className="key-icon" />}
          {hasLabel && (
            <span ref={labelRef} className="key-label">
              {label}
            </span>
          )}
          {showLevel && (
            <span className="key-level" aria-hidden="true">
              <span style={{ width: `${Math.round(level * 100)}%` }} />
            </span>
          )}
          {showMeter && meterKey && <KeyMeter meterKey={meterKey} muted={meterMuted} />}
        </>
      )}
      {isWarn && warnHint && <WarnBadge hint={warnHint} size={size} />}
    </button>
  )
}
