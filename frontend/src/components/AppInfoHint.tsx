import { branding } from '../config/branding'
import { useStore } from '../state/store'
import { MadeWith } from './MadeWith'

/**
 * Info-Block im Fuss der Seitenleiste: "Mit ♥ gemacht", Version, Copyright. Ohne Produktname/Logo -
 * der Produktname steht bereits oben im Sidebar-Kopf (siehe AppShell), hier nur die Zusatzinfos.
 * Freistehend ohne eigene Box/Umrandung - sitzt direkt im Sidebar-Hintergrund.
 */
export function AppInfoHint() {
  const version = useStore((s) => s.version)

  return (
    <div className="text-center">
      <div className="text-xs font-medium text-ink-muted">
        <MadeWith />
      </div>
      <div className="tabular mt-1.5 text-[11px] font-semibold text-brand">{version}</div>
      <div className="mt-2 text-[11px] text-ink-faint">
        © {new Date().getFullYear()} {branding.company}
      </div>
    </div>
  )
}
