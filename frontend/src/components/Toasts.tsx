import { IconAlertTriangle, IconCircleCheck, IconX } from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useSyncExternalStore } from 'react'

type Kind = 'error' | 'success' | 'info'
interface Toast {
  id: number
  kind: Kind
  message: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, kind: Kind = 'info', ms = kind === 'error' ? 6500 : 3000) {
  // Gleiche Meldung nicht stapeln (z.B. mehrfaches Tippen auf eine fehlerhafte Taste).
  if (toasts.some((t) => t.message === message)) return
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, kind, message }]
  emit()
  setTimeout(() => dismiss(id), ms)
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="card pointer-events-auto flex max-w-md items-start gap-3 py-2.5 pl-3 pr-2 shadow-xl"
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            {t.kind === 'error' ? (
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <IconCircleCheck size={18} className="mt-0.5 shrink-0 text-brand" />
            )}
            <p className="text-sm leading-snug text-ink">{t.message}</p>
            <button className="btn btn-sm btn-icon -my-1 shrink-0 text-ink-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Schließen">
              <IconX size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
