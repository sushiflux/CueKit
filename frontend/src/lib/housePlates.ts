/**
 * Austauschbare Gehaeuse-"Plates" fuer die Live-Deck-Ansicht - eine Fassung/ein Rahmen DIREKT UM
 * das Tastenraster herum (nicht die gesamte Bildschirmflaeche), die wie das physische Gehaeuse
 * eines echten CueDecks wirken soll: Material-/Oberflaechenwirkung, sichtbare Eckschrauben, Tiefenwirkung (Aussen-Schlagschatten + innere Fase zur Vertiefung,
 * in der das Tastenraster liegt) und ein leichter Randglanz. Reines CSS - keine externen Bild-
 * Downloads (CSP erlaubt nur 'self', die App muss offline funktionieren).
 *
 * Ersetzt den frueheren Vollflaechen-"Deck-Hintergrund" (vormals ebenfalls "Plate" genannt, siehe
 * die inzwischen entfernte lib/platePresets.ts) komplett - hier ist "Plate" jetzt ausschliesslich
 * der physische Gehaeuserahmen. Jeder Preset-Key wird unveraendert als appearance.background.plate
 * gespeichert (siehe AppearancePage.tsx / DeckPage.tsx).
 */

export interface HousePlatePreset {
  key: string
  name: string
  /** Kurzbeschreibung fuers Auswahl-Grid (Material-Charakter). */
  description: string
  /** Material-Flaeche des Rahmens (mehrschichtiger Gradient inkl. Buerstung + Noise). */
  surface: string
  /** Grundfarbe hinter den Gradient-Ebenen. */
  base: string
  /** Randfarbe der Schrauben-Koepfe (Metallschein-Basis). */
  /** Akzentfarbe fuer den feinen oberen Glanzrand. */
  sheen: string
  /** Optionales Hardware-Enclosure (wie im offiziellen Marketing-Video): Status-LED, Eckschrauben, RGB-Underglow. */
  hardware?: {
    model?: 'studio' | 'cyber' | 'stealth' | 'executive' | 'sushiflux' | 'notch'
    screws?: boolean
    header?: boolean
    underglow?: boolean | string
    chamferHighlight?: string
    ledColor?: string
    textColor?: string
    accentColor?: string
    supportsRGB?: boolean
  }
}

/** Breite des Gehaeuse-Rahmens und Innenabstand der Vertiefung (px) - zusammen der Platz, den die
 * Plate pro Seite um das Tastenraster herum braucht; DeckGrid rechnet ihn bei der Tastengroesse ein. */
export const HOUSE_PLATE_FRAME_PAD = 34
export const HOUSE_PLATE_WELL_PAD = 14
/** Mehrhoehe (px) des grossen oberen OLED gegenueber der einen Zeile (108 + 14 Abstand statt 40 + 14). */
export const OLED_LARGE_EXTRA = 68
export const HOUSE_PLATE_INSET = 52

/** Standard-Gehaeuse - auch Rueckfall fuer gespeicherte Schluessel entfernter Gehaeuse (z.B. frueherer Metall-/Farbvarianten). */
export const DEFAULT_HOUSE_PLATE = 'house:studiopro'

/** Gespeicherter Plate-Schluessel -> ein vorhandenes Gehaeuse (unbekannt/entfernt/leer -> Standard), damit nie ohne Rahmen angezeigt wird. */
export function resolvePlateKey(key: string | undefined | null): string {
  return key && HOUSE_PLATE_PRESETS.some((p) => p.key === key) ? key : DEFAULT_HOUSE_PLATE
}

export function hasHousePlate(key: string | undefined | null): boolean {
  return !!key && HOUSE_PLATE_PRESETS.some((p) => p.key === key)
}

