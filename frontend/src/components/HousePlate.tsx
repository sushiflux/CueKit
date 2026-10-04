import type { CSSProperties, ReactNode } from 'react'
import { HOUSE_PLATE_FRAME_PAD, HOUSE_PLATE_PRESETS, HOUSE_PLATE_WELL_PAD } from '../lib/housePlates'

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
          
          {/* Side glowing dots */}
          <div className={`absolute top-1/2 left-0 w-1.5 h-8 -translate-y-1/2 bg-cyan-400 rounded-r-md shadow-[0_0_10px_#22d3ee] pointer-events-none`} />
          <div className={`absolute top-1/2 right-0 w-1.5 h-8 -translate-y-1/2 bg-pink-500 rounded-l-md shadow-[0_0_10px_#ec4899] pointer-events-none`} />
        </div>
      )
    }

    if (model === 'sushiflux') {
      const isSnow = preset.key.includes('snow')
      
      return (
        <div
          className={`relative flex flex-col rounded-3xl ${isSnow ? 'border border-slate-200/80 shadow-[0_30px_90px_rgba(0,0,0,0.15)]' : 'border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.8)]'} select-none ${
            preview ? 'p-3' : 'px-6 pt-6 pb-6'
          } ${className ?? ''}`}
          style={{ background: preset.surface }}
        >
          {/* Underglow Reflection (Tischplatte) */}
          <div className={`absolute -inset-3 top-8 bg-gradient-to-r from-orange-500 via-rose-500 to-cyan-500 blur-2xl ${isSnow ? 'opacity-30' : 'opacity-40'} animate-sf-gradient pointer-events-none -z-10 rounded-[3rem]`} />

          {/* Header */}
          <div className={`flex items-center justify-center ${preview ? 'mb-2' : 'mb-4'} select-none pointer-events-none z-10 w-full`}>
             <span className={`${preview ? 'text-[11px]' : 'text-sm'} font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-rose-400 to-cyan-400 animate-sf-gradient ${isSnow ? 'drop-shadow-[0_0_8px_rgba(251,146,60,0.2)]' : 'drop-shadow-[0_0_8px_rgba(251,146,60,0.4)]'}`}>
                SUSHIFLUX
             </span>
          </div>

          {/* Recessed Area */}
          <div className={`flex-1 z-10 rounded-xl ${isSnow ? 'bg-slate-900/90 shadow-[inset_0_5px_30px_rgba(0,0,0,0.5)] ring-1 ring-slate-950/20' : 'bg-black/80 shadow-[inset_0_5px_30px_rgba(0,0,0,1)] ring-1 ring-white/5'} backdrop-blur-md ${preview ? 'p-2' : 'p-4'}`}>
            {children}
          </div>

          {/* Bottom LED Curve (Hardware-Leiste) - goes into the rounded corners */}
          {preset.hardware.underglow && (
            <div className={`absolute bottom-0 inset-x-0 ${preview ? 'h-6' : 'h-10'} overflow-hidden rounded-b-3xl pointer-events-none z-20`}>
              <div className={`absolute ${preview ? '-top-6' : '-top-10'} bottom-0 inset-x-0 rounded-3xl ${preview ? 'p-[2px]' : 'p-[3px]'} bg-gradient-to-r from-orange-500 via-rose-500 to-cyan-500 animate-sf-gradient`} style={{ WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
            </div>
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
