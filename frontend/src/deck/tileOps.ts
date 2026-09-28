import { api, ApiError } from '../api/client'
import type { ButtonModel } from '../api/types'

/** Automations-Taste: genau ein Schritt "automation.toggle" - liefert die Automation-ID. */
export const automationIdOf = (b: ButtonModel) =>
  b.actions.length === 1 && b.actions[0].type === 'automation.toggle' ? Number(b.actions[0].params?.automation) : null

export const folderTargetOf = (b: ButtonModel) => {
  const page = b.actions.find((a) => a.type === 'deck.openPage')?.params?.page
  return page == null ? null : Number(page)
}

/** Multifunktion = keine oder mehrere Aktionen; dort haengt Ziehen neue Schritte an, statt zu ersetzen. */
export const isMulti = (b: ButtonModel) => b.actions.length !== 1 && folderTargetOf(b) == null

/**
 * Loescht eine Taste samt dem, was an ihr haengt: Automations-Tasten nehmen ihre Automation mit,
 * Ordner-Tasten den Ordner mit allen Unterseiten (der Dienst entfernt dabei auch die Taste).
 */
export async function deleteTile(b: ButtonModel) {
  const automationId = automationIdOf(b)
  const folder = folderTargetOf(b)
  if (automationId != null) await api(`/api/automations/${automationId}`, { method: 'DELETE' }).catch(() => {})
  if (folder != null) {
    try {
      await api(`/api/pages/${folder}`, { method: 'DELETE' })
      return
    } catch (e) {
      // Ordner existiert nicht mehr -> nur die verwaiste Taste entfernen.
      if (!(e instanceof ApiError) || e.status !== 404) throw e
    }
  }
  await api(`/api/buttons/${b.id}`, { method: 'DELETE' })
}