export const HOUSE_PLATE_PRESETS: HousePlatePreset[] = [
  {
    key: 'house:studiopro',
    name: 'CueDeck Studio Pro',
    description: 'Hardware-Gehäuse aus dem Video: Status-LED, Eckschrauben & RGB-Underglow',
    base: '#121422',
    sheen: 'rgba(6, 182, 212, 0.45)',
    surface: 'linear-gradient(to bottom, #1b1e30 0%, #121422 50%, #0a0c16 100%)',
    hardware: {
      screws: true,
      header: true,
      underglow: true,
      chamferHighlight: 'rgba(6, 182, 212, 0.6)',
      ledColor: '#34d399',
    },
  },
  {
    key: 'house:studiopro_snow',
    name: 'CueDeck Studio Pro Snow',
    description: 'Strahlend weißes Pro-Gehäuse mit eisblauen Akzenten',
    base: '#e2e8f0',
    sheen: 'rgba(255, 255, 255, 0.9)',
    surface: 'linear-gradient(to bottom, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
    hardware: {
      screws: true,
      header: true,
      underglow: 'bg-gradient-to-r from-sky-300 via-blue-400 to-indigo-500 shadow-[0_0_15px_rgba(56,189,248,0.85)]',
      chamferHighlight: 'rgba(56, 189, 248, 0.5)',
      ledColor: '#38bdf8',
      textColor: 'text-slate-600',
      accentColor: 'text-sky-500',
    },
  },
  {
    key: 'house:studiopro_cyber',
    name: 'CueDeck Studio Pro Cyber',
    description: 'Neon-Cyberpunk-Look mit magentafarbenem Underglow',
    base: '#0f172a',
    sheen: 'rgba(236, 72, 153, 0.5)',
    surface: 'linear-gradient(to bottom, #1e293b 0%, #0f172a 50%, #020617 100%)',
    hardware: {
      model: 'cyber',
      screws: true,
      header: true,
      underglow: 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 shadow-[0_0_15px_rgba(236,72,153,0.85)]',
      chamferHighlight: 'rgba(236, 72, 153, 0.7)',
      ledColor: '#ec4899',
    },
  },
  {
    key: 'house:sushiflux',
    name: 'SushiFlux Limited Edition',
    description: 'Ultra-Premium High Class Edition – Exklusives SushiFlux Design',
    base: '#121422',
    sheen: 'rgba(6, 182, 212, 0.45)',
    surface: 'linear-gradient(to bottom, #1b1e30 0%, #121422 50%, #0a0c16 100%)',
    hardware: {
      model: 'sushiflux',
      screws: false,
      header: true,
      underglow: true,
      chamferHighlight: 'rgba(251, 146, 60, 0.8)',
      ledColor: '#fb923c',
      supportsRGB: true,
    },
  },
  {
    key: 'house:sushiflux_snow',
    name: 'SushiFlux Limited Edition Snow',
    description: 'Ultra-Premium High Class Edition – Strahlend weißes SushiFlux Design',
    base: '#e2e8f0',
    sheen: 'rgba(255, 255, 255, 0.9)',
    surface: 'linear-gradient(to bottom, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
    hardware: {
      model: 'sushiflux',
      screws: false,
      header: true,
      underglow: true,
      chamferHighlight: 'rgba(251, 146, 60, 0.4)',
      ledColor: '#fb923c',
      supportsRGB: true,
    },
  },
  {
    key: 'house:apex_notch',
    name: 'Apex Notch Dark',
    description: 'Cyber-Gehäuse mit asymmetrischen CNC-Notch-Leisten an allen 4 Kanten & Amber-Status',
    base: '#0f121d',
    sheen: 'rgba(245, 158, 11, 0.5)',
    surface: 'linear-gradient(135deg, #181c2b 0%, #0f121d 60%, #080a11 100%)',
    hardware: {
      model: 'notch',
      screws: true,
      header: true,
      underglow: 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 shadow-[0_0_15px_rgba(245,158,11,0.85)]',
      chamferHighlight: 'rgba(245, 158, 11, 0.7)',
      ledColor: '#f59e0b',
      textColor: 'text-amber-400',
      accentColor: 'text-orange-400',
    },
  },
  {
    key: 'house:apex_notch_snow',
    name: 'Apex Notch Snow',
    description: 'Strahlend weißes Arctic-Chassis mit asymmetrischen Graphit-Notch-Leisten & Polar-Cyan',
    base: '#f1f5f9',
    sheen: 'rgba(14, 165, 233, 0.7)',
    surface: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 60%, #cbd5e1 100%)',
    hardware: {
      model: 'notch',
      screws: true,
      header: true,
      underglow: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-indigo-500 shadow-[0_0_15px_rgba(14,165,233,0.85)]',
      chamferHighlight: 'rgba(14, 165, 233, 0.6)',
      ledColor: '#0ea5e9',
      textColor: 'text-slate-700',
      accentColor: 'text-sky-600',
    },
  },
]
