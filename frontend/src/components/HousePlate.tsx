import type { CSSProperties, ReactNode } from 'react'
import { HOUSE_PLATE_FRAME_PAD, HOUSE_PLATE_PRESETS, HOUSE_PLATE_WELL_PAD } from '../lib/housePlates'
import { useStore } from '../state/store'

interface Props {
  /** Preset-Key ("house:<key>") oder leer/unbekannt - dann kein Gehaeuse, nur die App-Flaeche. */
  plateKey: string | undefined | null
  children: ReactNode
  className?: string
  deckName?: string
  keyCount?: number
  preview?: boolean
}

/**
 * Austauschbare Gehaeuse-Fassung UM das Tastenraster herum - wirkt wie das echte Hardware-Gehaeuse.
 * Unterstuetzt sowohl klassische Metall-Plates als auch das "CueDeck Studio Pro"-Enclosure aus dem
 * offiziellen Marketing-Video inklusive Status-LED, Eckschrauben und RGB-Underglow.
 */
export function HousePlate({ plateKey, children, className, deckName, keyCount, preview }: Props) {
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

          {/* Header */}
          <div className={`flex items-center justify-center ${preview ? 'mb-2' : 'mb-4'} select-none pointer-events-none z-10 w-full`}>
             <span className={`${preview ? 'text-[11px]' : 'text-sm'} font-black tracking-[0.2em] text-transparent bg-clip-text ${getLedClass('r')} ${isSnow ? 'drop-shadow-[0_0_8px_rgba(251,146,60,0.2)]' : 'drop-shadow-[0_0_8px_rgba(251,146,60,0.4)]'}`} style={getLedStyle('right', 0)}>
                SUSHIFLUX
             </span>
          </div>

          {/* Recessed Area */}
          <div className={`flex-1 z-10 rounded-xl ${isSnow ? 'bg-slate-900/90 shadow-[inset_0_5px_30px_rgba(0,0,0,0.5)] ring-1 ring-slate-950/20' : 'bg-black/80 shadow-[inset_0_5px_30px_rgba(0,0,0,1)] ring-1 ring-white/5'} backdrop-blur-md ${preview ? 'p-2' : 'p-4'}`}>
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
