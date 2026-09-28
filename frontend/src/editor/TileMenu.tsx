import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { KeyIcon } from '../components/KeyIcon'

export interface MenuItem {
  id: string
  label: string
  hint?: string
  icon: string
  danger?: boolean
}

interface Props {
  x: number
  y: number
  title?: string
  items: MenuItem[]
  onPick: (id: string) => void
  onClose: () => void
}

/** Kontextmenue fuer Tasten (Klick auf leere Taste bzw. Rechtsklick) - bleibt immer im sichtbaren Bereich. */
export function TileMenu({ x, y, title, items, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])

  return (
    <motion.div
      ref={ref}
      role="menu"
      className="card fixed z-[90] w-64 p-1.5 shadow-2xl"
      style={pos}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">{title}</div>}
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          className={`flex w-full items-center gap-3 rounded-ctl px-2.5 py-2 text-left transition-colors ${
            item.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2'
          }`}
          onClick={() => {
            onPick(item.id)
            onClose()
          }}
        >
          <KeyIcon name={item.icon} size={18} className={`shrink-0 ${item.danger ? '' : 'text-brand'}`} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{item.label}</span>
            {item.hint && <span className="block text-xs text-ink-faint">{item.hint}</span>}
          </span>
        </button>
      ))}
    </motion.div>
  )
}
