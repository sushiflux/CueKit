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
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      {/* Haupt-Topbar: Ein Tick größer (h-16), ultra-stylisch mit Glassmorphism & Brand-Akzentlinie */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-line/80 bg-surface/80 px-4 backdrop-blur-xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12)] lg:px-7 isolate">
        {/* Dezent leuchtende Akzentlinie am unteren Rand der Topbar */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-brand/30 to-transparent pointer-events-none" />

        {/* Links: Logo & Markenname */}
        <NavLink to="/" className="group flex items-center gap-3 rounded-ctl py-1.5 pr-2 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]">
          <div className="relative flex items-center justify-center">
            <div className="absolute -inset-1 rounded-full bg-brand/20 blur-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <img src="/logo.svg" alt="" className="relative h-8 w-8 drop-shadow-[0_2px_8px_rgba(99,102,241,0.25)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight text-ink group-hover:text-brand transition-colors">{branding.productName}</span>
            <span className="hidden text-[10px] font-bold uppercase tracking-wider text-ink-muted bg-surface-2/90 border border-line/60 px-2 py-0.5 rounded-full xl:inline">
              {branding.tagline}
            </span>
          </div>
        </NavLink>

        {/* Mitte: Stylische Navigations-Pills in einem dezenten Glass-Dock */}
        <nav className="flex items-center gap-1 rounded-full border border-line/60 bg-surface-2/60 p-1 backdrop-blur-md shadow-inner" aria-label="Hauptnavigation">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  isActive
                    ? 'text-white'
                    : 'text-ink-muted hover:bg-surface-3/60 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="topbar-nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-brand shadow-md shadow-brand/35"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <Icon size={19} stroke={isActive ? 2.3 : 1.9} className={isActive ? 'text-white' : 'text-ink-muted group-hover:text-ink transition-colors'} />
                  <span className="hidden sm:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Rechts: Geraetestatus, Theme-Umschalter & Info-Popup */}
        <div className="flex items-center gap-2.5">
          {me && (
            <NavLink
              to="/devices"
              className="hidden items-center gap-2 rounded-full border border-line/80 bg-surface-2/80 px-3 py-1.5 text-sm font-medium text-ink transition-all hover:border-brand/50 hover:bg-surface-2 sm:flex shadow-sm"
              title={me.role === 'owner' ? 'Besitzer-Gerät verwalten' : 'Steuergerät'}
            >
              <span className="relative flex h-2 w-2">
                {me.role === 'owner' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    me.role === 'owner' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]' : 'bg-sky-400'
                  }`}
                />
              </span>
              <span className="max-w-[120px] truncate text-xs font-bold">{me.name}</span>
            </NavLink>
          )}

          <button
            className="btn btn-ghost btn-icon h-9 w-9 rounded-full border border-line/60 bg-surface-2/40 hover:bg-surface-2 hover:border-line hover:scale-105 active:scale-95 transition-all shadow-sm"
            onClick={toggle}
            title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
            aria-label="Design umschalten"
          >
            {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
          </button>

          {/* Info & Version Popup */}
          <div className="relative" ref={infoRef}>
            <button
              className={`btn btn-ghost btn-icon h-9 w-9 rounded-full border border-line/60 bg-surface-2/40 hover:bg-surface-2 hover:border-line hover:scale-105 active:scale-95 transition-all shadow-sm ${
                infoOpen ? 'bg-surface-2 text-ink border-brand/50' : ''
              }`}
              onClick={() => setInfoOpen(!infoOpen)}
              title="Über Maestro / CueKit"
              aria-label="App-Informationen anzeigen"
            >
              <IconInfoCircle size={17} />
            </button>

            <AnimatePresence>
              {infoOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 top-11 z-50 w-64 rounded-card border border-line bg-surface p-4 shadow-xl backdrop-blur-md"
                >
                  <AppInfoHint />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Sub-Header: Titel & Aktionen (Breadcrumbs beim Deck, Page Switcher, etc.) */}
      {(actions || (title && typeof title !== 'string')) && (
        <div className="relative z-20 flex min-h-[52px] shrink-0 items-center justify-between border-b border-line/60 bg-surface/40 px-4 backdrop-blur-md lg:px-8">
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
