import type { CSSProperties, ReactNode } from 'react'
import { HOUSE_PLATE_FRAME_PAD, HOUSE_PLATE_PRESETS, HOUSE_PLATE_WELL_PAD } from '../lib/housePlates'
import { useStore } from '../state/store'
import { HeaderNowPlaying, HeaderNowPlayingLarge, NowPlayingProgress } from './HeaderNowPlaying'
import { HeaderTelemetry } from './HeaderTelemetry'
import { HeaderStreamChip, HeaderStreamLarge, useStreamInfo } from './HeaderStream'

interface Props {
  /** Preset-Key ("house:<key>") oder leer/unbekannt - dann kein Gehaeuse, nur die App-Flaeche. */
  plateKey: string | undefined | null
  children: ReactNode
  className?: string
  deckName?: string
  pageName?: string
  keyCount?: number
  preview?: boolean
  /** Grosses oberes OLED (Cover + Titel/Interpret/Album untereinander) statt der einen Zeile - nur SushiFlux-Plates, nicht in der Vorschau. */
  oledLarge?: boolean
}

/** Haupt-Zone des grossen OLED: Wiedergabe und/oder Stream. Laufen beide, zieht sich die Wiedergabe zusammen und der Stream steht daneben. */
function HeaderMainLarge() {
  const playing = useStore((s) => !!s.nowPlaying)
  const stream = useStreamInfo()
  if (!playing && !stream.kind) return <HeaderNowPlayingLarge /> // Platzhalter "Keine Wiedergabe"
  return (
    <div className="relative z-10 flex min-w-0 flex-1 items-stretch gap-5">
      {playing && (
        <div className={`flex min-w-0 ${stream.kind ? 'flex-[1.1]' : 'flex-1'}`}>
          <HeaderNowPlayingLarge compact={!!stream.kind} />
        </div>
      )}
      {stream.kind && (
        <div className={`flex min-w-0 ${playing ? 'flex-1' : 'flex-1'}`}>
          <HeaderStreamLarge info={stream} bordered={playing} />
        </div>
      )}
    </div>
  )
}

/**
 * Austauschbare Gehaeuse-Fassung UM das Tastenraster herum - wirkt wie das echte Hardware-Gehaeuse.
 * Unterstuetzt sowohl klassische Metall-Plates als auch das "CueDeck Studio Pro"-Enclosure aus dem
 * offiziellen Marketing-Video inklusive Status-LED, Eckschrauben und RGB-Underglow.
 */
