/** Kuratierte Tastenfarben - die eigentlichen Werte stehen als Tokens in index.css ([data-color=...]). */
export const KEY_COLORS = [
  { id: 'slate', label: 'Schiefer', swatch: '#64748b' },
  { id: 'violet', label: 'Violett', swatch: '#7c3aed' },
  { id: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { id: 'sky', label: 'Himmel', swatch: '#0284c7' },
  { id: 'cyan', label: 'Cyan', swatch: '#0891b2' },
  { id: 'teal', label: 'Petrol', swatch: '#0d9488' },
  { id: 'emerald', label: 'Smaragd', swatch: '#059669' },
  { id: 'amber', label: 'Bernstein', swatch: '#d97706' },
  { id: 'orange', label: 'Orange', swatch: '#ea580c' },
  { id: 'red', label: 'Rot', swatch: '#dc2626' },
  { id: 'rose', label: 'Rosé', swatch: '#e11d48' },
  { id: 'pink', label: 'Pink', swatch: '#db2777' },
] as const

export const GRID_PRESETS = [
  { rows: 2, columns: 3, label: '2 × 3', hint: 'Mini' },
  { rows: 3, columns: 5, label: '3 × 5', hint: 'Klassisch' },
  { rows: 4, columns: 4, label: '4 × 4', hint: 'Quadrat' },
  { rows: 2, columns: 6, label: '2 × 6', hint: 'Leiste' },
  { rows: 4, columns: 5, label: '4 × 5', hint: 'Tablet' },
  { rows: 5, columns: 5, label: '5 × 5', hint: 'Groß' },
  { rows: 4, columns: 8, label: '4 × 8', hint: 'XL' },
] as const
