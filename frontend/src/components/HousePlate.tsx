import type { CSSProperties, ReactNode } from 'react'
import { HOUSE_PLATE_FRAME_PAD, HOUSE_PLATE_PRESETS, HOUSE_PLATE_WELL_PAD } from '../lib/housePlates'

interface Props {
  /** Preset-Key ("house:<key>") oder leer/unbekannt - dann kein Gehaeuse, nur die App-Flaeche. */
  plateKey: string | undefined | null
  children: ReactNode
  className?: string
}

/** Eine realistisch wirkende Kreuzschlitzschraube als reines CSS-Konstrukt (radial-gradient fuer den
 * Metallschein + zwei duenne Balken fuers Schlitzkreuz) - kein Bild-Asset noetig. */
function Screw({ tone }: { tone: string }) {
  const style: CSSProperties = {
    background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, white 55%, ${tone}), ${tone} 45%, color-mix(in oklab, black 45%, ${tone}) 100%)`,
    boxShadow: `inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1px 2px rgba(0,0,0,0.45), 0 1px 1px rgba(0,0,0,0.35)`,
  }
  return (
    <span className="house-plate-screw" style={style} aria-hidden="true">
      <span className="house-plate-screw-slot house-plate-screw-slot-a" />
      <span className="house-plate-screw-slot house-plate-screw-slot-b" />
    </span>
  )
}

/**
 * Austauschbare Gehaeuse-Fassung UM das Tastenraster herum (nicht die ganze Seitenflaeche) - wirkt
 * wie das physische Gehaeuse eines echten Stream-Decks: Material-Textur, vier Eckschrauben, ein
 * Aussen-Schlagschatten auf die App-Flaeche dahinter sowie eine innere Fase/Vertiefung, in der das
 * Tastenraster (children) liegt. Ohne bekannten plateKey wird nur children ohne Rahmen gerendert,
 * die normale --c-canvas-Flaeche bleibt sichtbar (siehe index.css).
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

  const wellStyle: CSSProperties = {
    padding: HOUSE_PLATE_WELL_PAD,
    // Vertiefung/Fassung, in der das Tastenraster "liegt": innerer Schatten am Uebergang plus ein
    // Hauch der Grundfarbe, damit die Fase spuerbar zum Rahmen-Material gehoert statt neutral zu wirken.
    background: `color-mix(in oklab, ${preset.base} 22%, var(--c-canvas))`,
    boxShadow: ['inset 0 3px 8px rgba(0,0,0,0.5)', 'inset 0 -1px 0 rgba(255,255,255,0.06)', `inset 0 0 0 1px color-mix(in oklab, ${preset.base} 45%, black)`].join(', '),
  }

  return (
    <div className={`house-plate-frame ${className ?? ''}`} style={frameStyle}>
      <Screw tone={preset.screwTone} />
      <Screw tone={preset.screwTone} />
      <Screw tone={preset.screwTone} />
      <Screw tone={preset.screwTone} />
      <div className="house-plate-well" style={wellStyle}>
        {children}
      </div>
    </div>
  )
}
