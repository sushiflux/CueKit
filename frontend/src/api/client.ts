const TOKEN_KEY = 'deck.deviceToken'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* Privater Modus: Token lebt dann nur bis zum Neuladen */
  }
}

const STATUS_FALLBACK: Record<number, string> = {
  400: 'Die Eingaben sind ungültig.',
  401: 'Dieses Gerät ist nicht (mehr) gekoppelt.',
  403: 'Dafür fehlt diesem Gerät die Berechtigung.',
  404: 'Nicht gefunden - wurde es gerade gelöscht?',
  409: 'Konflikt mit dem aktuellen Stand.',
  429: 'Zu viele Anfragen. Bitte kurz warten.',
  500: 'Interner Fehler im Dienst.',
  502: 'Der Dienst ist nicht erreichbar.',
  503: 'Der Dienst startet gerade oder ist nicht verfügbar.',
}

/** Liest die konkrete Fehlermeldung aus der Antwort (eigene {error} oder ASP.NET-ValidationProblem). */
async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.error === 'string') return body.error
    if (body?.errors && typeof body.errors === 'object') {
      const first = Object.values(body.errors as Record<string, string[]>).flat()[0]
      if (first) return first
    }
    if (typeof body?.title === 'string') return body.title
  } catch {
    /* kein JSON */
  }
  return STATUS_FALLBACK[res.status] ?? `Unerwartete Antwort (HTTP ${res.status}).`
}

export async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Dienst. Läuft die App auf dem PC, und ist dieses Gerät im selben Netzwerk?')
  }

  if (!res.ok) {
    const message = await readError(res)
    if (res.status === 401) window.dispatchEvent(new CustomEvent('deck:unauthorized'))
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/** Bild/Datei mit dem Geraete-Token laden (ein img-Tag kann keinen Authorization-Header senden). */
export async function apiBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(path, { headers })
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Dienst.')
  }
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return res.blob()
}
