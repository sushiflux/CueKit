import { IconAlertTriangle, IconEye, IconStarFilled } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { AudioTrackInfo, ObsStats, TwitchSnapshot } from '../api/types'
import { formatCount, formatDuration } from '../lib/buttonState'
import { useStore } from '../state/store'

type Level = 'ok' | 'warn' | 'bad'

/** Bewertung einer laufenden Aufnahme: CPU-Last, verworfene Frames (Encoding-/Render-Lag) und freier Speicher. */
export interface RecordHealth {
  overall: Level
  cpu: Level
  frames: Level
  disk: Level
  /** Kurze Beschreibung der gefundenen Probleme, z. B. "CPU 92 %" oder "Encoding-Lag 3,2 %". */
  issues: string[]
}

const worst = (...levels: Level[]): Level => (levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'ok')
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0)
const percentText = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`

export function recordHealth(s: ObsStats): RecordHealth {
  const issues: string[] = []
  const cpu: Level = s.cpuUsage >= 90 ? 'bad' : s.cpuUsage >= 75 ? 'warn' : 'ok'
  if (cpu !== 'ok') issues.push(`CPU ${Math.round(s.cpuUsage)} %`)

  const enc = pct(s.outputSkippedFrames, s.outputTotalFrames)
  const render = pct(s.renderSkippedFrames, s.renderTotalFrames)
  const level = (p: number): Level => (p >= 2 ? 'bad' : p > 0.2 ? 'warn' : 'ok')
  const frames = worst(level(enc), level(render))
  if (level(enc) !== 'ok') issues.push(`Encoding-Lag ${percentText(enc)}`)
  if (level(render) !== 'ok') issues.push(`Render-Lag ${percentText(render)}`)

  const freeGb = s.availableDiskSpaceMb / 1024
  const disk: Level = s.availableDiskSpaceMb > 0 && freeGb < 5 ? 'bad' : s.availableDiskSpaceMb > 0 && freeGb < 20 ? 'warn' : 'ok'
  if (disk !== 'ok') issues.push(`Speicher knapp (${Math.round(freeGb)} GB frei)`)

  return { overall: worst(cpu, frames, disk), cpu, frames, disk, issues }
}

/** Dateigroesse kurz: 812 MB / 1,2 GB. */
function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

/** Langen Pfad vorne kuerzen ("…\\Aufnahmen\\2026-10-05 21-30-12.mkv"): das Ende (Ordner + Dateiname) ist das Wichtige. */
function shortenPath(path: string, max = 46): string {
  return path.length <= max ? path : `…${path.slice(path.length - (max - 1))}`
}

const LEVEL_COLOR: Record<Level, string> = { ok: '#cbd5e1', warn: '#fbbf24', bad: '#f87171' }

/** Bitrate kurz: 850 kbit/s bzw. 6,2 Mbit/s. */
function formatKbps(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mbit/s` : `${Math.round(kbps)} kbit/s`
}

/** Aufgenommene Audiospuren: eigene Namen, wenn alle vergeben sind, sonst "Spur 2" bzw. "Spuren 2, 3". */
function trackText(tracks: AudioTrackInfo[]): string {
  if (tracks.length === 0) return 'keine Audiospur'
  if (tracks.every((t) => t.name)) return tracks.map((t) => t.name).join(' + ')
  return `${tracks.length === 1 ? 'Spur' : 'Spuren'} ${tracks.map((t) => t.number).join(', ')}`
}

/** Netzwerk-Stau des Streams (0-1) als Warnstufe. */
const congestionLevel = (c: number): Level => (c >= 0.2 ? 'bad' : c >= 0.05 ? 'warn' : 'ok')

export interface StreamInfo {
  /** Hauptanzeige: "stream" hat Vorrang vor "record"; null = nichts laeuft. */
  kind: 'stream' | 'record' | null
  /** Es wird gestreamt bzw. aufgenommen - beides kann gleichzeitig der Fall sein. */
  streaming: boolean
  recording: boolean
  /** Eine gemeinsame Laufzeit h:mm:ss: die des Streams, sonst die der Aufnahme; null bei pausierter reiner Aufnahme. */
  time: string | null
  /** Die Aufnahme ist pausiert. */
  paused: boolean
  /** Twitch-Angaben, solange gestreamt wird und der Kanal bei Twitch live ist - sonst null. */
  twitch: TwitchSnapshot | null
  /** OBS-Leistungswerte und Ausgabe-Details, solange gestreamt oder aufgenommen wird. */
  stats: ObsStats | null
  /** Bewertung der Aufnahme (nur waehrend einer Aufnahme). */
  health: RecordHealth | null
}

