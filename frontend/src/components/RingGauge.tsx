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
   * fester POSITION entlang des Rings mit einem weichen Verlauf gruen -> orange -> rot (kein harter
   * Schnitt): der Ring besteht aus vielen kurzen Segmenten, deren Farbe stufenlos aus ihrer Position
   * berechnet wird (SVG kennt keinen Verlauf entlang eines gebogenen Pfads). Je weiter der Ring gefuellt
   * ist, desto weiter reicht der Verlauf. Ein konkreter CSS-Farbwert ersetzt das durch eine einheitliche
   * Farbe (z.B. fuer nicht-Auslastungs-Anzeigen).
   */
  color?: string
  className?: string
}

// Verlauf nach Ring-POSITION (0 = Bogen-Start/unten-links, 1 = Bogen-Ende/unten-rechts): gruen bis
// GAUGE_ORANGE_AT, dann orange, danach zu rot. Gemischt wird in oklab, das ergibt sanfte Uebergaenge ohne
// matschige Mitteltoene.
const GAUGE_ORANGE_AT = 0.6
const GAUGE_ORANGE = '#f59e0b'
const GAUGE_SLICES = 60

function gaugeColor(position: number): string {
  const p = Math.max(0, Math.min(1, position))
  if (p <= GAUGE_ORANGE_AT) return `color-mix(in oklab, ${GAUGE_ORANGE} ${((p / GAUGE_ORANGE_AT) * 100).toFixed(1)}%, var(--c-toggle-on))`
  return `color-mix(in oklab, var(--c-toggle-off) ${(((p - GAUGE_ORANGE_AT) / (1 - GAUGE_ORANGE_AT)) * 100).toFixed(1)}%, ${GAUGE_ORANGE})`
}

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

  // Viele gleich lange Scheiben; sichtbar ist jeweils der Teil bis zum aktuellen Fortschritt. Jede Scheibe
  // behaelt ihre FESTE Position (dashoffset) und damit ihre Farbe, egal wie weit der Ring gefuellt ist.
  // Kleine Ueberlappung, damit zwischen den Scheiben keine hellen Haarlinien entstehen.
  const sliceFraction = 1 / GAUGE_SLICES
  const overlap = Math.min(1, stroke * 0.12)
  const segments = useGauge
    ? Array.from({ length: GAUGE_SLICES }, (_, i) => {
        const from = i * sliceFraction
        const visibleTo = Math.min(from + sliceFraction, progressFraction)
        if (visibleTo <= from) return null
        const length = (visibleTo - from) * arcLength + (visibleTo < progressFraction ? overlap : 0)
        return { key: i, color: gaugeColor(from + sliceFraction / 2), offset: from * arcLength, length }
      }).filter((x): x is { key: number; color: string; offset: number; length: number } => x != null)
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
          ? [
              ...segments!.map((sl) => (
                <circle
                  key={sl.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  style={{ stroke: sl.color, transition: 'stroke-dasharray 260ms ease-out' }}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                  strokeDasharray={`${sl.length} ${circumference}`}
                  strokeDashoffset={-sl.offset}
                />
              )),
              // Runde Kappen: Bogen-Anfang (gruen) und Spitze (Farbe der aktuellen Position).
              ...(progressFraction > 0
                ? [0, progressFraction].map((pos, i) => (
                    <circle
                      key={`cap-${i}`}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      style={{ stroke: gaugeColor(pos), transition: 'stroke-dashoffset 260ms ease-out' }}
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      strokeDasharray={`0.01 ${circumference}`}
                      strokeDashoffset={-pos * arcLength}
                    />
                  ))
                : []),
            ]
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
