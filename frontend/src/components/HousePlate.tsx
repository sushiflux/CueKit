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

  // Hardware-Enclosure (CueDeck Studio Pro, exakt wie im Marketing-Video)
  if (preset.hardware) {
    return (
      <div
        className={`relative flex flex-col rounded-[28px] border-[2px] border-white/15 bg-gradient-to-b from-[#1b1e30] via-[#121422] to-[#0a0c16] shadow-[0_30px_90px_rgba(0,0,0,0.85)] select-none ${
          preview ? 'p-3 rounded-2xl' : 'px-6 pt-5 pb-5'
        } ${className ?? ''}`}
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
              <span className={`${preview ? 'text-[10px]' : 'text-xs'} font-black tracking-widest text-slate-200 uppercase`}>
                CueDeck {keyCount ? `· ${keyCount} Keys` : '· Studio'}
              </span>
            </div>
            <div className={`${preview ? 'text-[9px]' : 'text-[11px]'} font-bold text-slate-400 tracking-wider uppercase`}>
              PROFILE: <span className="text-cyan-400 font-black">{deckName ? deckName.toUpperCase() : 'STREAMING'}</span>
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
            className={`${preview ? 'mt-2 h-1' : 'mt-3.5 h-1.5'} rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 shadow-[0_0_15px_rgba(6,182,212,0.85)] pointer-events-none`}
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