/**
 * Was im oberen OLED ueber Stream und Aufnahme angezeigt wird. Die Zeit kommt aus OBS (nicht von Twitch) und wird nur EINMAL gezeigt:
 * laeuft ein Stream, ist es die Stream-Zeit - auch wenn gleichzeitig aufgenommen wird. Laeuft nur eine Aufnahme, deren Dauer. Stream und
 * Aufnahme koennen aber beide mit ihren Details erscheinen (Bitrate/Codec bzw. Codec/Format/Audiospuren/Leistungswerte). Zuschauer, Subs,
 * Kategorie und Titel kommen von Twitch und erscheinen nur waehrend eines OBS-Streams, wenn der Kanal dort wirklich live ist.
 */
export function useStreamInfo(): StreamInfo {
  const obs = useStore((s) => s.obs)
  const twitch = useStore((s) => s.twitch)
  const obsStats = useStore((s) => s.obsStats)
  const connected = obs?.status === 'connected'
  const streaming = connected && !!obs?.streaming
  const recording = connected && !!obs?.recording
  const twitchLive = !!twitch?.connected && twitch.live
  const kind: StreamInfo['kind'] = streaming ? 'stream' : recording ? 'record' : null

  const [, tick] = useState(0)
  useEffect(() => {
    if (!kind) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [kind])

  const paused = recording && !!obs?.recordPaused
  const since = kind === 'stream' ? obs?.streamStartedAt : kind === 'record' ? obs?.recordStartedAt : null
  const stats = kind ? obsStats : null
  return {
    kind,
    streaming,
    recording,
    time: kind && since && !(kind === 'record' && paused) ? formatDuration(since, Date.now()) : null,
    paused,
    twitch: streaming && twitchLive ? twitch : null,
    stats,
    health: stats && recording ? recordHealth(stats) : null,
  }
}

function Badge({ kind, paused, small = false }: { kind: 'stream' | 'record'; paused: boolean; small?: boolean }) {
  const size = small ? 'px-1 text-[8px]' : 'px-1.5 text-[9px]'
  return kind === 'stream' ? (
    <span className={`flex shrink-0 items-center gap-1.5 rounded-[3px] bg-[#e91916]/90 py-[1px] font-black uppercase tracking-widest text-white ${size}`}>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      Live
    </span>
  ) : (
    <span className={`flex shrink-0 items-center gap-1.5 rounded-[3px] border border-[#ff5c5c]/60 py-[1px] font-black uppercase tracking-widest text-[#ff8a8a] ${size}`}>
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

/** Warnhinweis bei Problemen der Aufnahme (Ueberlastung, Frames verworfen, Speicher knapp). */
function HealthWarning({ health, withText }: { health: RecordHealth; withText?: boolean }) {
  if (health.overall === 'ok') return null
  const color = health.overall === 'bad' ? '#f87171' : '#fbbf24'
  const label = health.cpu !== 'ok' || health.frames !== 'ok' ? 'Überlastung' : 'Speicher'
  return (
    <span className="flex shrink-0 items-center gap-1 font-sans text-[11px] font-bold" style={{ color }} title={health.issues.join(' · ')}>
      <IconAlertTriangle size={14} stroke={2.2} />
      {withText && label}
    </span>
  )
}

/** "12,3 Mbit/s" samt Bandbreiten-Limit (nur bei Enhanced Broadcasting), im Stau-Farbton. */
function StreamBitrate({ stats }: { stats: ObsStats }) {
  const settings = stats.streamSettings
  const level = congestionLevel(stats.streamCongestion)
  const limit = settings?.enhanced ? (settings.maxKbps ? `max. ${formatKbps(settings.maxKbps)}` : 'max. auto') : null
  const tip = [
    `Gesendete Bitrate${limit ? ` (Bandbreiten-Limit: ${limit.replace('max. ', '')})` : ''}`,
    level !== 'ok' ? `Netzwerk-Stau ${Math.round(stats.streamCongestion * 100)} %` : null,
    settings?.maxVideoTracks ? `max. ${settings.maxVideoTracks} Videospuren` : null,
  ].filter(Boolean).join(' · ')
  return (
    <span style={{ color: level === 'ok' ? '#e2e8f0' : LEVEL_COLOR[level] }} title={tip}>
      {stats.streamKbps > 0 ? formatKbps(stats.streamKbps) : '…'}
      {limit && <span className="font-normal text-slate-400"> ({limit})</span>}
    </span>
  )
}

/** Codec des Streams: bei Enhanced Broadcasting waehlt Twitch Codec und Videospuren selbst. */
const streamCodecText = (stats: ObsStats) => (stats.streamSettings?.enhanced ? 'Enhanced Broadcasting' : stats.streamSettings?.codec ?? null)

/**
 * Stream-/Aufnahme-Anzeige fuer die einzeilige Kopfzeile: Badge und die eine gemeinsame Zeit, bei gleichzeitiger Aufnahme ein kleines
 * Rec-Badge, bei Twitch Zuschauer/Subs, dazu Bitrate bzw. Codec/Format und - bei Aufnahme - CPU/FPS samt Warnhinweis. Kategorie und Titel
 * nur, solange keine Musik angezeigt wird (sonst zu eng); dort stehen sie im Tooltip.
 */
export function HeaderStreamChip() {
  const info = useStreamInfo()
  const playing = useStore((s) => !!s.nowPlaying)
  if (!info.kind) return null
  const { twitch, stats, health } = info
  const roomy = !playing
  const record = stats?.record
  return (
    <div
      className="relative z-10 mr-4 hidden min-w-0 shrink items-center gap-2.5 font-mono min-[760px]:flex"
      title={twitch ? `Twitch: ${twitch.game ?? ''} – ${twitch.title ?? ''}` : ([stats?.recordPath ?? stats?.recordDirectory, ...(health?.issues ?? [])].filter(Boolean).join(' · ') || undefined)}
    >
      <Badge kind={info.kind} paused={info.paused && info.kind === 'record'} />
      <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-100">{info.kind === 'record' && info.paused ? 'PAUSE' : info.time}</span>
      {info.streaming && info.recording && <Badge kind="record" paused={info.paused} small />}
      {twitch && roomy && twitch.showCategory && twitch.game && <span className="max-w-[160px] truncate text-[11px] font-bold text-[#bf94ff]">{twitch.game}</span>}
      {twitch && roomy && twitch.showTitle && twitch.title && <span className="hidden max-w-[220px] truncate font-sans text-[11px] text-slate-300 min-[1100px]:inline">{twitch.title}</span>}
      {twitch && (
        <span className="flex shrink-0 items-center gap-2.5 text-[11px]">
          <Counts twitch={twitch} size={14} />
        </span>
      )}
      {info.streaming && stats && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums">
          <StreamBitrate stats={stats} />
        </span>
      )}
      {info.recording && record && roomy && (
        <span className="hidden shrink-0 text-[11px] text-slate-300 min-[1100px]:inline" title={`${record.codec} · ${record.format} · ${trackText(record.tracks)}`}>
          {record.codec.split(' · ')[0]} · {record.format}
        </span>
      )}
      {info.recording && stats && health && (
        <span className="flex shrink-0 items-center gap-2.5 text-[11px] tabular-nums">
          <span style={{ color: LEVEL_COLOR[health.cpu] }}>CPU {Math.round(stats.cpuUsage)}%</span>
          <span className="text-slate-300">{Math.round(stats.activeFps)} FPS</span>
          <HealthWarning health={health} />
        </span>
      )}
    </div>
  )
}

/**
 * Grosse Variante fuers obere OLED. Kopfzeile: Badge + die eine gemeinsame Zeit (bei gleichzeitiger Aufnahme zusaetzlich ein kleines
 * Rec-Badge). Stream-Teil: Twitch-Angaben, Bitrate samt Codec. Aufnahme-Teil: Codec, Format, Audiospuren und Leistungswerte - laufen
 * beide gleichzeitig, werden die Aufnahme-Details auf eine Zeile verdichtet.
 */
export function HeaderStreamLarge({ info, bordered = false }: { info: StreamInfo; bordered?: boolean }) {
  if (!info.kind) return null
  const { twitch, stats, health } = info
  const both = info.streaming && info.recording
  const record = stats?.record
  const streamCodec = stats ? streamCodecText(stats) : null
  const diskTitle = 'Freier Speicher auf dem Aufnahme-Laufwerk'
  return (
    <div className={`relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5 ${bordered ? 'border-l border-white/10 pl-5' : ''}`} title={twitch?.title ?? undefined}>
      <div className="flex items-center gap-2.5">
        <Badge kind={info.kind} paused={info.paused && info.kind === 'record'} />
        <span className="font-mono text-[20px] font-bold leading-none tabular-nums text-slate-50">{info.kind === 'record' && info.paused ? 'PAUSE' : info.time}</span>
        {both && <Badge kind="record" paused={info.paused} small />}
        {both && info.paused && <span className="font-mono text-[10px] font-bold text-[#ffb347]">PAUSE</span>}
        {health && !both && <HealthWarning health={health} withText />}
      </div>
      {twitch && ((twitch.showCategory && twitch.game) || twitch.showViewers || (twitch.showSubs && twitch.subsAvailable && twitch.subs != null)) && (
        <span className="flex min-w-0 items-center gap-3">
          {twitch.showCategory && twitch.game && <span className="truncate text-[13px] font-bold leading-tight text-[#bf94ff]">{twitch.game}</span>}
          <span className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
            <Counts twitch={twitch} size={14} />
          </span>
        </span>
      )}
      {twitch?.showTitle && twitch.title && !both && <span className="truncate text-[11px] leading-tight text-slate-300">{twitch.title}</span>}

      {info.streaming && stats && (
        <span className="flex min-w-0 items-center gap-2 truncate font-mono text-[12px] font-bold tabular-nums leading-tight">
          <StreamBitrate stats={stats} />
          {streamCodec && <span className="truncate font-normal text-slate-400">· {streamCodec}</span>}
        </span>
      )}
      {info.streaming && !info.recording && !twitch && stats && (
        <span className="flex items-center gap-3 font-mono text-[11px] tabular-nums leading-tight text-slate-300">
          <span>CPU {Math.round(stats.cpuUsage)} %</span>
          <span>{Math.round(stats.activeFps)} FPS</span>
          {stats.outputWidth > 0 && <span className="text-slate-400">{stats.outputWidth}×{stats.outputHeight}</span>}
        </span>
      )}

      {info.recording && record && (
        <span className="flex min-w-0 items-center gap-2 truncate font-mono text-[12px] font-bold leading-tight text-slate-100" title={`Aufnahme: ${record.codec} · ${record.format} · ${trackText(record.tracks)}`}>
          <span className="shrink-0 text-[#ff8a8a]">{record.codec}</span>
          <span className="shrink-0 font-normal text-slate-400">· {record.format}</span>
          <span className="truncate font-normal text-slate-400">· {trackText(record.tracks)}</span>
        </span>
      )}
      {info.recording && stats && health && !both && (
        <>
          <span className="flex items-center gap-3 font-mono text-[12px] font-bold tabular-nums leading-tight">
            <span style={{ color: LEVEL_COLOR[health.cpu] }} title="CPU-Auslastung von OBS">
              CPU {Math.round(stats.cpuUsage)} %
            </span>
            <span className="text-slate-200" title="Aktuelle Bildrate von OBS">
              {Math.round(stats.activeFps)} FPS
            </span>
            {stats.outputWidth > 0 && (
              <span
                className="text-slate-400"
                title={
                  stats.baseWidth !== stats.outputWidth || stats.baseHeight !== stats.outputHeight
                    ? `Leinwand (Basis) ${stats.baseWidth}×${stats.baseHeight} → Ausgabe ${stats.outputWidth}×${stats.outputHeight}`
                    : `Leinwand und Ausgabe ${stats.outputWidth}×${stats.outputHeight}`
                }
              >
                {stats.outputWidth}×{stats.outputHeight}
              </span>
            )}
          </span>
          <span className="flex items-center gap-3 font-mono text-[11px] tabular-nums leading-tight">
            <span style={{ color: LEVEL_COLOR[health.frames] }} title="Verworfene Frames (Encoding- und Render-Lag zusammen)">
              Verworfen {stats.outputSkippedFrames + stats.renderSkippedFrames}
            </span>
            {stats.availableDiskSpaceMb > 0 && (
              <span style={{ color: LEVEL_COLOR[health.disk] }} title={diskTitle}>
                Frei {Math.round(stats.availableDiskSpaceMb / 1024)} GB
              </span>
            )}
            {stats.outputBytes > 0 && (
              <span className="text-slate-400" title="Bisher geschriebene Dateigroesse der Aufnahme">
                Datei {formatBytes(stats.outputBytes)}
              </span>
            )}
          </span>
          {(stats.recordPath || stats.recordDirectory) && (
            <span className="truncate font-mono text-[10px] leading-tight text-slate-500" title={stats.recordPath ?? stats.recordDirectory ?? undefined}>
              {stats.recordPath ? shortenPath(stats.recordPath) : `→ ${shortenPath(stats.recordDirectory!)}`}
            </span>
          )}
        </>
      )}
      {both && stats && health && (
        <span className="flex min-w-0 items-center gap-3 truncate font-mono text-[11px] tabular-nums leading-tight">
          <span style={{ color: LEVEL_COLOR[health.cpu] }} title="CPU-Auslastung von OBS">CPU {Math.round(stats.cpuUsage)} %</span>
          <span className="text-slate-200" title="Aktuelle Bildrate von OBS">{Math.round(stats.activeFps)} FPS</span>
          <span style={{ color: LEVEL_COLOR[health.frames] }} title="Verworfene Frames (Encoding- und Render-Lag zusammen)">Verworfen {stats.outputSkippedFrames + stats.renderSkippedFrames}</span>
          {stats.outputBytes > 0 && <span className="text-slate-400" title="Bisher geschriebene Dateigroesse der Aufnahme">Datei {formatBytes(stats.outputBytes)}</span>}
          <HealthWarning health={health} />
        </span>
      )}
    </div>
  )
}
