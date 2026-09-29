/**
 * Handgefertigte CSS-Hintergrundmuster ("Plates") fuer die Deck-Ansicht - mehrschichtige
 * Mesh-Gradients (mehrere ueberlagerte radial-gradient-Ebenen statt eines einfachen linearen
 * 2-Farben-Verlaufs) plus eine feine Noise-Textur (wiederholtes SVG-Pattern, sehr niedrige
 * Opacity) obendrauf - das haelt die Flaeche lebendig statt platt/bandig zu wirken, ohne von den
 * Deck-Tasten abzulenken.
 *
 * Jeder Preset-Key traegt das Praefix "css:" (siehe photoPresets.ts fuer das Pendant "photo:") und
 * wird unveraendert als appearance.background.preset gespeichert; lib/appearanceBackground.ts loest
 * das beim Rendern anhand des Praefixes auf.
 */

/** Sehr feines, gleichmaessiges Kornrauschen als wiederholbares SVG-Data-URI-Pattern - deutlich
 * leichter als ein PNG-Noise-Asset und faerbt sich nicht ein (reines Alpha-Rauschen in Weiss). */
const NOISE_OVERLAY =
  "linear-gradient(rgba(0,0,0,0)), url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"

export interface PlatePreset {
  key: string
  name: string
  /** Fertiger CSS background-Wert (mehrere kommaseparierte Ebenen) - direkt auf background setzbar. */
  css: string
}

function mesh(name: string, key: string, layers: string[], base: string): PlatePreset {
  return { key: `css:${key}`, name, css: [NOISE_OVERLAY, ...layers].join(', ') + `, ${base}` }
}

