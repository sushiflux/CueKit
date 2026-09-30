import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { ButtonModel, SystemMonitorSnapshot } from '../api/types'
import { activeIcon, buttonHasToggleState, buttonStateKind, isMonitorLoadMetric, isMuteAction, monitorDisplay } from '../lib/buttonState'
import { hotkeyParts } from '../lib/hotkeys'
import { INPUT_LEVEL_SUFFIX, useMeterDb } from '../state/meters'
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
  volumeIndicator?: 'led' | 'level'
  /**
   * Zustandsdarstellung: "fill" (Standard) = Vollflaeche - an gruen, aus rot, weisses Symbol/Text;
   * "icon" = Tastenkoerper bleibt neutral, nur Symbol, Beschriftung und Kante sind gruen/rot.
   */
  stateStyle?: 'fill' | 'icon'
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
  const hasLabel = button.label.trim().length > 0
  const labelRef = useFitLabel(button.label, size)
  const iconSize = Math.round(size * (hasLabel ? 0.36 : 0.46))
  const fontSize = Math.max(10, Math.round(size * 0.115))
  const monitor = monitorMetric ? monitorDisplay(monitorMetric, systemMonitor) : null
  const isRing = monitorMetric != null && isMonitorLoadMetric(monitorMetric)
  const stays = pressBehavior === 'stay' && buttonHasToggleState(button)
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
  // Oberer An/Aus-Status-Indikator: LED (rund, oben rechts) oder Status-Strich (oben mittig) - nie
  // beide gleichzeitig, gilt fuer JEDE Taste mit echtem Toggle-Zustand (nicht nur Lautstaerke-Tasten -
  // die Wahl LED/Strich ist eine generelle Aussehen-Einstellung, kein Lautstaerke-spezifisches Detail).
  const showLed = hasToggle && !unavailable && volumeIndicator === 'led'
  const showStatusBar = hasToggle && !unavailable && volumeIndicator === 'level'
  // Unterer Pegelbalken (tatsaechlicher Lautstaerke-Pegel): laeuft IMMER mit, wenn die Taste einen
  // Lautstaerke-Bezug hat - unabhaengig vom oberen Status-Indikator (LED oder Strich).
  const showLevel = level != null
  // Live-Pegel gehoert zum Lautstaerke-Balken: nur dort, wo dieser sichtbar ist.
  const showMeter = showLevel && meterKey != null

  const release = () => setPressed(false)

  return (
    <button
      type="button"
      className="deck-key"
      data-color={button.color}
      data-active={fillMode ? active : false}
      data-mute={(fillMode && mute && !unavailable) || undefined}
      data-off={(fillMode && off && !mute) || undefined}
      data-tone={fillMode ? undefined : tone}
      data-unavailable={unavailable || undefined}
      data-meter={showMeter || undefined}
      data-pressed={!monitor && (stays ? visuallyOn : pressed || flash)}
      data-error={error}
      aria-pressed={monitor ? undefined : active}
      aria-label={monitor ? `${monitor.label}: ${monitor.unavailable ? 'nicht verfügbar' : monitor.value}` : button.label || 'Taste ohne Beschriftung'}
      aria-keyshortcuts={monitor ? undefined : (button.hotkey?.replace('Ctrl', 'Control') ?? undefined)}
      title={monitor?.hint ?? (unavailable ? 'OBS ist nicht verbunden – diese Taste hat gerade keine Funktion.' : undefined)}
      style={{
        fontSize,
        outline: selected ? '2px solid var(--c-select)' : undefined,
        outlineOffset: selected ? 3 : undefined,
        cursor: monitor ? 'default' : undefined,
        ...style,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        // "stay": der eingedrueckte Look folgt dem echten Zustand (siehe data-pressed oben), nicht
        // dem Zeiger-Zyklus - hier also nichts lokal setzen, sonst zuckt die Taste kurz "falsch herum".
        if (!monitor && !stays) setPressed(true)
        // Sofort beim Aufsetzen ausloesen (nicht erst beim Loslassen) - fuehlt sich direkter an.
        onPress?.()
        if (!monitor && navigator.vibrate) navigator.vibrate(12)
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
      {monitor && isRing ? (
        <span className="key-ring" style={{ width: Math.round(size * 0.82), height: Math.round(size * 0.82) }}>
          <RingGauge percent={monitor.raw} size={Math.round(size * 0.82)} />
          <span className="key-ring-center">
            <span className="key-ring-label">{monitor.label}</span>
            <span className={`key-ring-value ${monitor.unavailable ? 'text-ink-faint' : ''}`}>{monitor.value}</span>
          </span>
        </span>
      ) : monitor ? (
        <>
          <KeyIcon name={monitor.icon} size={Math.round(size * 0.3)} className={`key-icon ${monitor.unavailable ? 'opacity-40' : ''}`} />
          <span className={`key-monitor-value ${monitor.unavailable ? 'text-ink-faint' : ''}`}>{monitor.value}</span>
          <span className="key-label">{monitor.label}</span>
        </>
      ) : (
        <>
          {showLed && <span className="key-led" data-led={stateOn ? 'on' : 'off'}><span className="key-led-emitter" /></span>}
          {showStatusBar && <span className="key-status-bar" data-led={stateOn ? 'on' : 'off'} aria-hidden="true" />}
          {showHotkey && button.hotkey && size >= 72 && <span className="key-hotkey">{hotkeyParts(button.hotkey).join('+')}</span>}
          {icon && <KeyIcon name={icon} size={iconSize} className="key-icon" />}
          {hasLabel && (
            <span ref={labelRef} className="key-label">
              {button.label}
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
    </button>
  )
}
