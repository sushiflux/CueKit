import { useId } from 'react'

/**
 * SVG-Fortschrittsring für Auslastungswerte (0-100%) - offener Bogen im Tacho-Look (300°).
 * Verwendet einen einzelnen, durchgehenden SVG-Kreisbogen mit stroke-dasharray und strokeLinecap="round".
 * 
 * Farbverlauf:
 * Beginnt links unten (0% Auslastung) in sattem Grün (#22c55e),
 * geht über die Spitze bei 50% Auslastung in warmes Orange (#f59e0b)
 * und endet rechts unten (100% Volllast) in warnendem Rot (#ef4444).
 * Die Animation läuft bei Lastwechseln (auch beim Sinken) butterweich und ohne jedes Abreißen.
 */

const ARC_DEGREES = 300

interface Props {
  /** 0-100, oder null wenn kein Wert verfügbar ist (dann nur der gedämpfte Hintergrundring). */
  percent: number | null
  /** Kantenlänge des verfügbaren quadratischen Platzes in px - an die Tastengröße gekoppelt. */
  size: number
  strokeWidth?: number
  color?: string
  className?: string
}

export function RingGauge({ percent, size, strokeWidth, color = 'gauge', className }: Props) {
  const gradId = useId()
  const stroke = strokeWidth ?? Math.max(3, Math.round(size * 0.09))
  const r = size / 2 - stroke / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const arcLength = (ARC_DEGREES / 360) * circumference
  // Start bei 120° (unten links, nach der 60°-Öffnung um 6 Uhr)
  const startOffset = (120 / 360) * circumference
  const clamped = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const progressFraction = clamped / 100
  const useGauge = color === 'gauge'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        {useGauge && (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="25%" stopColor="#84cc16" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="80%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        )}
      </defs>
      {/* Hintergrund-Ring: voller Bogen der offenen Form, voll deckend (kein Mesh-Durchscheinen) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--key-edge)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circumference - arcLength}`}
        strokeDashoffset={-startOffset}
      />
      {/* Fortschritts-Bogen: einzelner durchgehender Bogen, butterweich animiert ohne Abreißen */}
      {percent != null && progressFraction > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={useGauge ? `url(#${gradId})` : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, progressFraction * arcLength)} ${circumference}`}
          strokeDashoffset={-startOffset}
          style={{ transition: 'stroke-dasharray 240ms ease-out' }}
        />
      )}
    </svg>
  )
}
