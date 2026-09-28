import { Icon } from '@iconify/react'
import { prefixOf, useIconsReady } from '../lib/icons'

/** Icon aus den offline gebuendelten Sammlungen; bis dessen Sammlung geladen ist, ein Platzhalter gleicher Groesse. */
export function KeyIcon({ name, size, className }: { name: string | null; size: number | string; className?: string }) {
  const ready = useIconsReady(name ? prefixOf(name) : 'tabler')
  if (!name) return null
  if (!ready) return <span className={className} style={{ width: size, height: size, display: 'inline-block' }} />
  return <Icon icon={name} width={size} height={size} className={className} />
}
