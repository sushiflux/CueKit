import { useState, type CSSProperties } from 'react'
import type { ButtonModel, SystemMonitorSnapshot } from '../api/types'
import { activeIcon, buttonHasToggleState, isMonitorLoadMetric, monitorDisplay } from '../lib/buttonState'
import { hotkeyParts } from '../lib/hotkeys'
import { KeyIcon } from './KeyIcon'
import { RingGauge } from './RingGauge'

interface Props {
  button: ButtonModel
  active?: boolean
  error?: boolean
  selected?: boolean
  /** 0..1 - Lautstaerke-Pegel als Fader-Balken am unteren Rand. */
  level?: number | null
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
  const iconSize = Math.round(size * (hasLabel ? 0.36 : 0.46))
  const fontSize = Math.max(10, Math.round(size * 0.115))
  const monitor = monitorMetric ? monitorDisplay(monitorMetric, systemMonitor) : null
  const isRing = monitorMetric != null && isMonitorLoadMetric(monitorMetric)
  const stays = pressBehavior === 'stay' && buttonHasToggleState(button)

  const release = () => setPressed(false)

  return (
    <button
      type="button"
      className="deck-key"
      data-color={button.color}
      data-active={active}
      data-pressed={!monitor && (stays ? active : pressed || flash)}
      data-error={error}
      aria-pressed={monitor ? undefined : active}
      aria-label={monitor ? `${monitor.label}: ${monitor.unavailable ? 'nicht verfügbar' : monitor.value}` : button.label || 'Taste ohne Beschriftung'}
      aria-keyshortcuts={monitor ? undefined : (button.hotkey?.replace('Ctrl', 'Control') ?? undefined)}
      title={monitor?.hint ?? undefined}
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
          {buttonHasToggleState(button) && <span className="key-led"><span className="key-led-emitter" /></span>}
          {showHotkey && button.hotkey && size >= 72 && <span className="key-hotkey">{hotkeyParts(button.hotkey).join('+')}</span>}
          {icon && <KeyIcon name={icon} size={iconSize} className="key-icon" />}
          {hasLabel && <span className="key-label">{button.label}</span>}
          {level != null && (
            <span className="key-level" aria-hidden="true">
              <span style={{ width: `${Math.round(level * 100)}%` }} />
            </span>
          )}
        </>
      )}
    </button>
  )
}
