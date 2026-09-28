import { IconKeyboard, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { hotkeyFromEvent, hotkeyParts, hotkeyProblem } from '../lib/hotkeys'

/** Tastenkombination als kleine Tastenkappen, z.B. [Strg] [Umschalt] [F]. */
export function HotkeyCaps({ hotkey, size = 'md' }: { hotkey: string; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {hotkeyParts(hotkey).map((part, i) => (
        <kbd
          key={i}
          className={`inline-flex items-center justify-center rounded-badge border border-line-strong bg-surface-2 font-sans font-semibold text-ink shadow-[inset_0_-2px_0_var(--c-line-strong)] ${
            size === 'sm' ? 'h-5 min-w-5 px-1 text-[10px]' : 'h-7 min-w-7 px-2 text-xs'
          }`}
        >
          {part}
        </kbd>
      ))}
    </span>
  )
}

interface Props {
  value: string | null
  onChange: (hotkey: string | null) => void
}

/**
 * Feld zum Aufnehmen eines Tastenkuerzels: klicken, Kombination druecken, fertig.
 * Esc bricht ab, Entf/Rueck entfernt das Kuerzel.
 */
export function HotkeyRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return setRecording(false)
      if ((e.code === 'Backspace' || e.code === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        onChange(null)
        setProblem(null)
        return setRecording(false)
      }
      const combo = hotkeyFromEvent(e)
      if (!combo) return // nur Modifikator gedrueckt - auf die eigentliche Taste warten
      const why = hotkeyProblem(combo)
      setProblem(why)
      if (why) return
      onChange(combo)
      setRecording(false)
    }
    // Capture-Phase: das Kuerzel darf beim Aufnehmen keine Taste im Deck ausloesen.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, onChange])

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`field flex h-10 flex-1 items-center gap-2 text-left ${recording ? 'border-brand ring-2 ring-brand/30' : ''}`}
          onClick={() => {
            setProblem(null)
            setRecording((r) => !r)
          }}
          onBlur={() => setRecording(false)}
        >
          <IconKeyboard size={16} className="shrink-0 text-ink-faint" />
          {recording ? (
            <span className="live-dot text-sm font-semibold text-brand">Kombination drücken …</span>
          ) : value ? (
            <HotkeyCaps hotkey={value} />
          ) : (
            <span className="text-sm text-ink-faint">Kein Kürzel – klicken zum Aufnehmen</span>
          )}
        </button>
        {value && !recording && (
          <button type="button" className="btn btn-ghost btn-icon h-10 w-10" onClick={() => onChange(null)} aria-label="Tastenkürzel entfernen" title="Tastenkürzel entfernen">
            <IconX size={16} />
          </button>
        )}
      </div>
      {problem ? (
        <p className="mt-1.5 text-xs text-danger">{problem}</p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-faint">
          {recording ? 'Esc bricht ab, Entf entfernt das Kürzel.' : 'Wirkt, solange das Deck im Browser im Vordergrund ist. Systemweit (auch im Spiel) mit der Desktop-App.'}
        </p>
      )}
    </div>
  )
}
