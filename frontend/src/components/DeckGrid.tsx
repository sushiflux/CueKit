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
}

const RAIL_THICKNESS = 48
const RAIL_GAP = 16

/**
 * Quadratische Tasten, die den verfuegbaren Platz optimal ausfuellen - egal ob Handy hochkant,
 * Tablet quer oder Desktop-Fenster. Das Raster bleibt dabei immer mittig (symmetrische Raender).
 */
export function DeckGrid({ rows: logicalRows, columns: logicalColumns, renderSlot, maxKeySize = 180, className, rotatePortrait = false, rail, frame, frameInset = 0 }: Props) {
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
  const availH = box.h - (railSide === 'bottom' ? RAIL_THICKNESS + RAIL_GAP : 0) - (frame ? frameInset * 2 : 0)

  const base = Math.min(availW / columns, availH / rows)
  const gap = Math.round(Math.max(8, Math.min(18, base * 0.12)))
  const size = Math.max(0, Math.floor(Math.min((availW - gap * (columns - 1)) / columns, (availH - gap * (rows - 1)) / rows, maxKeySize)))

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
          <div key={`${row}-${column}`} style={{ width: size, height: size }}>
            {rotated ? renderSlot(column, row, size) : renderSlot(row, column, size)}
          </div>
        )
      })}
    </div>
  )

  return (
    <div ref={ref} className={`flex h-full w-full items-center justify-center ${className ?? ''}`}>
      {size > 0 && (
        <div className={railSide === 'bottom' ? 'flex flex-col items-center' : 'flex items-end'} style={{ gap: RAIL_GAP }}>
          {frame ? frame(grid) : grid}
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
