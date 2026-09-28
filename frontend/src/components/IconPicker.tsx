import { IconSearch } from '@tabler/icons-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { ICON_SETS, searchIcons, useIconsReady } from '../lib/icons'
import { KeyIcon } from './KeyIcon'
import { Modal } from './Modal'

interface Props {
  open: boolean
  value: string | null
  onClose: () => void
  onPick: (icon: string | null) => void
}

/** Durchsuchbare Auswahl aus ~16.000 offline gebuendelten Icons. */
export function IconPicker({ open, value, onClose, onPick }: Props) {
  const ready = useIconsReady()
  const [query, setQuery] = useState('')
  const [set, setSet] = useState<string | undefined>(undefined)
  const deferred = useDeferredValue(query)
  const results = useMemo(() => (ready ? searchIcons(deferred, set) : []), [ready, deferred, set])

  return (
    <Modal open={open} title="Icon wählen" onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        <div className="relative">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            autoFocus
            className="field pl-9"
            placeholder="Suchen, z.B. mic, camera, twitch, photoshop …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="chip-select" aria-pressed={set === undefined} onClick={() => setSet(undefined)}>
            Alle
          </button>
          {ICON_SETS.map((s) => (
            <button key={s.prefix} className="chip-select" aria-pressed={set === s.prefix} onClick={() => setSet(s.prefix)}>
              {s.label}
            </button>
          ))}
          <button className="chip-select ml-auto" onClick={() => onPick(null)}>
            Kein Icon
          </button>
        </div>
        {!ready ? (
          <p className="py-10 text-center text-sm text-ink-muted">Icons werden geladen …</p>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">Kein Icon zu „{query}“ gefunden – versuch es auf Englisch (z.B. „microphone“).</p>
        ) : (
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {results.map((name) => (
              <button
                key={name}
                title={name}
                onClick={() => onPick(name)}
                aria-pressed={name === value}
                className="flex aspect-square items-center justify-center rounded-ctl border border-transparent text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
              >
                <KeyIcon name={name} size={24} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
