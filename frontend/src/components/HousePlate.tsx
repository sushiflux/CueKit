import type { CSSProperties, ReactNode } from 'react'
import { HOUSE_PLATE_FRAME_PAD, HOUSE_PLATE_PRESETS, HOUSE_PLATE_WELL_PAD } from '../lib/housePlates'

interface Props {
  /** Preset-Key ("house:<key>") oder leer/unbekannt - dann kein Gehaeuse, nur die App-Flaeche. */
  plateKey: string | undefined | null
  children: ReactNode
  className?: string
}

/**
 * Austauschbare Gehaeuse-Fassung UM das Tastenraster herum (nicht die ganze Seitenflaeche) - wirkt
 * wie das Metallgehaeuse eines echten Stream-Decks: durchgehende Material-Textur, die auch ZWISCHEN
 * den Tasten sichtbar bleibt (jede Taste sitzt in einer eigenen Aussparung, siehe .house-plate-slot in
 * index.css und DeckGrid), ein Aussen-Schlagschatten auf die App-Flaeche dahinter und eine feine Fase
 * um das Tastenfeld. Ohne bekannten plateKey wird nur children ohne Rahmen gerendert, die normale
 * --c-canvas-Flaeche bleibt sichtbar.
 */
export function HousePlate({ plateKey, children, className }: Props) {
  const preset = plateKey ? HOUSE_PLATE_PRESETS.find((p) => p.key === plateKey) : undefined

  if (!preset) return <div className={className}>{children}</div>

  const frameStyle: CSSProperties = {
    padding: HOUSE_PLATE_FRAME_PAD,
    background: preset.surface,
    boxShadow: [
      // Aussen-Schlagschatten auf den Canvas-Hintergrund dahinter
      '0 18px 40px -12px rgba(0,0,0,0.45)',
      '0 4px 10px -2px rgba(0,0,0,0.3)',
      // Leichter oberer Glanzrand am Gehaeusekoerper selbst
      `inset 0 1px 0 ${preset.sheen}`,
      'inset 0 -1px 0 rgba(0,0,0,0.25)',
    ].join(', '),
  }

  // Keine eigene Flaeche: das Metall des Rahmens laeuft unter und zwischen den Tasten durch. Nur eine
  // feine Fase (dunkle Kante + heller Saum) grenzt das Tastenfeld vom aeusseren Rahmen ab.
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
