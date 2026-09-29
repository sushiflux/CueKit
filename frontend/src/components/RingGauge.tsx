/**
 * SVG-Fortschrittsring fuer Auslastungswerte (0-100%) - wie ein Tacho/Ladekreis mit fester
 * Oeffnung unten, statt eines vollen Kreisumfangs. Reines SVG (keine Chart-Bibliothek), damit die
 * App offline bleibt und das Bundle klein. Nutzt stroke-dasharray/-dashoffset auf <circle>-Elementen
 * (statt eines Arc-<path>), weil sich dashoffset zuverlaessig per CSS-transition animieren laesst -
 * eine "d"-Transition auf einem Arc-Pfad wird von Browsern nicht sauber interpoliert.
 */

// 300 Grad Ring, 60 Grad Luecke unten (dezenter Spalt, symmetrisch um 6 Uhr) - der gefuellte Bogen
// beginnt am linken Rand der Luecke (unten-links) und laeuft im Uhrzeigersinn ueber links/oben/
// rechts bis zum rechten Rand der Luecke (unten-rechts) bei 100%.
const ARC_DEGREES = 300
// SVG-Winkel zaehlen ab 3-Uhr (0deg) im Uhrzeigersinn. Die Luecke liegt symmetrisch um 6-Uhr
// (90deg), reicht also von 90-30=60deg bis 90+30=120deg. Der Bogen-Start (0% Fuellung) sitzt direkt
// nach der Luecke bei 120deg - "rotate(120)" verschiebt den Kreis-Nullpunkt (3-Uhr) dorthin.
const ROTATE_DEGREES = 90 + (360 - ARC_DEGREES) / 2

interface Props {
  /** 0-100, oder null wenn kein Wert verfuegbar ist (dann nur der gedaempfte Hintergrundring). */
  percent: number | null
  /** Kantenlaenge des verfuegbaren quadratischen Platzes in px - an die Tastengroesse gekoppelt. */
  size: number
  strokeWidth?: number
  /**
   * Farbe des Fortschritts-Bogens. "gauge" (Standard, fuer Auslastungswerte) faerbt den Bogen nach
   * fester POSITION entlang des Rings gruen/gelb/rot (0-50% Position = gruen, 50-80% = gelb, 80-100%
   * = rot) - wie ein Drehzahlmesser mit farbigen Zonen, unabhaengig vom tatsaechlichen Wert. Jede
   * Zone ist ein eigenes <circle>-Segment mit fixer Winkel-Position (kein linearer Gradient ueber
   * den gebogenen Pfad - das wuerde die Farben je nach Kruemmung leicht verschieben). Ein konkreter
   * CSS-Farbwert ersetzt das durch eine einheitliche Farbe (z.B. fuer nicht-Auslastungs-Anzeigen).
   */
  color?: string
  className?: string
}

// Feste Farbzonen nach Ring-POSITION (0 = Bogen-Start/unten-links, 1 = Bogen-Ende/unten-rechts).
const GAUGE_ZONES: { from: number; to: number; color: string }[] = [
  { from: 0, to: 0.5, color: 'var(--c-toggle-on)' },
  { from: 0.5, to: 0.8, color: '#eab308' },
  { from: 0.8, to: 1, color: 'var(--c-toggle-off)' },
]

export function RingGauge({ percent, size, strokeWidth, color = 'gauge', className }: Props) {
  const stroke = strokeWidth ?? Math.max(3, Math.round(size * 0.09))
  const r = size / 2 - stroke / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const arcLength = (ARC_DEGREES / 360) * circumference
  const clamped = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const progressFraction = clamped / 100
  const useGauge = color === 'gauge'

  // Sichtbarer Teil jeder Zone = Schnittmenge aus [0, progressFraction] und [zone.from, zone.to].
  // Jedes Segment startet an seiner FESTEN Zonen-Position (dashoffset), unabhaengig vom Fortschritt
  // der anderen Zonen - dadurch bleibt jede Farbe exakt an ihrer Ringposition, egal wie weit gefuellt.
  const segments = useGauge
    ? GAUGE_ZONES.map((zone) => {
        const visibleTo = Math.min(zone.to, progressFraction)
        if (visibleTo <= zone.from) return null
        return { color: zone.color, offset: zone.from * arcLength, length: (visibleTo - zone.from) * arcLength }
      }).filter((s): s is { color: string; offset: number; length: number } => s != null)
    : null

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
        {/* Fortschritts-Bogen: waechst proportional zum Wert, animiert bei Aenderung. Bei "gauge"
            mehrere farbige Segmente (siehe oben), sonst ein einzelner Bogen in fester Farbe. */}
        {percent != null && useGauge
          ? segments!.map((s) => (
              <circle
                key={s.offset}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${s.length} ${circumference}`}
                strokeDashoffset={-s.offset}
                style={{ transition: 'stroke-dasharray 260ms ease-out' }}
              />
            ))
          : percent != null && (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${(progressFraction) * arcLength} ${circumference}`}
                strokeDashoffset={0}
                style={{ transition: 'stroke-dasharray 260ms ease-out' }}
              />
            )}
      </g>
    </svg>
  )
}
