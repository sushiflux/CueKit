/**
 * Tastenkuerzel als stabile Zeichenkette: Modifikatoren in fester Reihenfolge + KeyboardEvent.code,
 * z.B. "Ctrl+Shift+KeyF". `code` ist die physische Taste - unabhaengig vom Tastaturlayout, damit
 * ein Kuerzel auf jeder Tastatur gleich funktioniert (und spaeter in der Desktop-App systemweit).
 */

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight'])

/** Einzeln (ohne Modifikator) erlaubt: F-Tasten, Ziffernblock, Medientasten. */
const STANDALONE = /^(F([1-9]|1[0-9]|2[0-4])|Numpad[A-Za-z0-9]+|Media[A-Za-z]+|AudioVolume[A-Za-z]+)$/

/** Kombinationen, die der Browser nie an eine Seite weitergibt. */
const RESERVED = new Set(['Ctrl+KeyW', 'Ctrl+KeyT', 'Ctrl+KeyN', 'Ctrl+Shift+KeyN', 'Ctrl+Shift+KeyT', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Alt+F4', 'Ctrl+Shift+KeyW'])

export function hotkeyFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code) || !e.code) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  parts.push(e.code)
  return parts.join('+')
}

/** Liefert eine Begruendung, warum ein Kuerzel nicht geht - oder null. */
export function hotkeyProblem(hotkey: string): string | null {
  if (RESERVED.has(hotkey)) return `${formatHotkey(hotkey)} gibt der Browser nicht frei – bitte eine andere Kombination wählen.`
  if (hotkey.includes('Meta')) return 'Die Windows-Taste ist für das System reserviert – bitte Strg, Alt oder Umschalt verwenden.'
  if (!hotkey.includes('+') && !STANDALONE.test(hotkey)) return 'Einzelne Tasten gehen nur für F1–F24, den Ziffernblock und Medientasten – bitte mit Strg, Alt oder Umschalt kombinieren.'
  return null
}

const MOD_LABEL: Record<string, string> = { Ctrl: 'Strg', Alt: 'Alt', Shift: 'Umschalt', Meta: 'Win' }

/** Lesbare Einzelteile, z.B. ["Strg", "Umschalt", "F"] - fuer Tastenkappen-Darstellung. */
export function hotkeyParts(hotkey: string): string[] {
  return hotkey.split('+').map((p) => MOD_LABEL[p] ?? keyLabel(p))
}

export function formatHotkey(hotkey: string): string {
  return hotkeyParts(hotkey).join(' + ')
}

function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) {
    const rest = code.slice(6)
    const names: Record<string, string> = { Add: '+', Subtract: '−', Multiply: '×', Divide: '÷', Decimal: ',', Enter: 'Enter' }
    return `Num ${names[rest] ?? rest}`
  }
  const names: Record<string, string> = {
    Space: 'Leertaste', Enter: 'Enter', Backspace: 'Rück', Escape: 'Esc', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Minus: 'ß', Equal: '´', BracketLeft: 'Ü', BracketRight: '+', Semicolon: 'Ö', Quote: 'Ä', Backslash: '#', Comma: ',', Period: '.', Slash: '-',
    Backquote: '^', IntlBackslash: '<', Insert: 'Einfg', Delete: 'Entf', Home: 'Pos1', End: 'Ende', PageUp: 'Bild ↑', PageDown: 'Bild ↓',
    MediaPlayPause: 'Play/Pause', MediaTrackNext: 'Weiter', MediaTrackPrevious: 'Zurück', MediaStop: 'Stopp',
    AudioVolumeMute: 'Stumm', AudioVolumeUp: 'Lauter', AudioVolumeDown: 'Leiser', PrintScreen: 'Druck', ScrollLock: 'Rollen', Pause: 'Pause',
  }
  return names[code] ?? code
}

/** Tippt der Nutzer gerade in ein Eingabefeld? Dann keine Kuerzel ausloesen. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
