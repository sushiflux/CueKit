import {
  IconAdjustments,
  IconDeviceMobile,
  IconMenu2,
  IconMoon,
  IconPalette,
  IconPlayerPlay,
  IconPuzzle,
  IconSun,
  IconX,
} from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
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

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useStore((s) => s.me)
  const { theme, toggle } = useTheme()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <img src="/logo.svg" alt="" className="h-9 w-9" />
        <div className="min-w-0">
          <div className="text-lg font-extrabold leading-none tracking-tight text-ink">{branding.productName}</div>
          <div className="mt-1 truncate text-xs text-ink-faint">{branding.tagline}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3" aria-label="Hauptnavigation">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-ctl px-3 py-2 text-sm font-semibold transition-colors ${
                isActive ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="nav-indicator" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />}
                <Icon size={18} stroke={1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <div className="mx-5 border-t border-line" />
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            {me?.role === 'owner' ? (
              <NavLink to="/devices" onClick={onNavigate} className="group min-w-0 rounded-ctl" title="Gerät umbenennen oder verwalten">
                <div className="truncate text-sm font-semibold text-ink group-hover:text-brand">{me.name}</div>
                <div className="text-xs text-ink-faint">Besitzer-Gerät</div>
              </NavLink>
            ) : (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{me?.name}</div>
                <div className="text-xs text-ink-faint">Steuergerät</div>
              </div>
            )}
            <button className="btn btn-ghost btn-icon shrink-0" onClick={toggle} title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}>
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
          </div>
        </div>
        <div className="mx-5 border-t border-line" />
        <div className="px-5 py-3">
          <AppInfoHint />
        </div>
      </div>
    </div>
  )
}

/** Layout fuer alle Verwaltungsseiten: feste Sidebar am Desktop, Schublade auf kleinen Bildschirmen. */
export function AppShell({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-full bg-canvas">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <button className="btn btn-ghost btn-icon absolute right-3 top-5" onClick={() => setOpen(false)} aria-label="Menü schließen">
                <IconX size={18} />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/70 px-4 backdrop-blur lg:px-8">
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label="Menü öffnen">
            <IconMenu2 size={18} />
          </button>
          {typeof title === 'string' ? <h1 className="truncate text-lg font-bold tracking-tight text-ink">{title}</h1> : <div className="flex min-w-0 flex-1 items-center gap-3">{title}</div>}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        <motion.main
          key={location.pathname}
          className="min-h-0 flex-1 overflow-auto"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  )
}
