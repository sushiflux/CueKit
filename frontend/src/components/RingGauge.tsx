/**
 * SVG-Fortschrittsring fuer Auslastungswerte (0-100%) - wie ein Tacho/Ladekreis mit fester
 * Oeffnung oben, statt eines vollen Kreisumfangs. Reines SVG (keine Chart-Bibliothek), damit die
 * App offline bleibt und das Bundle klein. Nutzt stroke-dasharray/-dashoffset auf einem <circle>
 * (statt eines Arc-<path>), weil sich dashoffset zuverlaessig per CSS-transition animieren laesst -
 * eine "d"-Transition auf einem Arc-Pfad wird von Browsern nicht sauber interpoliert.
 */

// 300 Grad Ring, 60 Grad Luecke oben (dezenter Spalt, symmetrisch um 12 Uhr) - der gefuellte Bogen
// beginnt am linken Rand der Luecke und laeuft im Uhrzeigersinn bis zur rechten Seite bei 100%.
const ARC_DEGREES = 300
// Kreis-Rotation, damit sein Start (0 Grad = 3-Uhr-Position im SVG-Koordinatensystem) auf den
// linken Rand der oberen Luecke faellt.
const ROTATE_DEGREES = -90 - ARC_DEGREES / 2

interface Props {
  /** 0-100, oder null wenn kein Wert verfuegbar ist (dann nur der gedaempfte Hintergrundring). */
  percent: number | null
  /** Kantenlaenge des verfuegbaren quadratischen Platzes in px - an die Tastengroesse gekoppelt. */
  size: number
  strokeWidth?: number
  /** Farbe des Fortschritts-Bogens - Default folgt der Tastenfarbe (--key-icon). */
  color?: string
  className?: string
}

export function RingGauge({ percent, size, strokeWidth, color = 'var(--key-icon)', className }: Props) {
  const stroke = strokeWidth ?? Math.max(3, Math.round(size * 0.09))
  const r = size / 2 - stroke / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const arcLength = (ARC_DEGREES / 360) * circumference
  const clamped = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const progressLength = (clamped / 100) * arcLength

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true" style={{ display: 'block' }}>
      <g transform={`rotate(${ROTATE_DEGREES} ${cx} ${cy})`}>
        {/* Hintergrund-Ring: voller Bogen der offenen Form, gedaempft */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--key-edge)"
          strokeWidth={stroke}
          strokeLinecap="round"
          opacity={0.5}
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
        />
        {/* Fortschritts-Bogen: waechst proportional zum Wert, animiert bei Aenderung */}
        {percent != null && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={arcLength - progressLength}
            style={{ transition: 'stroke-dashoffset 260ms ease-out' }}
          />
        )}
      </g>
    </svg>
  )
}
