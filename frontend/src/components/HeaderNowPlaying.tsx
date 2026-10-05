import { IconMusic, IconMusicOff } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { apiBlob } from '../api/client'
import { useStore } from '../state/store'

/** Aktuelle Position in Sekunden: ab Empfang selbst weitergerechnet, solange der Titel laeuft (der Server sendet nur bei Aenderungen). */
function useNowPlayingPosition(): number {
  const np = useStore((s) => s.nowPlaying)
  const [, tick] = useState(0)
  const running = !!np?.playing
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [running])
  if (!np) return 0
  const pos = np.positionSeconds + (np.playing ? (Date.now() - np.receivedAt) / 1000 : 0)
  return np.durationSeconds > 0 ? Math.min(pos, np.durationSeconds) : pos
}

/** Cover als Objekt-URL (mit Token geladen), pro Cover-ID zwischengespeichert. */
const coverCache = new Map<string, string>()
function useCoverUrl(coverId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(coverId ? (coverCache.get(coverId) ?? null) : null)
  useEffect(() => {
    if (!coverId) {
      setUrl(null)
      return
    }
    const cached = coverCache.get(coverId)
    if (cached) {
      setUrl(cached)
      return
    }
    let alive = true
    apiBlob(`/api/now-playing/cover?v=${encodeURIComponent(coverId)}`) // eigene Adresse pro Cover: sonst liefert der Browser-Cache (max-age) das Bild des vorigen Titels
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        if (coverCache.size >= 12) {
          const oldest = coverCache.keys().next().value
          if (oldest !== undefined) {
            URL.revokeObjectURL(coverCache.get(oldest)!)
            coverCache.delete(oldest)
          }
        }
        coverCache.set(coverId, objectUrl)
        if (alive) setUrl(objectUrl)
      })
      .catch(() => alive && setUrl(null)) // Cover ist nur Zierde - ohne Bild zeigt die Anzeige einen Platzhalter
    return () => {
      alive = false
    }
  }, [coverId])
  return url
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Drei kleine Balken, die sich waehrend der Wiedergabe bewegen; pausiert stehen sie still und gedimmt. */
function Equalizer({ playing, color }: { playing: boolean; color: string }) {
  return (
    <span className="flex h-3.5 shrink-0 items-end gap-[2px]" aria-hidden="true" style={{ opacity: playing ? 1 : 0.4 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-[3px] rounded-[1px] ${playing ? 'np-eq-bar' : ''}`} style={{ background: color, height: playing ? undefined : '35%', animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  )
}

/**
 * Laufende Wiedergabe im oberen OLED der Plate: Titel + Interpret, Restzeit und - als feine Linie am unteren
 * Rand des Displays - der Fortschritt. Quelle ist die Windows-Mediensteuerung (Spotify als App oder im Browser,
 * auch andere Player); nichts laeuft -> nichts wird angezeigt.
 */
export function HeaderNowPlaying() {
  const np = useStore((s) => s.nowPlaying)
  const position = useNowPlayingPosition()
  if (!np) return <div className="min-w-0 flex-1" />
  const isSpotify = np.app === 'Spotify'
  const accent = isSpotify ? '#1ed760' : '#22d3ee'
  const remaining = np.durationSeconds > 0 ? `−${formatTime(np.durationSeconds - position)}` : formatTime(position)
  const detail = [np.artist, np.album && np.album !== np.artist ? np.album : null].filter(Boolean).join(' · ')
  return (
    <div
      className="relative z-10 mx-4 flex min-w-0 flex-1 items-center justify-center gap-3"
      title={`${np.app}: ${np.title}${np.artist ? ` – ${np.artist}` : ''}${np.playing ? '' : ' (pausiert)'}`}
    >
      <Equalizer playing={np.playing} color={accent} />
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-[12px] font-bold text-slate-50">{np.title}</span>
        {np.artist && <span className="hidden min-w-0 truncate text-[11px] text-slate-400 min-[900px]:inline">{np.artist}</span>}
      </div>
      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums" style={{ color: np.playing ? accent : '#7d8798' }}>
        {remaining}
      </span>
      <span className="sr-only">{detail}</span>
    </div>
  )
}

/** Feine Fortschrittslinie ganz unten im OLED-Display (muss direkt im `relative`-Display-Container liegen). */
export function NowPlayingProgress() {
  const np = useStore((s) => s.nowPlaying)
  const position = useNowPlayingPosition()
  if (!np || np.durationSeconds <= 0) return null
  const accent = np.app === 'Spotify' ? '#1ed760' : '#22d3ee'
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] bg-white/10" aria-hidden="true">
      <div className="h-full transition-[width] duration-500 ease-linear" style={{ width: `${Math.min(100, (position / np.durationSeconds) * 100).toFixed(2)}%`, background: accent, opacity: np.playing ? 1 : 0.45 }} />
    </div>
  )
}

/**
 * Grosse Variante fuers obere OLED (im Bearbeitungsmodus pro Deck waehlbar): Cover links, daneben Titel, Interpret
 * und Album untereinander, darunter Fortschritt mit verstrichener Zeit und Restzeit. Ohne Wiedergabe ein ruhiger Platzhalter.
 */
export function HeaderNowPlayingLarge({ compact = false }: { compact?: boolean }) {
  const np = useStore((s) => s.nowPlaying)
  const position = useNowPlayingPosition()
  const cover = useCoverUrl(np?.coverId)
  if (!np) {
    return (
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3 text-slate-500">
        <div className="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
          <IconMusicOff size={26} stroke={1.5} />
        </div>
        <span className="text-[13px] font-medium">Keine Wiedergabe</span>
      </div>
    )
  }
  const accent = np.app === 'Spotify' ? '#1ed760' : '#22d3ee'
  const pct = np.durationSeconds > 0 ? Math.min(100, (position / np.durationSeconds) * 100) : 0
  return (
    <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3.5" title={`${np.app}${np.playing ? '' : ' (pausiert)'}`}>
      {cover ? (
        <img src={cover} alt="" className={`${compact ? 'h-[58px] w-[58px]' : 'h-[70px] w-[70px]'} shrink-0 rounded-md object-cover shadow-[0_4px_14px_rgba(0,0,0,0.6)] ring-1 ring-white/10`} style={{ opacity: np.playing ? 1 : 0.6 }} />
      ) : (
        <div className={`flex ${compact ? 'h-[58px] w-[58px]' : 'h-[70px] w-[70px]'} shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]`} style={{ color: accent }}>
          <IconMusic size={26} stroke={1.5} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-2">
          <Equalizer playing={np.playing} color={accent} />
          <span className={`truncate ${compact ? 'text-[14px]' : 'text-[15px]'} font-bold leading-[1.2] text-slate-50`}>{np.title}</span>
        </div>
        {np.artist && <span className="truncate text-[12px] leading-[1.2] text-slate-300">{np.artist}</span>}
        {!compact && np.album && np.album !== np.artist && <span className="truncate text-[11px] leading-[1.2] text-slate-500">{np.album}</span>}
        {np.durationSeconds > 0 && (
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] tabular-nums text-slate-400">
            <span className="w-[4ch] text-right">{formatTime(position)}</span>
            <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-[width] duration-500 ease-linear" style={{ width: `${pct.toFixed(2)}%`, background: accent, opacity: np.playing ? 1 : 0.45 }} />
            </div>
            <span className="w-[5ch]">{`−${formatTime(np.durationSeconds - position)}`}</span>
          </div>
        )}
      </div>
    </div>
  )
}
