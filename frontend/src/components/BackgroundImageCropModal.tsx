import { IconCheck } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { withDeviceToken } from '../api/client'
import { Modal } from './Modal'

interface Props {
  open: boolean
  imageUrl: string | null
  initialX?: number
  initialY?: number
  initialZoom?: number
  onClose: () => void
  onConfirm: (x: number, y: number, zoom: number) => void
  saving?: boolean
}

/**
 * Einfacher Zuschnitt-Dialog fuer den Deck-Hintergrund: eine Vorschau-Flaeche mit dem Bild als
 * background-image, per Zeiger verschiebbar (setzt imageX/imageY) und per Schieberegler zoombar
 * (imageZoom) - bewusst kein Canvas-Vollprofi-Editor, reicht fuer "verschieben/zoomen" voellig.
 */
export function BackgroundImageCropModal({ open, imageUrl, initialX = 50, initialY = 50, initialZoom = 100, onClose, onConfirm, saving = false }: Props) {
  const [x, setX] = useState(initialX)
  const [y, setY] = useState(initialY)
  const [zoom, setZoom] = useState(initialZoom)
  const areaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Bei jedem Oeffnen (neues Bild bzw. erneutes Oeffnen) auf die uebergebenen Startwerte zuruecksetzen.
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (open && imageUrl !== openedFor) {
    setOpenedFor(imageUrl)
    setX(initialX)
    setY(initialY)
    setZoom(initialZoom)
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const moveTo = (clientX: number, clientY: number) => {
    const el = areaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setX(clamp(Math.round(((clientX - rect.left) / rect.width) * 100), 0, 100))
    setY(clamp(Math.round(((clientY - rect.top) / rect.height) * 100), 0, 100))
  }

  return (
    <Modal
      open={open}
      title="Hintergrundbild zuschneiden"
      onClose={onClose}
      width="max-w-lg"
      footer={
        <button className="btn btn-confirm" disabled={saving} onClick={() => onConfirm(x, y, zoom)}>
          <IconCheck size={16} /> {saving ? 'Speichert …' : 'Übernehmen'}
        </button>
      }
    >
      <div className="space-y-4">
        <div
          ref={areaRef}
          className="relative aspect-video w-full cursor-move select-none overflow-hidden rounded-card border border-line bg-surface-2"
          style={{
            backgroundImage: imageUrl ? `url(${withDeviceToken(imageUrl)})` : undefined,
            backgroundPosition: `${x}% ${y}%`,
            backgroundSize: `${zoom}%`,
            backgroundRepeat: 'no-repeat',
          }}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            moveTo(e.clientX, e.clientY)
          }}
          onPointerMove={(e) => {
            if (dragging.current) moveTo(e.clientX, e.clientY)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
        >
          <div className="pointer-events-none absolute inset-3 rounded-ctl border-2 border-dashed border-white/40" />
        </div>
        <p className="text-xs text-ink-faint">Zum Verschieben im Bild ziehen. Der gestrichelte Rahmen zeigt ungefähr den sichtbaren Bereich einer Deck-Seite.</p>
        <div>
          <label className="label" htmlFor="bg-zoom">
            Zoom: {zoom}%
          </label>
          <input
            id="bg-zoom"
            type="range"
            min={100}
            max={400}
            step={1}
            className="w-full accent-[var(--c-brand-solid)]"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>
      </div>
    </Modal>
  )
}
