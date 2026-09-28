import { IconChevronDown, IconInfoCircle, IconLicense, IconSearch, IconShieldLock } from '@tabler/icons-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../api/client'
import { branding } from '../config/branding'
import { useStore } from '../state/store'
import { Modal } from './Modal'

interface ThirdParty {
  name: string
  version: string
  license: string
  url: string | null
  component: string
  text: string | null
}

/** Liste aus scripts/generate-third-party-notices.ts (liegt als statische Datei neben der App). */
function ThirdPartyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<ThirdParty[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const deferred = useDeferredValue(query)

  useEffect(() => {
    if (!open || items) return
    fetch('/third-party-licenses.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ThirdParty[]>
      })
      .then(setItems)
      .catch((e) => setError(`Lizenzliste konnte nicht geladen werden: ${errorMessage(e)}`))
  }, [open, items])

  const visible = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    return (items ?? []).filter((i) => !q || `${i.name} ${i.license}`.toLowerCase().includes(q))
  }, [items, deferred])

  return (
    <Modal open={open} title="Drittanbieter-Lizenzen" onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {branding.productName} nutzt diese Open-Source-Komponenten. Für sie gelten ausschließlich ihre eigenen Lizenzen – herzlichen Dank an alle Autorinnen und Autoren.
        </p>
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="field pl-8" placeholder="Paket oder Lizenz suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {error && <p className="rounded-ctl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="divide-y divide-line rounded-card border border-line">
          {visible.map((i) => {
            const key = `${i.component}:${i.name}:${i.version}`
            const isOpen = expanded === key
            return (
              <div key={key}>
                <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2" onClick={() => setExpanded(isOpen ? null : key)} aria-expanded={isOpen}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {i.name} <span className="font-normal text-ink-faint">{i.version}</span>
                    </span>
                    <span className="text-xs text-ink-faint">{i.component}</span>
                  </span>
                  <span className="shrink-0 rounded-badge bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-ink-muted">{i.license}</span>
                  <IconChevronDown size={15} className={`shrink-0 text-ink-faint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="space-y-2 bg-surface-2/50 px-3 py-3">
                    {i.url && <p className="break-all font-mono text-xs text-ink-muted">{i.url}</p>}
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-ctl bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
                      {i.text ?? `Lizenz: ${i.license} (kein Lizenztext im Paket enthalten)`}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export function AboutCard() {
  const version = useStore((s) => s.version)
  const [open, setOpen] = useState(false)

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconInfoCircle size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Über {branding.productName}</h2>
          <p className="tabular text-xs text-ink-faint">{version}</p>
        </div>
      </div>
      <div className="space-y-3 text-sm text-ink-muted">
        <p className="flex gap-2">
          <IconLicense size={18} className="mt-0.5 shrink-0 text-ink-faint" />
          <span>
            © {new Date().getFullYear()} {branding.company}. {branding.productName} ist kostenlos – privat wie geschäftlich. Veränderung, Weiterverkauf und
            Zurückentwicklung sind nicht gestattet. Plugins dürfen frei entwickelt werden.
          </span>
        </p>
        <p className="flex gap-2">
          <IconShieldLock size={18} className="mt-0.5 shrink-0 text-ink-faint" />
          <span>
            {branding.productName} läuft vollständig in deinem Netzwerk und sendet keine Daten ins Internet. Einstellungen und Passwörter bleiben auf diesem PC (Passwörter
            verschlüsselt).
          </span>
        </p>
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          Drittanbieter-Lizenzen
        </button>
      </div>
      <ThirdPartyModal open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
