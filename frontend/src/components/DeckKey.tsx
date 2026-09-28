import { useState, type CSSProperties } from 'react'
import type { ButtonModel } from '../api/types'
import { activeIcon } from '../lib/buttonState'
import { hotkeyParts } from '../lib/hotkeys'
import { KeyIcon } from './KeyIcon'

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
  onPress?: () => void
  style?: CSSProperties
}

/**
 * Eine Taste, die sich wie eine echte anfuehlt: Koerper mit Glanzkante und Tastenhub, sinkt beim
 * Druecken ein, leuchtet im aktiven Zustand in ihrer Farbe (inkl. LED), schuettelt bei Fehlern.
 */
export function DeckKey({ button, active = false, error = false, selected = false, level = null, showHotkey = false, flash = false, size, onPress, style }: Props) {
  const [pressed, setPressed] = useState(false)
  const icon = activeIcon(button, active)
  const hasLabel = button.label.trim().length > 0
  const iconSize = Math.round(size * (hasLabel ? 0.36 : 0.46))
  const fontSize = Math.max(10, Math.round(size * 0.115))

  const release = () => setPressed(false)

  return (
    <button
      type="button"
      className="deck-key"
      data-color={button.color}
      data-active={active}
      data-pressed={pressed || flash}
      data-error={error}
      aria-pressed={active}
      aria-label={button.label || 'Taste ohne Beschriftung'}
      aria-keyshortcuts={button.hotkey?.replace('Ctrl', 'Control') ?? undefined}
      style={{
        fontSize,
        outline: selected ? '2px solid var(--c-select)' : undefined,
        outlineOffset: selected ? 3 : undefined,
        ...style,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        setPressed(true)
        // Sofort beim Aufsetzen ausloesen (nicht erst beim Loslassen) - fuehlt sich direkter an.
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
      {active && <span className="key-led" />}
      {showHotkey && button.hotkey && size >= 72 && <span className="key-hotkey">{hotkeyParts(button.hotkey).join('+')}</span>}
      {icon && <KeyIcon name={icon} size={iconSize} className="key-icon" />}
      {hasLabel && <span className="key-label">{button.label}</span>}
      {level != null && (
        <span className="key-level" aria-hidden="true">
          <span style={{ width: `${Math.round(level * 100)}%` }} />
        </span>
      )}
    </button>
  )
}
