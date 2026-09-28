import { addCollection, type IconifyJSON } from '@iconify/react'
import { useEffect, useState } from 'react'

/**
 * Icon-Sammlungen werden OFFLINE mitgebuendelt (lazy als eigene Chunks), nicht zur Laufzeit von
 * api.iconify.design geladen: das Deck laeuft im lokalen Netz, oft ohne Internet, und die CSP
 * erlaubt nur 'self'. Rund 16.000 Icons: Tabler (UI), Material Design (breit), Simple Icons (Marken
 * wie OBS, Twitch, YouTube, Photoshop, DaVinci Resolve ...).
 *
 * Geladen wird pro Sammlung und erst bei Bedarf - ein Handy, dessen Deck nur Tabler-Icons nutzt,
 * laedt die grossen Material-/Marken-Sammlungen nie.
 */
export const ICON_SETS = [
  { prefix: 'tabler', label: 'Tabler' },
  { prefix: 'mdi', label: 'Material' },
  { prefix: 'simple-icons', label: 'Marken' },
] as const

const loaders: Record<string, () => Promise<unknown>> = {
  tabler: () => import('@iconify-json/tabler/icons.json'),
  mdi: () => import('@iconify-json/mdi/icons.json'),
  'simple-icons': () => import('@iconify-json/simple-icons/icons.json'),
}

const names: Record<string, string[]> = {}
const loading: Record<string, Promise<void>> = {}
const loaded = new Set<string>()

export function prefixOf(icon: string): string {
  return icon.split(':')[0]
}

export function loadIconSet(prefix: string): Promise<void> {
  const loader = loaders[prefix]
  if (!loader) return Promise.resolve()
  loading[prefix] ??= loader().then((mod) => {
    const json = ((mod as { default?: IconifyJSON }).default ?? mod) as IconifyJSON
    addCollection(json)
    names[json.prefix] = [...Object.keys(json.icons), ...Object.keys(json.aliases ?? {})].sort()
    loaded.add(prefix)
  })
  return loading[prefix]
}

export function loadAllIconSets(): Promise<void> {
  return Promise.all(ICON_SETS.map((s) => loadIconSet(s.prefix))).then(() => {})
}

/** true, sobald die Sammlung(en) geladen sind - ohne Prefix: alle (fuer die Icon-Auswahl). */
export function useIconsReady(prefix?: string): boolean {
  const [, rerender] = useState(0)
  const ready = prefix ? loaded.has(prefix) || !loaders[prefix] : ICON_SETS.every((s) => loaded.has(s.prefix))
  useEffect(() => {
    if (ready) return
    let alive = true
    void (prefix ? loadIconSet(prefix) : loadAllIconSets()).then(() => alive && rerender((n) => n + 1))
    return () => {
      alive = false
    }
  }, [prefix, ready])
  return ready
}

/** Sucht Icons ueber alle Sammlungen (oder eine), Treffer am Wortanfang zuerst. */
export function searchIcons(query: string, prefix?: string, limit = 240): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '-')
  const sets = prefix ? [prefix] : Object.keys(names)
  const starts: string[] = []
  const contains: string[] = []
  for (const set of sets) {
    for (const name of names[set] ?? []) {
      if (!q) {
        if (starts.length < limit) starts.push(`${set}:${name}`)
        continue
      }
      if (name.startsWith(q)) starts.push(`${set}:${name}`)
      else if (name.includes(q)) contains.push(`${set}:${name}`)
    }
  }
  return [...starts, ...contains].slice(0, limit)
}
