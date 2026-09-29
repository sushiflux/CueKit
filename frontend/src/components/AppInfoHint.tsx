import { branding } from '../config/branding'
import { useStore } from '../state/store'
import { MadeWith } from './MadeWith'

/**
 * Info-Karte im Fuss der Seitenleiste: "Mit ♥ gemacht", Produkt mit Logo und Version, Copyright.
 * Fest sichtbar (kein Hover/Klick-Icon mehr) - siehe frueheres Tooltip-Design als Stilvorlage.
 */
export function AppInfoHint() {
  const version = useStore((s) => s.version)

  return (
    <div className="card relative w-full overflow-hidden shadow-sm">
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
  )
}
