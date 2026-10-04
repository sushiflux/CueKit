/**
 * Austauschbare Gehaeuse-"Plates" fuer die Live-Deck-Ansicht - eine Fassung/ein Rahmen DIREKT UM
 * das Tastenraster herum (nicht die gesamte Bildschirmflaeche), die wie das physische Gehaeuse
 * eines echten Stream-Decks wirken soll: Material-/Oberflaechentextur (gebuerstetes Metall, Carbon,
 * ...), sichtbare Eckschrauben, Tiefenwirkung (Aussen-Schlagschatten + innere Fase zur Vertiefung,
 * in der das Tastenraster liegt) und ein leichter Randglanz. Reines CSS - keine externen Bild-
 * Downloads (CSP erlaubt nur 'self', die App muss offline funktionieren).
 *
 * Ersetzt den frueheren Vollflaechen-"Deck-Hintergrund" (vormals ebenfalls "Plate" genannt, siehe
 * die inzwischen entfernte lib/platePresets.ts) komplett - hier ist "Plate" jetzt ausschliesslich
 * der physische Gehaeuserahmen. Jeder Preset-Key wird unveraendert als appearance.background.plate
 * gespeichert (siehe AppearancePage.tsx / DeckPage.tsx).
 */

/** Gleiches feines Kornrauschen-Pattern wie zuvor bei den Mesh-Hintergruenden - hier als Oberflaechen-
 * Textur uebers Material gelegt, damit gebuerstetes Metall/Carbon nicht platt wirkt. */
const NOISE_OVERLAY =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"

/** Feine, enge Streifen fuer den "gebuersteten" Metall-Look (repeating-linear-gradient statt Bild). */
function brushed(angle: number, light: string, dark: string): string {
  return `repeating-linear-gradient(${angle}deg, ${light} 0px, ${dark} 1px, ${light} 2px)`
}

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
    model?: 'studio' | 'cyber' | 'stealth' | 'executive' | 'sushiflux'
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

function plate(key: string, name: string, description: string, base: string, sheen: string, brushAngle = 90): HousePlatePreset {
  const light = `color-mix(in oklab, white 10%, ${base})`
  const dark = `color-mix(in oklab, black 12%, ${base})`
  return {
    key: `house:${key}`,
    name,
    description,
    base,
    sheen,
    surface: [
      // Sanfte Wolbung von oben-links beleuchtet (Tiefenwirkung des Gehaeusekoerpers selbst)
      'radial-gradient(120% 140% at 20% -10%, rgba(255,255,255,0.10), transparent 55%)',
      'radial-gradient(100% 120% at 100% 120%, rgba(0,0,0,0.18), transparent 60%)',
      brushed(brushAngle, light, dark),
      NOISE_OVERLAY,
    ].join(', ') + `, ${base}`,
  }
}

/** Breite des Gehaeuse-Rahmens und Innenabstand der Vertiefung (px) - zusammen der Platz, den die
 * Plate pro Seite um das Tastenraster herum braucht; DeckGrid rechnet ihn bei der Tastengroesse ein. */
export const HOUSE_PLATE_FRAME_PAD = 34
export const HOUSE_PLATE_WELL_PAD = 14
export const HOUSE_PLATE_INSET = 52

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
  plate(
    'spacegray',
    'Space-Grau Aluminium',
    'Gebürstetes Aluminium, wie das Original-Gehäuse',
    '#57616f',
    'rgba(255,255,255,0.35)',
  ),
  plate(
    'carbon',
    'Mattes Carbon-Schwarz',
    'Tiefschwarzer Kunststoff mit feiner Struktur',
    '#1a1c20',
    'rgba(255,255,255,0.16)',
  ),
  plate(
    'silver',
    'Helles Silber',
    'Poliertes Silber, freundlich und hell',
    '#c9ced8',
    'rgba(255,255,255,0.55)',
  ),
  plate(
    'brandviolet',
    'Akzent-Violett',
    'Farbiger Rahmen in der Marken-Akzentfarbe',
    '#3c2f8f',
    'rgba(196,181,253,0.4)',
  ),
  plate(
    'gunmetal',
    'Gunmetal',
    'Kühles Anthrazit mit blauem Unterton',
    '#3a4250',
    'rgba(148,197,255,0.28)',
  ),
  plate(
    'copper',
    'Gebürstetes Kupfer',
    'Warmer Kupferton mit Metallglanz',
    '#8a4a2f',
    'rgba(255,200,150,0.35)',
  ),
]
