/**
 * "Mit ♥ gemacht" (Deutsch) bzw. "Made with ♥" (Englisch und alle anderen Sprachen).
 * Das Herz ist immer gruen - bewusste Markenentscheidung.
 */
export function MadeWith({ onDark = false }: { onDark?: boolean }) {
  const german = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de')
  const heart = (
    <span aria-label={german ? 'Herz' : 'love'} role="img" className={onDark ? 'text-[#4ade80]' : 'text-[var(--c-toggle-on)]'}>
      ♥
    </span>
  )
  return german ? <>Mit {heart} gemacht</> : <>Made with {heart}</>
}
