import { api, ApiError, getToken } from '../api/client'

/** Laedt die Sicherung (alle Decks oder eines) als Datei herunter. */
export async function downloadExport(deckId?: number) {
  let res: Response
  try {
    res = await fetch(`/api/backup/export${deckId ? `?deckId=${deckId}` : ''}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Dienst.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error ?? `Export fehlgeschlagen (HTTP ${res.status}).`)
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'decks.json'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface ImportResult {
  decks: number
  buttons: number
  automations: number
  skippedHotkeys: number
  droppedActions: number
  message: string
}

/** Liest eine Sicherungsdatei und importiert sie als neue Decks. */
export async function importFile(file: File): Promise<ImportResult> {
  if (file.size > 5 * 1024 * 1024) throw new ApiError(400, 'Die Datei ist zu groß (max. 5 MB).')
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new ApiError(400, `„${file.name}“ ist keine gültige Sicherungsdatei (kein JSON).`)
  }
  return api<ImportResult>('/api/backup/import', { body: data })
}
