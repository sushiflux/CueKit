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
}

/**
 * Quadratische Tasten, die den verfuegbaren Platz optimal ausfuellen - egal ob Handy hochkant,
 * Tablet quer oder Desktop-Fenster. Das Raster bleibt dabei immer mittig (symmetrische Raender).
 */
export function DeckGrid({ rows: logicalRows, columns: logicalColumns, renderSlot, maxKeySize = 180, className, rotatePortrait = false }: Props) {
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

  const base = Math.min(box.w / columns, box.h / rows)
  const gap = Math.round(Math.max(8, Math.min(18, base * 0.12)))
  const size = Math.max(
    0,
    Math.floor(Math.min((box.w - gap * (columns - 1)) / columns, (box.h - gap * (rows - 1)) / rows, maxKeySize)),
  )

  return (
    <div ref={ref} className={`flex h-full w-full items-center justify-center ${className ?? ''}`}>
      {size > 0 && (
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
      )}
    </div>
  )
}
