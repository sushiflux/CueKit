import { IconCheck, IconExternalLink, IconLock, IconPlugConnected, IconPlugConnectedX } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { TwitchDeviceFlow, TwitchSnapshot, TwitchStatus } from '../api/types'
import { formatCount } from '../lib/buttonState'
import { useStore } from '../state/store'
import { KeyIcon } from './KeyIcon'
import { toast } from './Toasts'

/**
 * Einstellungen > Twitch: Client-ID eintragen, mit dem eigenen Twitch-Konto verbinden (Device-Code: Code auf twitch.tv/activate
 * eingeben - kein Passwort in CueKit), Verbindung trennen. Die Zugangsdaten bleiben verschluesselt auf diesem PC.
 */
export function TwitchCard() {
  const live = useStore((s) => s.twitch) // aktualisiert sich per Ereignis (Verbindung steht, Zahlen kommen)
  const [status, setStatus] = useState<TwitchStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [busy, setBusy] = useState(false)
  const [flow, setFlow] = useState<TwitchDeviceFlow | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await api<TwitchStatus>('/api/twitch/status')
      setStatus(s)
      setFlow(s.flow)
    } catch (e) {
      toast(`Twitch-Status konnte nicht geladen werden: ${errorMessage(e)}`, 'error')
    }
  }, [])

  useEffect(() => void load(), [load, live?.connected, live?.configured, live?.error])

  // Waehrend der Anmeldung den Status regelmaessig nachladen (Code ist bestaetigt -> "verbunden"), sonst kommt es per Ereignis.
  useEffect(() => {
    if (!flow) return
    const id = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(id)
  }, [flow, load])

  const snapshot = live ?? status?.snapshot // der Store wird per Ereignis aktuell gehalten
  const connected = !!snapshot?.connected

  const saveClientId = async () => {
    setBusy(true)
    try {
      const s = await api<TwitchStatus>('/api/twitch/client-id', { method: 'PUT', body: { clientId } })
      setStatus(s)
      setClientId('')
      toast('Client-ID gespeichert.', 'success')
    } catch (e) {
      toast(`Client-ID konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    setBusy(true)
    try {
      setFlow(await api<TwitchDeviceFlow>('/api/twitch/connect', { method: 'POST' }))
    } catch (e) {
      toast(`Verbinden mit Twitch fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const setDisplay = async (patch: Partial<Pick<TwitchSnapshot, 'showViewers' | 'showSubs' | 'showCategory' | 'showTitle'>>) => {
    if (!snapshot) return
    const next = { showViewers: snapshot.showViewers, showSubs: snapshot.showSubs, showCategory: snapshot.showCategory, showTitle: snapshot.showTitle, ...patch }
    try {
      await api('/api/twitch/display', { method: 'PUT', body: next })
    } catch (e) {
      toast(`Anzeige-Einstellung konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await api('/api/twitch/disconnect', { method: 'POST' })
      setFlow(null)
      await load()
      toast('Twitch getrennt.', 'success')
    } catch (e) {
      toast(`Trennen fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <KeyIcon name="simple-icons:twitch" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-ink">Twitch</h2>
          <p className="text-xs text-ink-faint">Live-Zuschauer, Follower, Subs und Stream-Zeit als Kacheln, Clips und Marker per Taste.</p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-2 rounded-badge px-2 py-1 text-xs font-semibold ${
            connected ? 'bg-[color-mix(in_oklab,var(--c-toggle-on)_15%,transparent)] text-ink' : 'bg-surface-3 text-ink-muted'
          }`}
        >
          {connected ? <IconPlugConnected size={14} /> : <IconPlugConnectedX size={14} />}
          {connected ? `Verbunden · ${snapshot?.login ?? ''}` : 'Nicht verbunden'}
        </span>
      </div>

      {snapshot?.error && <p className="mb-4 rounded-ctl bg-danger-soft px-3 py-2 text-sm text-danger">{snapshot.error}</p>}

      {connected ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Status', snapshot?.live ? 'Live' : 'Offline'],
              ['Zuschauer', snapshot?.live ? formatCount(snapshot.viewers) : '–'],
              ['Follower', snapshot?.followers != null ? formatCount(snapshot.followers) : '–'],
              ['Subs', !snapshot?.subsAvailable ? 'kein Abo-Programm' : snapshot?.subs != null ? formatCount(snapshot.subs) : '–'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-ctl bg-surface-2 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
                <dd className="text-sm font-bold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-card border border-line/60 p-4">
            <h3 className="mb-1 text-sm font-bold text-ink">Im oberen OLED anzeigen</h3>
            <p className="mb-3 text-xs text-ink-faint">
              Die Stream- bzw. Aufnahmezeit kommt aus OBS. Alles Weitere erscheint nur, solange dein Kanal live ist – und jede Angabe lässt sich einzeln ausblenden.
            </p>
            <ul className="space-y-2">
              {(
                [
                  ['showViewers', 'Live-Zuschauer', 'Aktuelle Zuschauerzahl'],
                  ['showSubs', 'Abonnenten (Subs)', 'Gesamtzahl – nur mit Affiliate-/Partner-Status'],
                  ['showCategory', 'Kategorie', 'Das Spiel bzw. die Kategorie deines Streams'],
                  ['showTitle', 'Stream-Titel', 'Der aktuelle Titel'],
                ] as const
              ).map(([key, label, hint]) => (
                <li key={key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{label}</p>
                    <p className="text-xs text-ink-faint">{hint}</p>
                  </div>
                  <button className="switch" role="switch" aria-checked={snapshot?.[key] ?? true} aria-label={label} onClick={() => void setDisplay({ [key]: !(snapshot?.[key] ?? true) })} />
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-ink-faint">Die Zugangsdaten liegen verschlüsselt auf diesem PC und werden nie an andere Geräte weitergegeben.</p>
            <button className="btn btn-danger ml-auto" disabled={busy} onClick={() => void disconnect()}>
              Trennen
            </button>
          </div>
        </div>
      ) : flow ? (
        <div className="space-y-3 rounded-card border border-brand/30 bg-brand-soft px-4 py-4">
          <p className="text-sm text-ink">
            1. Öffne die Twitch-Seite und melde dich mit <b>deinem</b> Konto an. 2. Gib diesen Code ein und bestätige:
          </p>
          <p className="select-all text-center font-mono text-3xl font-black tracking-[0.3em] text-ink">{flow.userCode}</p>
          <div className="flex flex-wrap items-center gap-3">
            <a className="btn btn-confirm" href={flow.verificationUri} target="_blank" rel="noreferrer">
              <IconExternalLink size={16} /> Twitch-Seite öffnen
            </a>
            <span className="text-xs text-ink-faint">Diese Seite aktualisiert sich automatisch, sobald du bestätigt hast.</span>
            <button className="btn btn-ghost ml-auto" disabled={busy} onClick={() => void disconnect()}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="twitch-client-id">
              Client-ID der Twitch-Anwendung
            </label>
            <div className="flex gap-2">
              <input
                id="twitch-client-id"
                className="field flex-1 font-mono"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={status?.clientIdHint ? `gespeichert (${status.clientIdHint}) – zum Ändern neu eintragen` : 'z. B. abcdefghij0123456789klmnop1234'}
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn btn-confirm" disabled={busy || clientId.trim().length === 0} onClick={() => void saveClientId()}>
                <IconCheck size={16} /> Speichern
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              Einmalig in der{' '}
              <a className="underline" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
                Twitch-Entwicklerkonsole
              </a>{' '}
              eine Anwendung anlegen: Typ <b>„Öffentlich“ (Public)</b>, OAuth-Weiterleitungs-URL <span className="font-mono">http://localhost</span>. Ein Client-Secret braucht und
              speichert CueKit nicht.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-confirm" disabled={busy || !snapshot?.configured} onClick={() => void connect()}>
              <KeyIcon name="simple-icons:twitch" size={16} /> Mit Twitch verbinden
            </button>
            {!snapshot?.configured && <span className="text-xs text-ink-faint">Zuerst die Client-ID speichern.</span>}
          </div>
          <p className="flex items-start gap-2 text-xs text-ink-faint">
            <IconLock size={14} className="mt-0.5 shrink-0" />
            Du meldest dich auf twitch.tv mit deinem eigenen Konto an – dein Passwort sieht CueKit nie. Die Zugangsdaten werden verschlüsselt auf diesem PC gespeichert.
          </p>
        </div>
      )}
    </section>
  )
}