export function HousePlate({ plateKey, children, className, deckName, pageName, keyCount, preview, oledLarge }: Props) {
  const appearance = useStore((s) => s.appearance)
  const preset = plateKey ? HOUSE_PLATE_PRESETS.find((p) => p.key === plateKey) : undefined

  if (!preset) return <div className={className}>{children}</div>

  // Hardware-Enclosure
  if (preset.hardware) {
    const model = preset.hardware.model ?? 'studio'

    if (model === 'cyber') {
      return (
        <div
          className={`relative flex flex-col rounded-xl border-[3px] border-t-pink-500/60 border-b-cyan-400/60 border-x-transparent shadow-[0_20px_60px_rgba(236,72,153,0.3)] select-none overflow-hidden ${
            preview ? 'p-3' : 'px-6 pt-5 pb-5'
          } ${className ?? ''}`}
          style={{ background: preset.surface }}
        >
          {/* Cyber Diagonal Stripes Background */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #ec4899 0, #ec4899 1px, transparent 1px, transparent 12px)' }} />
          
          <div className={`flex items-center justify-between px-2 ${preview ? 'mb-2' : 'mb-3.5'} select-none pointer-events-none z-10`}>
             <span className={`${preview ? 'text-[10px]' : 'text-xs'} font-black tracking-widest text-pink-400 uppercase drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]`}>
                NEON // {keyCount ? keyCount : 'CORE'}
             </span>
             <span className={`${preview ? 'text-[9px]' : 'text-[11px]'} font-bold text-cyan-400 tracking-widest`}>
                [ {deckName ? deckName.toUpperCase() : 'SYS'} ]
             </span>
          </div>

          <div className={`flex-1 z-10 rounded-none bg-black/70 border border-pink-500/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.9)] ${preview ? 'p-1' : 'p-3'}`}>
            {children}
          </div>
          
          {/* Hardware Bottom Underglow LED Strip */}
          {preset.hardware.underglow && (
            <div
              className={`${preview ? 'mt-2 h-1' : 'mt-3.5 h-1.5'} z-10 rounded-full ${
                typeof preset.hardware.underglow === 'string'
                  ? preset.hardware.underglow
                  : ''
              } pointer-events-none`}
            />
          )}

          {/* Side glowing dots */}
          <div className={`absolute top-1/2 left-0 w-1.5 h-8 -translate-y-1/2 bg-cyan-400 rounded-r-md shadow-[0_0_10px_#22d3ee] pointer-events-none`} />
          <div className={`absolute top-1/2 right-0 w-1.5 h-8 -translate-y-1/2 bg-pink-500 rounded-l-md shadow-[0_0_10px_#ec4899] pointer-events-none`} />
        </div>
      )
    }

    if (model === 'sushiflux') {
      const isSnow = preset.key.includes('snow')
      
      const colors = appearance?.ledColors?.length ? appearance.ledColors : ['#a78bfa', '#f472b6', '#7dd3fc', '#a78bfa']
      const duration = `${appearance?.ledSpeed ?? 4}s`
      const effect = preset.hardware?.supportsRGB ? (appearance?.ledEffect || 'sweep') : 'static'

      const getLedClass = (dir: 'r' | 'l' | 'b' | 't') => {
        if (effect === 'sweep' || effect === 'rainbow') return `anim-sf-sweep-${dir === 'r' || dir === 'l' ? 'x' : 'y'}-${dir === 'r' || dir === 'b' ? 'fwd' : 'rev'}`
        if (effect === 'breathe') return 'anim-sf-breathe'
        if (effect === 'blink') return 'anim-sf-blink'
        return ''
      }

      const getLedStyle = (dir: 'right' | 'left' | 'bottom' | 'top', delaySec: number) => {
        let sequence = colors
        if (effect === 'rainbow') {
          sequence = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ef4444']
        } else if (colors.length === 1) {
          sequence = [colors[0], colors[0]]
        } else if (effect === 'sweep') {
          sequence = [...colors, ...colors, colors[0]]
        }
        
        const stops = sequence.map((c, i) => `${c} ${(i / (sequence.length - 1)) * 100}%`).join(', ')
        const isAnimated = effect === 'sweep' || effect === 'rainbow'
        
        return {
          backgroundImage: `linear-gradient(to ${dir}, ${stops})`,
          backgroundSize: isAnimated && sequence.length > 1 ? (dir === 'right' || dir === 'left' ? '200% 100%' : '100% 200%') : undefined,
          animationDelay: isAnimated ? `${delaySec}s` : '0s',
        } as React.CSSProperties
      }
      
      return (
        <div
          className={`relative flex flex-col rounded-3xl select-none ${
            preview ? 'p-3' : 'px-6 pt-6 pb-6'
          } ${className ?? ''} isolate`}
          style={preset.hardware?.supportsRGB ? {
            '--led-duration': duration,
          } as React.CSSProperties : undefined}
        >
          {/* 1. Deepest Layer: Black Drop Shadow */}
          <div className={`absolute inset-2 bg-black rounded-3xl ${isSnow ? 'shadow-[0_30px_90px_rgba(0,0,0,0.15)]' : 'shadow-[0_40px_100px_rgba(0,0,0,0.8)]'} pointer-events-none -z-30`} />

          {/* 2. Middle Layer: Neon Underglow (Left, Right) with Synchronized Clockwise Animation */}
          <div className={`absolute top-10 bottom-10 left-4 w-8 ${getLedClass('t')} blur-[32px] ${isSnow ? 'opacity-90' : 'opacity-100'} pointer-events-none -z-20`} style={getLedStyle('top', -3)} />
          <div className={`absolute top-10 bottom-10 right-4 w-8 ${getLedClass('b')} blur-[32px] ${isSnow ? 'opacity-90' : 'opacity-100'} pointer-events-none -z-20`} style={getLedStyle('bottom', -1)} />

          {/* 3. Front Layer: Opaque Plate Surface (Matches Studio Pro) */}
          <div 
            className={`absolute inset-0 rounded-3xl pointer-events-none -z-10 ${isSnow ? 'border border-slate-200/80' : 'border border-white/5'}`}
            style={{ background: preset.surface }}
          />

          {/* Grosses OLED: schmale Kopfzeile (Seite links, Marke rechts), darunter links Wiedergabe mit Cover, rechts die Hardwarewerte */}
          {oledLarge && !preview && (
            <div className={`relative mx-auto mb-3.5 flex h-[108px] w-full flex-col gap-1.5 rounded-xl bg-[#07090e] px-4 py-2 ${isSnow ? 'border border-slate-300/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),0_2px_4px_rgba(0,0,0,0.06)]' : 'border border-white/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.5)]'} pointer-events-none z-20 select-none overflow-hidden`}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
              <div className="relative z-10 flex h-4 shrink-0 items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                  Seite // <span className="font-bold text-cyan-300">{pageName ? pageName.toUpperCase() : 'STANDARD'}</span>
                </span>
                <span className={`text-[11px] font-black tracking-[0.25em] text-transparent bg-clip-text ${getLedClass('r')}`} style={getLedStyle('right', 0)}>
                  SUSHIFLUX
                </span>
              </div>
              <div className="relative z-10 flex min-h-0 flex-1 items-center gap-6">
                <HeaderMainLarge />
                <HeaderTelemetry tiles />
              </div>
            </div>
          )}

          {/* OLED / LED Display Bar */}
          <div className={`${oledLarge && !preview ? 'hidden ' : ''}relative flex items-center justify-between mx-auto w-full ${preview ? 'h-7 px-2.5 mb-2 rounded-lg' : 'h-10 px-4 mb-3.5 rounded-xl'} bg-[#07090e] border ${isSnow ? 'border-slate-300/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),0_2px_4px_rgba(0,0,0,0.06)]' : 'border-white/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.5)]'} select-none pointer-events-none z-20 overflow-hidden`}>
            {!preview && <NowPlayingProgress />}
            {/* Subtle OLED Glass Sheen & Scanlines */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.035] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:3px_3px]" />

            {/* Left: Active Page Indicator & Name */}
            <div className="relative flex items-center gap-2 min-w-0 z-10">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSnow ? 'bg-sky-400 opacity-75' : 'bg-cyan-400 opacity-75'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isSnow ? 'bg-sky-500 shadow-[0_0_6px_#0ea5e9]' : 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]'}`} />
              </span>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className={`${preview ? 'text-[7px]' : 'text-[9px]'} font-mono uppercase tracking-widest text-slate-400/90 shrink-0`}>
                  SEITE //
                </span>
                <span className={`${preview ? 'text-[9px]' : 'text-[11px]'} font-mono font-bold tracking-wider truncate ${isSnow ? 'text-slate-100 drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]' : 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]'}`}>
                  {pageName ? pageName.toUpperCase() : 'STANDARD'}
                </span>
              </div>
            </div>

            {/* Mitte: Live-Hardwarewerte (CPU/GPU/RAM, Auslastung + Temperatur); in der Vorschau nur dekorative Punkte */}
            {preview ? (
              <div className="hidden min-[420px]:flex items-center gap-1 opacity-30 px-2">
                <div className="h-1 w-1 rounded-full bg-slate-400" />
                <div className="h-1 w-1 rounded-full bg-slate-400" />
                <div className="h-1 w-1 rounded-full bg-slate-400" />
              </div>
            ) : (
              <>
                <HeaderNowPlaying />
                <HeaderStreamChip />
                <HeaderTelemetry />
              </>
            )}

            {/* Right: SUSHIFLUX illuminated brand name */}
            <div className="relative flex items-center shrink-0 z-10">
              <span className={`${preview ? 'text-[9px]' : 'text-xs'} font-black tracking-[0.25em] text-transparent bg-clip-text ${getLedClass('r')} ${isSnow ? 'drop-shadow-[0_0_8px_rgba(251,146,60,0.4)]' : 'drop-shadow-[0_0_10px_rgba(251,146,60,0.5)]'}`} style={getLedStyle('right', 0)}>
                SUSHIFLUX
              </span>
            </div>
          </div>

          {/* Recessed Area with Visible Plate Frame Between Buttons */}
          <div className={`flex-1 z-10 rounded-2xl ${isSnow ? 'bg-slate-900/10 shadow-[inset_0_4px_16px_rgba(0,0,0,0.22)] border border-slate-300/80 ring-1 ring-white/40' : 'bg-black/35 shadow-[inset_0_5px_24px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5'} backdrop-blur-sm ${preview ? 'p-1.5' : 'p-3'}`}>
            {children}
          </div>

          {/* Hardware Bottom Underglow LED Strip */}
          {preset.hardware.underglow && (
            <div
              className={`absolute bottom-[1px] left-8 right-8 ${preview ? 'h-1' : 'h-[5px]'} z-10 rounded-t-md ${
                typeof preset.hardware.underglow === 'string'
                  ? preset.hardware.underglow
                  : getLedClass('l')
              } pointer-events-none`}
              style={typeof preset.hardware.underglow !== 'string' ? getLedStyle('left', -2) : undefined}
            />
          )}
        </div>
      )
    }

    if (model === 'notch') {
      const isSnow = preset.key.includes('snow')
      
      return (
        <div
          className={`relative flex flex-col rounded-2xl select-none ${
            preview ? 'p-3' : 'px-6 pt-5 pb-5'
          } ${className ?? ''} isolate`}
          style={{ background: preset.surface }}
        >
          {/* Outer Chassis Shadow */}
          <div className={`absolute inset-0 rounded-2xl ${isSnow ? 'shadow-[0_25px_70px_rgba(0,0,0,0.18)] border border-slate-300' : 'shadow-[0_35px_90px_rgba(0,0,0,0.85)] border border-white/10'} pointer-events-none -z-20`} />

          {/* 1. TOP ASYMMETRICAL NOTCH-LEISTE (Variable thickness 2.5mm to 8mm with angled cuts) */}
          <div className="relative w-full mb-3 pointer-events-none z-10 flex items-center justify-between">
            {/* Left part: thin 2.5mm notch rail */}
            <div className={`h-[3px] w-12 rounded-full ${isSnow ? 'bg-slate-400/80' : 'bg-amber-500/70 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
            
            {/* Center-left: Angled stepped notch cutout with status LED & tactile ribs */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${isSnow ? 'bg-slate-200/90 border border-slate-300 text-slate-800' : 'bg-black/70 border border-amber-500/40 text-amber-300'} shadow-inner`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${isSnow ? 'bg-sky-500 shadow-[0_0_6px_#0ea5e9]' : 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'}`} />
              <span className="text-[10px] font-mono font-black tracking-widest uppercase">
                APEX // {keyCount ? `${keyCount}K` : 'TAC'}
              </span>
              <span className="text-[9px] font-mono opacity-60">
                [ {pageName ? pageName.toUpperCase() : (deckName ? deckName.toUpperCase() : 'STANDARD')} ]
              </span>
            </div>

            {/* Right part: thick 7mm stepped notch rail tapering to 3mm */}
            <div className="flex items-center gap-1">
              <div className={`h-[7px] w-10 rounded-sm ${isSnow ? 'bg-slate-400/90' : 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]'}`} />
              <div className={`h-[3px] w-6 rounded-full ${isSnow ? 'bg-slate-300' : 'bg-amber-500/50'}`} />
            </div>
          </div>

          {/* 2. LEFT ASYMMETRICAL NOTCH-LEISTE (Tactical grip notch, expanding from 2.5mm to 8mm) */}
          <div className="absolute left-0 top-1/3 -translate-y-1/2 flex flex-col items-start pointer-events-none z-20">
            {/* Thin entry 2.5mm */}
            <div className={`w-[2.5px] h-4 ${isSnow ? 'bg-slate-400' : 'bg-amber-500/60'}`} />
            {/* Expanded 8mm tactical grip notch with segmented cutouts */}
            <div className={`w-2.5 h-16 rounded-r-md ${isSnow ? 'bg-slate-700 border-y border-r border-slate-400' : 'bg-zinc-900 border-y border-r border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.4)]'} flex flex-col justify-around py-1 px-[2px]`}>
              <div className={`h-[2px] w-full rounded-sm ${isSnow ? 'bg-sky-400' : 'bg-amber-400'}`} />
              <div className={`h-[2px] w-full rounded-sm ${isSnow ? 'bg-sky-400' : 'bg-amber-400'}`} />
              <div className={`h-[2px] w-full rounded-sm ${isSnow ? 'bg-sky-400' : 'bg-amber-400'}`} />
            </div>
            {/* Tapering 3mm */}
            <div className={`w-[3px] h-6 ${isSnow ? 'bg-slate-400' : 'bg-amber-500/40'}`} />
          </div>

          {/* 3. RIGHT ASYMMETRICAL NOTCH-LEISTE (Offset lower-middle accent slot 3mm to 7mm) */}
          <div className="absolute right-0 top-2/3 -translate-y-1/2 flex flex-col items-end pointer-events-none z-20">
            <div className={`w-[3px] h-8 ${isSnow ? 'bg-slate-400' : 'bg-amber-500/40'}`} />
            {/* Glowing notch runner */}
            <div className={`w-2 h-14 rounded-l-md ${isSnow ? 'bg-sky-500 shadow-[0_0_12px_#0ea5e9]' : 'bg-gradient-to-b from-amber-400 to-orange-500 shadow-[0_0_14px_rgba(245,158,11,0.8)]'}`} />
            <div className={`w-[2px] h-6 ${isSnow ? 'bg-slate-300' : 'bg-amber-500/30'}`} />
          </div>

          {/* 4. KEY GRID WELL (Faceplate surface visible between keys for tactile frame) */}
          <div className={`flex-1 z-10 rounded-xl ${isSnow ? 'bg-slate-900/10 shadow-[inset_0_4px_16px_rgba(0,0,0,0.18)] border border-slate-300/80 ring-1 ring-white/50' : 'bg-black/35 shadow-[inset_0_5px_22px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5'} backdrop-blur-sm ${preview ? 'p-1.5' : 'p-3'}`}>
            {children}
          </div>

          {/* 5. BOTTOM ASYMMETRICAL NOTCH-LEISTE (Variable thickness 2mm to 9mm with ribbed ventilation) */}
          <div className="relative w-full mt-3 pointer-events-none z-10 flex items-center justify-between">
            {/* Left: 7mm ribbed notch bar */}
            <div className="flex items-center gap-1.5">
              <div className={`h-[7px] w-8 rounded-sm ${isSnow ? 'bg-slate-700' : 'bg-zinc-800 border border-amber-500/40'}`} />
              <div className={`h-[5px] w-4 rounded-sm ${isSnow ? 'bg-slate-400' : 'bg-amber-500/60'}`} />
              <div className={`h-[3px] w-12 rounded-full ${isSnow ? 'bg-slate-300' : 'bg-amber-500/30'}`} />
            </div>

            {/* Right: 3mm thin rail transitioning into accent underglow */}
            <div className={`h-[3px] w-20 rounded-full ${isSnow ? 'bg-slate-400' : 'bg-gradient-to-r from-amber-500/30 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
          </div>
        </div>
      )
    }

    return (
      <div
        className={`relative flex flex-col rounded-[28px] border-[2px] border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.85)] select-none ${
          preview ? 'p-3 rounded-2xl' : 'px-6 pt-5 pb-5'
        } ${className ?? ''}`}
        style={{ background: preset.surface }}
      >
        {/* Chamfer Top Highlight */}
        {preset.hardware.chamferHighlight && (
          <div className="absolute inset-x-8 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent pointer-events-none" />
        )}

        {/* Metallic Corner Screws */}
        {preset.hardware.screws && (
          <>
            <div
              className={`absolute ${preview ? 'top-1.5 left-1.5 w-2 h-2' : 'top-3 left-3 w-3 h-3'} rounded-full bg-slate-600 border border-slate-400 shadow-inner flex items-center justify-center pointer-events-none`}
            >
              <div className="w-[60%] h-[1px] bg-slate-800 rotate-45" />
            </div>
            <div
              className={`absolute ${preview ? 'top-1.5 right-1.5 w-2 h-2' : 'top-3 right-3 w-3 h-3'} rounded-full bg-slate-600 border border-slate-400 shadow-inner flex items-center justify-center pointer-events-none`}
            >
              <div className="w-[60%] h-[1px] bg-slate-800 -rotate-45" />
            </div>
            <div
              className={`absolute ${preview ? 'bottom-1.5 left-1.5 w-2 h-2' : 'bottom-3 left-3 w-3 h-3'} rounded-full bg-slate-600 border border-slate-400 shadow-inner flex items-center justify-center pointer-events-none`}
            >
              <div className="w-[60%] h-[1px] bg-slate-800 -rotate-45" />
            </div>
            <div
              className={`absolute ${preview ? 'bottom-1.5 right-1.5 w-2 h-2' : 'bottom-3 right-3 w-3 h-3'} rounded-full bg-slate-600 border border-slate-400 shadow-inner flex items-center justify-center pointer-events-none`}
            >
              <div className="w-[60%] h-[1px] bg-slate-800 rotate-45" />
            </div>
          </>
        )}

        {/* Hardware Header Label */}
        {preset.hardware.header && (
          <div className={`flex items-center justify-between px-2 ${preview ? 'mb-2' : 'mb-3.5'} select-none pointer-events-none`}>
            <div className="flex items-center gap-2">
              <div
                className={`${preview ? 'w-2 h-2' : 'w-2.5 h-2.5'} rounded-full animate-pulse`}
                style={{
                  backgroundColor: preset.hardware.ledColor ?? '#34d399',
                  boxShadow: `0 0 8px ${preset.hardware.ledColor ?? '#34d399'}`,
                }}
              />
              <span className={`${preview ? 'text-[10px]' : 'text-xs'} font-black tracking-widest ${preset.hardware.textColor || 'text-slate-200'} uppercase`}>
                CueDeck {keyCount ? `· ${keyCount} Keys` : '· Studio'}
              </span>
            </div>
            {!preview && <HeaderTelemetry />}
            <div className={`${preview ? 'text-[9px]' : 'text-[11px]'} font-bold ${preset.hardware.textColor || 'text-slate-400'} tracking-wider uppercase`}>
              PROFILE: <span className={`${preset.hardware.accentColor || 'text-cyan-400'} font-black`}>{deckName ? deckName.toUpperCase() : 'STREAMING'}</span>
            </div>
          </div>
        )}

        {/* Recessed Key Slot Grid Area */}
        <div className={`flex-1 rounded-2xl bg-black/45 border border-white/5 shadow-inner ${preview ? 'p-1' : 'p-3'}`}>
          {children}
        </div>

        {/* Hardware Bottom Underglow LED Strip */}
        {preset.hardware.underglow && (
          <div
            className={`${preview ? 'mt-2 h-1' : 'mt-3.5 h-1.5'} rounded-full ${
              typeof preset.hardware.underglow === 'string'
                ? preset.hardware.underglow
                : 'bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 shadow-[0_0_15px_rgba(6,182,212,0.85)]'
            } pointer-events-none`}
          />
        )}
      </div>
    )
  }

  // Klassische Metall-Plates
  const frameStyle: CSSProperties = {
    padding: HOUSE_PLATE_FRAME_PAD,
    background: preset.surface,
    boxShadow: [
      '0 18px 40px -12px rgba(0,0,0,0.45)',
      '0 4px 10px -2px rgba(0,0,0,0.3)',
      `inset 0 1px 0 ${preset.sheen}`,
      'inset 0 -1px 0 rgba(0,0,0,0.25)',
    ].join(', '),
  }

  const wellStyle: CSSProperties = {
    padding: HOUSE_PLATE_WELL_PAD,
    boxShadow: ['inset 0 0 0 1px rgba(0,0,0,0.34)', `0 0 0 1px ${preset.sheen}`, 'inset 0 2px 5px rgba(0,0,0,0.22)'].join(', '),
  }

  return (
    <div className={`house-plate-frame ${className ?? ''}`} style={frameStyle}>
      <div className="house-plate-well" style={wellStyle}>
        {children}
      </div>
    </div>
  )
}
