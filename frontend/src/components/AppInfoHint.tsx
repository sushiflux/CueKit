import { IconInfoCircle } from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { branding } from '../config/branding'
import { useStore } from '../state/store'
import { MadeWith } from './MadeWith'

/**
 * Info-Symbol im Fuss der Seitenleiste. Beim Ueberfahren (Maus), Fokussieren (Tastatur) oder
 * Antippen (Touch) klappt rechts daneben eine kleine Infokarte auf: "Mit ♥ gemacht",
 * Produkt mit Logo und Version, Copyright.
 */
export function AppInfoHint() {
  const version = useStore((s) => s.version)
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <div className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`rounded-full p-1.5 transition-colors ${open ? 'bg-surface-2 text-brand' : 'text-ink-faint hover:text-ink'}`}
        aria-label="Über diese App"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        <IconInfoCircle size={17} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="tooltip"
            className="absolute bottom-0 left-full z-50 ml-3 w-60"
            initial={{ opacity: 0, x: -6, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          >
            <div className="card relative overflow-hidden shadow-2xl">
              {/* Markenfarbener Akzent oben */}
              <div className="h-1 bg-gradient-to-r from-brand-solid via-brand to-[#f5a623]" />
              <div className="px-4 pb-3.5 pt-3">
                <div className="text-center text-xs font-medium text-ink-muted">
                  <MadeWith />
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-ctl bg-surface-2 px-3 py-2.5">
                  <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold leading-tight tracking-tight text-ink">{branding.productName}</div>
                    <div className="tabular mt-0.5 truncate text-[11px] font-semibold text-brand">{version}</div>
                  </div>
                </div>

                <div className="mt-3 text-center text-[11px] text-ink-faint">
                  © {new Date().getFullYear()} {branding.company}
                </div>
              </div>
            </div>
            {/* kleiner Pfeil nach links zum Info-Symbol (unten ausgerichtet) */}
            <span className="absolute -left-[5px] bottom-3 h-2.5 w-2.5 rotate-45 border-b border-l border-line bg-surface" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