export const PLATE_PRESETS: PlatePreset[] = [
  mesh(
    'Aurora',
    'aurora',
    [
      'radial-gradient(48% 60% at 15% 15%, rgba(124,58,237,0.55), transparent 65%)',
      'radial-gradient(55% 65% at 85% 25%, rgba(6,182,212,0.45), transparent 65%)',
      'radial-gradient(60% 70% at 50% 100%, rgba(245,158,11,0.28), transparent 70%)',
    ],
    '#0b0d16',
  ),
  mesh(
    'Sonnenuntergang',
    'sunset',
    [
      'radial-gradient(50% 60% at 20% 90%, rgba(244,63,94,0.5), transparent 65%)',
      'radial-gradient(55% 60% at 85% 15%, rgba(251,146,60,0.45), transparent 65%)',
      'radial-gradient(40% 50% at 60% 55%, rgba(217,70,239,0.25), transparent 70%)',
    ],
    '#1a0e12',
  ),
  mesh(
    'Tiefsee',
    'deepsea',
    [
      'radial-gradient(55% 60% at 80% 10%, rgba(14,165,233,0.4), transparent 65%)',
      'radial-gradient(60% 70% at 10% 80%, rgba(2,132,199,0.35), transparent 70%)',
      'radial-gradient(45% 50% at 50% 40%, rgba(45,212,191,0.2), transparent 70%)',
    ],
    '#050d17',
  ),
  mesh(
    'Waldnacht',
    'forestnight',
    [
      'radial-gradient(50% 55% at 25% 20%, rgba(16,185,129,0.35), transparent 65%)',
      'radial-gradient(55% 65% at 80% 85%, rgba(5,150,105,0.3), transparent 70%)',
      'radial-gradient(40% 45% at 60% 30%, rgba(163,230,53,0.14), transparent 70%)',
    ],
    '#08130f',
  ),
  mesh(
    'Magenta-Puls',
    'magentapulse',
    [
      'radial-gradient(50% 60% at 85% 80%, rgba(236,72,153,0.5), transparent 65%)',
      'radial-gradient(55% 60% at 10% 10%, rgba(99,102,241,0.45), transparent 65%)',
      'radial-gradient(35% 40% at 50% 50%, rgba(255,255,255,0.06), transparent 70%)',
    ],
    '#120a1a',
  ),
  mesh(
    'Bernstein-Glut',
    'emberglow',
    [
      'radial-gradient(50% 55% at 75% 75%, rgba(217,119,6,0.5), transparent 65%)',
      'radial-gradient(55% 60% at 15% 25%, rgba(194,65,12,0.4), transparent 65%)',
      'radial-gradient(40% 45% at 50% 15%, rgba(250,204,21,0.18), transparent 70%)',
    ],
    '#170f08',
  ),
  mesh(
    'Mitternachtsblau',
    'midnightblue',
    [
      'radial-gradient(55% 65% at 20% 25%, rgba(59,130,246,0.35), transparent 65%)',
      'radial-gradient(50% 55% at 80% 70%, rgba(37,99,235,0.3), transparent 65%)',
      'radial-gradient(45% 50% at 50% 95%, rgba(129,140,248,0.16), transparent 70%)',
    ],
    '#060a16',
  ),
  mesh(
    'Lavendelnebel',
    'lavendermist',
    [
      'radial-gradient(55% 60% at 25% 75%, rgba(167,139,250,0.4), transparent 65%)',
      'radial-gradient(50% 55% at 80% 20%, rgba(196,181,253,0.3), transparent 65%)',
      'radial-gradient(40% 45% at 55% 50%, rgba(232,121,249,0.16), transparent 70%)',
    ],
    '#100c1a',
  ),
  mesh(
    'Smaragdglanz',
    'emeraldsheen',
    [
      'radial-gradient(50% 60% at 15% 20%, rgba(5,150,105,0.4), transparent 65%)',
      'radial-gradient(55% 60% at 85% 30%, rgba(20,184,166,0.35), transparent 65%)',
      'radial-gradient(45% 45% at 55% 90%, rgba(132,204,22,0.14), transparent 70%)',
    ],
    '#061511',
  ),
  mesh(
    'Kupferrausch',
    'copperrush',
    [
      'radial-gradient(50% 55% at 80% 15%, rgba(234,88,12,0.45), transparent 65%)',
      'radial-gradient(55% 65% at 15% 80%, rgba(190,24,93,0.35), transparent 65%)',
      'radial-gradient(35% 40% at 50% 45%, rgba(253,224,71,0.14), transparent 70%)',
    ],
    '#170a0d',
  ),
  mesh(
    'Gletscher',
    'glacier',
    [
      'radial-gradient(55% 60% at 20% 15%, rgba(125,211,252,0.35), transparent 65%)',
      'radial-gradient(50% 55% at 85% 75%, rgba(56,189,248,0.3), transparent 65%)',
      'radial-gradient(45% 50% at 50% 50%, rgba(255,255,255,0.06), transparent 70%)',
    ],
    '#071019',
  ),
  mesh(
    'Vulkan',
    'volcano',
    [
      'radial-gradient(50% 55% at 50% 85%, rgba(220,38,38,0.5), transparent 65%)',
      'radial-gradient(55% 60% at 20% 20%, rgba(124,45,18,0.4), transparent 65%)',
      'radial-gradient(35% 40% at 80% 40%, rgba(251,191,36,0.16), transparent 70%)',
    ],
    '#170808',
  ),
  mesh(
    'Nordlicht',
    'northernlights',
    [
      'radial-gradient(55% 65% at 30% 10%, rgba(52,211,153,0.4), transparent 65%)',
      'radial-gradient(50% 60% at 75% 30%, rgba(99,102,241,0.35), transparent 65%)',
      'radial-gradient(45% 50% at 50% 90%, rgba(56,189,248,0.18), transparent 70%)',
    ],
    '#060f14',
  ),
  mesh(
    'Rosenquarz',
    'rosequartz',
    [
      'radial-gradient(50% 60% at 20% 80%, rgba(251,113,133,0.35), transparent 65%)',
      'radial-gradient(55% 55% at 80% 20%, rgba(244,114,182,0.3), transparent 65%)',
      'radial-gradient(40% 45% at 50% 50%, rgba(253,164,175,0.14), transparent 70%)',
    ],
    '#160c11',
  ),
  mesh(
    'Graphit',
    'graphite',
    [
      'radial-gradient(55% 60% at 25% 20%, rgba(148,163,184,0.18), transparent 65%)',
      'radial-gradient(50% 55% at 80% 80%, rgba(100,116,139,0.2), transparent 65%)',
      'radial-gradient(40% 45% at 55% 45%, rgba(203,213,225,0.08), transparent 70%)',
    ],
    '#0d0f13',
  ),
  mesh(
    'Zitrusfrische',
    'citrusfresh',
    [
      'radial-gradient(50% 55% at 80% 20%, rgba(250,204,21,0.35), transparent 65%)',
      'radial-gradient(55% 60% at 15% 70%, rgba(163,230,53,0.3), transparent 65%)',
      'radial-gradient(40% 45% at 55% 40%, rgba(45,212,191,0.16), transparent 70%)',
    ],
    '#12130a',
  ),
  mesh(
    'Kosmos',
    'cosmos',
    [
      'radial-gradient(45% 50% at 20% 25%, rgba(129,140,248,0.4), transparent 65%)',
      'radial-gradient(50% 55% at 80% 65%, rgba(217,70,239,0.32), transparent 65%)',
      'radial-gradient(60% 70% at 50% 100%, rgba(30,27,75,0.5), transparent 70%)',
    ],
    '#04040c',
  ),
  mesh(
    'Onyx-Glanz',
    'onyxsheen',
    [
      'radial-gradient(40% 45% at 30% 20%, rgba(255,255,255,0.06), transparent 65%)',
      'radial-gradient(50% 55% at 75% 75%, rgba(91,75,245,0.22), transparent 65%)',
      'radial-gradient(45% 50% at 50% 50%, rgba(56,189,248,0.1), transparent 70%)',
    ],
    '#08090c',
  ),
]
