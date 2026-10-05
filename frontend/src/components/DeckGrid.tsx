import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  rows: number
  columns: number
  /** Rendert den Inhalt eines Slots; bekommt die aktuelle Tastengroesse in px. */
  renderSlot: (row: number, column: number, size: number) => ReactNode
  maxKeySize?: number
  className?: string
  /** Hochformat + Querformat-Raster (z.B. 3x5 auf dem Handy): Raster transponiert anzeigen, damit die Tasten gross bleiben. */
  rotatePortrait?: boolean
  /**
   * Bedienleiste direkt am Raster (rechts neben der letzten Kachel bzw. auf schmalen Bildschirmen
   * darunter) - statt Knoepfen am weit entfernten Bildschirmrand (Ultrawide!).
   * Bekommt die Ausrichtung, damit die Leiste ihre Knoepfe passend anordnet.
   */
  rail?: (orientation: 'vertical' | 'horizontal') => ReactNode
  /**
   * Umschliesst das Tastenraster mit einem Rahmen (Gehaeuse-Plate). `frameInset` ist der Platz pro
   * Seite (px), den der Rahmen um die Tasten herum braucht - er wird von der verfuegbaren Flaeche
   * abgezogen, damit die Tasten nicht ueber den Rahmen hinauswachsen. Die Bedienleiste (rail) bleibt
   * ausserhalb des Rahmens.
   */
  frame?: (grid: ReactNode) => ReactNode
  frameInset?: number
  /** Zusaetzliche Hoehe (px) ueber dem Raster innerhalb des Rahmens, z.B. fuer ein grosses OLED-Display der Plate. */
  frameExtraTop?: number
  /**
   * Seitliche OLED-Displays links/rechts vom Raster, so lang wie das Raster hoch ist (Index 0 = am
   * naechsten am Raster). Im transponierten Hochformat liegen sie stattdessen ueber (links) bzw.
   * unter (rechts) dem Raster und sind so breit wie das Raster.
   */
  sideLeft?: SideSlot[]
  sideRight?: SideSlot[]
}

export interface SideSlot {
  key: string
  render: (o: { orientation: 'vertical' | 'horizontal'; width: number; height: number }) => ReactNode
}

/** Dicke eines Seiten-Displays relativ zur Tastengroesse. */
const SIDE_RATIO = 0.8

/** Hoehe (px) der "Tastenhub"-Kante unter der Taste (hell 6, dunkel 9) - so viel kuerzer ist die Tastenflaeche in der Aussparung. */
const KEY_LIP = 8

const RAIL_THICKNESS = 48
const RAIL_GAP = 16

/**
 * Quadratische Tasten, die den verfuegbaren Platz optimal ausfuellen - egal ob Handy hochkant,
 * Tablet quer oder Desktop-Fenster. Das Raster bleibt dabei immer mittig (symmetrische Raender).
 */
export function DeckGrid({ rows: logicalRows, columns: logicalColumns, renderSlot, maxKeySize = 180, className, rotatePortrait = false, rail, frame, frameInset = 0, frameExtraTop = 0, sideLeft = [], sideRight = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rotated = rotatePortrait && box.h > box.w * 1.15 && logicalColumns > logicalRows
  const rows = rotated ? logicalColumns : logicalRows
  const columns = rotated ? logicalRows : logicalColumns

  // Leiste rechts, solange genug Breite da ist - sonst unter dem Raster.
  const railSide = rail ? (box.w >= 640 && !rotated ? 'right' : 'bottom') : null
  const availW = box.w - (railSide === 'right' ? RAIL_THICKNESS + RAIL_GAP : 0) - (frame ? frameInset * 2 : 0)
  const availH = box.h - (railSide === 'bottom' ? RAIL_THICKNESS + RAIL_GAP : 0) - (frame ? frameInset * 2 + frameExtraTop : 0)

  // Seiten-Displays brauchen entlang der Haupt-Achse (Breite bzw. - transponiert - Hoehe) je SIDE_RATIO Tastenbreiten plus Luecke.
  const sideCount = sideLeft.length + sideRight.length
  const unitsW = columns + (rotated ? 0 : sideCount * SIDE_RATIO)
  const unitsH = rows + (rotated ? sideCount * SIDE_RATIO : 0)
  const base = Math.min(availW / unitsW, availH / unitsH)
  // Mit Gehaeuse braucht jede Taste Platz fuer ihre Aussparung - das Metall soll dazwischen sichtbar bleiben.
  const gap = frame ? Math.round(Math.max(20, Math.min(28, base * 0.15))) : Math.round(Math.max(8, Math.min(18, base * 0.12)))
  const gapsW = columns - 1 + (rotated ? 0 : sideCount)
  const gapsH = rows - 1 + (rotated ? sideCount : 0)
  const size = Math.max(0, Math.floor(Math.min((availW - gap * gapsW) / unitsW, (availH - gap * gapsH) / unitsH, maxKeySize)))
  // Mit Gehaeuse liegt die Taste (kleiner als die Aussparung) im Rahmen - siehe .house-plate-slot in index.css.
  const keySize = frame ? Math.max(0, size - KEY_LIP) : size
  const sideThickness = Math.floor(size * SIDE_RATIO)
  const gridW = columns * size + gap * (columns - 1)
  const gridH = rows * size + gap * (rows - 1)

  const grid = (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, ${size}px)`,
        gridTemplateRows: `repeat(${rows}, ${size}px)`,
        gap,
        // Platz fuer den Tastenhub (Schatten nach unten)
        paddingBottom: 4,
      }}
    >
      {Array.from({ length: rows * columns }, (_, i) => {
        const row = Math.floor(i / columns)
        const column = i % columns
        return (
          <div key={`${row}-${column}`} className={frame ? 'house-plate-slot' : undefined} style={{ width: size, height: size }}>
            {rotated ? renderSlot(column, row, keySize) : renderSlot(row, column, keySize)}
          </div>
        )
      })}
    </div>
  )

  const sideNodes = (slots: SideSlot[], reverse: boolean) =>
    (reverse ? [...slots].reverse() : slots).map((slot) => (
      <div key={slot.key} className="shrink-0">
        {rotated
          ? slot.render({ orientation: 'horizontal', width: gridW, height: sideThickness })
          : slot.render({ orientation: 'vertical', width: sideThickness, height: gridH })}
      </div>
    ))
  const withSides =
    sideCount === 0 ? (
      grid
    ) : (
      <div className={rotated ? 'flex flex-col items-start' : 'flex items-start'} style={{ gap }}>
        {sideNodes(sideLeft, true)}
        {grid}
        {sideNodes(sideRight, false)}
      </div>
    )

  return (
    <div ref={ref} className={`flex h-full w-full items-center justify-center ${className ?? ''}`}>
      {size > 0 && (
        <div className={railSide === 'bottom' ? 'flex flex-col items-center' : 'flex items-end'} style={{ gap: RAIL_GAP }}>
          {frame ? frame(withSides) : withSides}
          {rail && (
            <div className={railSide === 'bottom' ? 'flex items-center gap-2' : 'flex flex-col items-center gap-2 pb-1'} style={railSide === 'bottom' ? { height: RAIL_THICKNESS } : { width: RAIL_THICKNESS }}>
              {rail(railSide === 'bottom' ? 'horizontal' : 'vertical')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
