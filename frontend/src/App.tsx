import { IconLock, IconMoodPuzzled } from '@tabler/icons-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { api, ApiError, errorMessage, getToken, setToken } from './api/client'
import type { Me } from './api/types'
import { ErrorScreen } from './components/ErrorScreen'
import { Toaster } from './components/Toasts'
import { ConnectPage } from './pages/ConnectPage'
import { DeckPage } from './pages/DeckPage'
import { DevicesPage } from './pages/DevicesPage'
import { PluginsPage } from './pages/PluginsPage'
import { SettingsPage } from './pages/SettingsPage'
import { reloadAutomationStates, reloadCatalog, reloadDecks, reloadHotkeyStatus, startRealtime, stopRealtime } from './state/realtime'
import { setState, useStore } from './state/store'
import { loadIconSet } from './lib/icons'

type Phase = { kind: 'loading' } | { kind: 'bootstrap'; hostName: string | null } | { kind: 'pair'; code: string } | { kind: 'ready' } | { kind: 'error'; message: string }

function OwnerOnly({ children }: { children: ReactNode }) {
  const me = useStore((s) => s.me)
  if (me?.role !== 'owner')
    return <ErrorScreen code="403" title="Nur für Besitzer-Geräte" description="Dieses Gerät darf Tasten drücken, aber nichts bearbeiten. Das geht in der Desktop-App." icon={IconLock} />
  return <>{children}</>
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  const connect = useCallback(async () => {
    setPhase({ kind: 'loading' })
    void api<{ version: string }>('/api/info')
      .then((i) => setState({ version: i.version }))
      .catch(() => {})

    const params = new URLSearchParams(window.location.search)
    const code = window.location.pathname === '/pair' ? (params.get('code') ?? '') : ''

    try {
      if (getToken()) {
        try {
          const me = await api<Me>('/api/auth/me')
          setState({ me })
          await Promise.all([reloadDecks(), reloadCatalog(), reloadAutomationStates()])
          void reloadHotkeyStatus().catch(() => {})
          void startRealtime()
          void loadIconSet('tabler') // Standard-Sammlung vorladen, damit Tasten sofort Icons zeigen
          setPhase({ kind: 'ready' })
          return
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e
          setToken(null)
        }
      }
      const status = await api<{ needsSetup: boolean; canBootstrap: boolean; hostName: string | null }>('/api/auth/status')
      setPhase(status.canBootstrap && !code ? { kind: 'bootstrap', hostName: status.hostName } : { kind: 'pair', code })
    } catch (e) {
      setPhase({ kind: 'error', message: errorMessage(e) })
    }
  }, [])

  useEffect(() => {
    void connect()
  }, [connect])

  // Geraet wurde auf dem PC entfernt -> zurueck zur Kopplung.
  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null)
      void stopRealtime()
      setState({ me: null })
      void connect()
    }
    window.addEventListener('deck:unauthorized', onUnauthorized)
    return () => window.removeEventListener('deck:unauthorized', onUnauthorized)
  }, [connect])

  let content: ReactNode
  switch (phase.kind) {
    case 'loading':
      content = (
        <div className="flex h-full items-center justify-center">
          <img src="/logo.svg" alt="" className="h-12 w-12 animate-pulse" />
        </div>
      )
      break
    case 'error':
      content = (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="max-w-md text-ink-muted">{phase.message}</p>
          <button className="btn btn-ghost" onClick={() => void connect()}>
            Erneut versuchen
          </button>
        </div>
      )
      break
    case 'bootstrap':
      content = <ConnectPage mode="bootstrap" defaultName={phase.hostName} onConnected={() => void connect()} />
      break
    case 'pair':
      content = <ConnectPage mode="pair" initialCode={phase.code} onConnected={() => void connect()} />
      break
    case 'ready':
      content = (
        <Routes>
          <Route path="/" element={<DeckPage />} />
          <Route path="/pair" element={<Navigate to="/" replace />} />
          {/* Editor und Automationen leben jetzt im Deck selbst (Bleistift). */}
          <Route path="/edit" element={<Navigate to="/?edit=1" replace />} />
          <Route path="/automations" element={<Navigate to="/?edit=1" replace />} />
          <Route path="/plugins" element={<OwnerOnly><PluginsPage /></OwnerOnly>} />
          <Route path="/devices" element={<OwnerOnly><DevicesPage /></OwnerOnly>} />
          <Route path="/settings" element={<OwnerOnly><SettingsPage /></OwnerOnly>} />
          <Route path="*" element={<ErrorScreen code="404" title="Seite nicht gefunden" icon={IconMoodPuzzled} />} />
        </Routes>
      )
      break
  }

  return (
    <BrowserRouter>
      {content}
      <Toaster />
    </BrowserRouter>
  )
}
