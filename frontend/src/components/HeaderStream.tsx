import { IconEye, IconStarFilled } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TwitchSnapshot } from '../api/types'
import { formatCount, formatDuration } from '../lib/buttonState'
import { useStore } from '../state/store'

export interface StreamInfo {
  /** "stream" = es wird gestreamt, "record" = nur Aufnahme (Stream hat Vorrang), null = nichts laeuft. */
  kind: 'stream' | 'record' | null
  /** Laufzeit h:mm:ss bzw. mm:ss; null bei pausierter Aufnahme. */
  time: string | null
  paused: boolean
  /** Twitch-Angaben, solange der Kanal bei Twitch live ist - sonst null. */
  twitch: TwitchSnapshot | null
}

/**
 * Was im oberen OLED ueber den Stream angezeigt wird. Die Zeit kommt aus OBS (nicht von Twitch): laeuft ein Stream, ist es die
 * Stream-Zeit - auch wenn gleichzeitig aufgenommen wird; laeuft nur eine Aufnahme, deren Dauer. Zuschauer, Subs, Kategorie und Titel
 * kommen von Twitch und erscheinen nur waehrend eines OBS-Streams, wenn der Kanal dort wirklich live ist.
 */
export function useStreamInfo(): StreamInfo {
  const obs = useStore((s) => s.obs)
  const twitch = useStore((s) => s.twitch)
  const connected = obs?.status === 'connected'
  const obsStreaming = connected && !!obs?.streaming
  const obsRecording = connected && !!obs?.recording
  const twitchLive = !!twitch?.connected && twitch.live
  const kind: StreamInfo['kind'] = obsStreaming ? 'stream' : obsRecording ? 'record' : null

  const [, tick] = useState(0)
  useEffect(() => {
    if (!kind) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [kind])

  const paused = kind === 'record' && !!obs?.recordPaused
  const since = kind === 'stream' ? obs?.streamStartedAt : kind === 'record' ? obs?.recordStartedAt : null
  return { kind, time: kind && since && !paused ? formatDuration(since, Date.now()) : null, paused, twitch: kind === 'stream' && twitchLive ? twitch : null }
}

function Badge({ kind, paused }: { kind: 'stream' | 'record'; paused: boolean }) {
  return kind === 'stream' ? (
    <span className="flex shrink-0 items-center gap-1.5 rounded-[3px] bg-[#e91916]/90 px-1.5 py-[1px] text-[9px] font-black uppercase tracking-widest text-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      Live
    </span>
  ) : (
    <span className="flex shrink-0 items-center gap-1.5 rounded-[3px] border border-[#ff5c5c]/60 px-1.5 py-[1px] text-[9px] font-black uppercase tracking-widest text-[#ff8a8a]">
      <span className={`h-1.5 w-1.5 rounded-full bg-[#ff3b3b] ${paused ? '' : 'animate-pulse'}`} />
      Rec
    </span>
  )
}

/** Zuschauer und Subs als kleine Zahlen - je nach Einstellung (Einstellungen > Twitch) ein-/ausgeblendet. */
function Counts({ twitch, size }: { twitch: TwitchSnapshot; size: number }) {
  return (
    <>
      {twitch.showViewers && (
        <span className="flex items-center gap-1 font-bold tabular-nums text-[#bf94ff]" title="Live-Zuschauer auf Twitch">
          <IconEye size={size} stroke={2} />
          {formatCount(twitch.viewers)}
        </span>
      )}
      {twitch.showSubs && twitch.subsAvailable && twitch.subs != null && (
        <span className="flex items-center gap-1 font-bold tabular-nums text-[#ffd166]" title="Abonnenten (Subs)">
          <IconStarFilled size={size - 1} />
          {formatCount(twitch.subs)}
        </span>
      )}
    </>
  )
}

/**
 * Stream-/Aufnahme-Anzeige fuer die einzeilige Kopfzeile: Badge, Zeit und - wenn Twitch live ist - Zuschauer/Subs. Kategorie und
 * Titel nur, solange keine Musik angezeigt wird (sonst zu eng); dort stehen sie im Tooltip.
 */
export function HeaderStreamChip() {
  const info = useStreamInfo()
  const playing = useStore((s) => !!s.nowPlaying)
  if (!info.kind) return null
  const { twitch } = info
  const roomy = !playing
  return (
    <div
      className="relative z-10 mr-4 hidden min-w-0 shrink items-center gap-2.5 font-mono min-[760px]:flex"
      title={twitch ? `Twitch: ${twitch.game ?? ''} – ${twitch.title ?? ''}` : undefined}
    >
      <Badge kind={info.kind} paused={info.paused} />
      <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-100">{info.paused ? 'PAUSE' : info.time}</span>
      {twitch && roomy && twitch.showCategory && twitch.game && <span className="max-w-[160px] truncate text-[11px] font-bold text-[#bf94ff]">{twitch.game}</span>}
      {twitch && roomy && twitch.showTitle && twitch.title && <span className="hidden max-w-[220px] truncate font-sans text-[11px] text-slate-300 min-[1100px]:inline">{twitch.title}</span>}
      {twitch && (
        <span className="flex shrink-0 items-center gap-2.5 text-[11px]">
          <Counts twitch={twitch} size={14} />
        </span>
      )}
    </div>
  )
}

/** Grosse Variante fuers obere OLED: Badge + Zeit gross, darunter Kategorie, Titel, Zuschauer/Subs. */
export function HeaderStreamLarge({ info, bordered = false }: { info: StreamInfo; bordered?: boolean }) {
  if (!info.kind) return null
  const { twitch } = info
  return (
    <div className={`relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5 ${bordered ? 'border-l border-white/10 pl-5' : ''}`} title={twitch?.title ?? undefined}>
      <div className="flex items-center gap-2.5">
        <Badge kind={info.kind} paused={info.paused} />
        <span className="font-mono text-[20px] font-bold leading-none tabular-nums text-slate-50">{info.paused ? 'PAUSE' : info.time}</span>
      </div>
      {twitch?.showCategory && twitch.game && <span className="truncate text-[13px] font-bold leading-tight text-[#bf94ff]">{twitch.game}</span>}
      {twitch?.showTitle && twitch.title && <span className="truncate text-[11px] leading-tight text-slate-300">{twitch.title}</span>}
      {twitch && (twitch.showViewers || (twitch.showSubs && twitch.subsAvailable && twitch.subs != null)) && (
        <span className="flex items-center gap-3 font-mono text-[11px]">
          <Counts twitch={twitch} size={14} />
        </span>
      )}
    </div>
  )
}

