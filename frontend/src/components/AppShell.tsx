import {
  IconAdjustments,
  IconDeviceMobile,
  IconInfoCircle,
  IconMoon,
  IconPalette,
  IconPlayerPlay,
  IconPuzzle,
  IconSun,
} from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { branding } from '../config/branding'
import { AppInfoHint } from './AppInfoHint'
import { useTheme } from '../lib/theme'
import { useStore } from '../state/store'

const NAV = [
  { to: '/', label: 'Deck', icon: IconPlayerPlay, end: true },
  { to: '/plugins', label: 'Plugins', icon: IconPuzzle },
  { to: '/devices', label: 'Geräte', icon: IconDeviceMobile },
  { to: '/appearance', label: 'Aussehen', icon: IconPalette },
  { to: '/settings', label: 'Einstellungen', icon: IconAdjustments },
]

/** Stylische Topbar-Navigation fuer die gesamte App: Volle Bildschirmbreite fuer das Deck,
 * kein Platzverlust durch eine feste Seitenleiste mehr. */
export function AppShell({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const me = useStore((s) => s.me)
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useRef<HTMLDivElement>(null)

  // Schließt das Info-Popup bei Klick ausserhalb
  useEffect(() => {
    if (!infoOpen) return
    const handleClick = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false)
      }
    }
    window.addEventListener('pointerdown', handleClick)
    return () => window.removeEventListener('pointerdown', handleClick)
  }, [infoOpen])

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      {/* Haupt-Topbar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface/85 px-4 backdrop-blur-md lg:px-6">
        {/* Links: Logo & Markenname */}
        <NavLink to="/" className="flex items-center gap-2.5 rounded-ctl py-1 pr-2 transition-opacity hover:opacity-90">
          <img src="/logo.svg" alt="" className="h-7 w-7" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-extrabold tracking-tight text-ink">{branding.productName}</span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-ink-faint xl:inline">
              {branding.tagline}
            </span>
          </div>
        </NavLink>

        {/* Mitte: Stylische Navigations-Pills mit animiertem Aktiv-Hintergrund */}
        <nav className="flex items-center gap-1 sm:gap-1.5" aria-label="Hauptnavigation">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  isActive
                    ? 'text-white'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="topbar-nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-brand shadow-sm shadow-brand/30"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <Icon size={18} stroke={isActive ? 2.2 : 1.8} className={isActive ? 'text-white' : 'text-ink-muted group-hover:text-ink'} />
                  <span className="hidden sm:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Rechts: Geraetestatus, Theme-Umschalter & Info-Popup */}
        <div className="flex items-center gap-2">
          {me && (
            <NavLink
              to="/devices"
              className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-sm font-medium text-ink transition-colors hover:border-brand/40 sm:flex"
              title={me.role === 'owner' ? 'Besitzer-Gerät verwalten' : 'Steuergerät'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  me.role === 'owner' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-sky-400'
                }`}
              />
              <span className="max-w-[110px] truncate text-xs font-semibold">{me.name}</span>
            </NavLink>
          )}

          <button
            className="btn btn-ghost btn-icon h-8 w-8 rounded-full"
            onClick={toggle}
            title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
            aria-label="Design umschalten"
          >
            {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>

          {/* Info & Version Popup */}
          <div className="relative" ref={infoRef}>
            <button
              className={`btn btn-ghost btn-icon h-8 w-8 rounded-full ${infoOpen ? 'bg-surface-2 text-ink' : ''}`}
              onClick={() => setInfoOpen(!infoOpen)}
              title="Über Maestro / CueKit"
              aria-label="App-Informationen anzeigen"
            >
              <IconInfoCircle size={16} />
            </button>

            <AnimatePresence>
              {infoOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 top-10 z-50 w-64 rounded-card border border-line bg-surface p-4 shadow-xl backdrop-blur-md"
                >
                  <AppInfoHint />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Sub-Header: Titel & Aktionen (Breadcrumbs beim Deck, Seitentitel bei Einstellungen etc.) */}
      {(actions || (title && typeof title !== 'string')) && (
        <div className="flex min-h-[46px] shrink-0 items-center justify-between border-b border-line/60 bg-surface/40 px-4 backdrop-blur-sm lg:px-8">
          {typeof title !== 'string' && title ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">{title}</div>
          ) : (
            <div className="flex min-w-0 flex-1" />
          )}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Hauptinhalt in voller Breite */}
      <motion.main
        key={location.pathname}
        className="min-h-0 flex-1 overflow-y-scroll overflow-x-hidden"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {children}
      </motion.main>
    </div>
  )
}
