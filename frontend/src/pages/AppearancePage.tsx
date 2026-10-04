import {
  IconCheck,
  IconDeviceGamepad2,
  IconEye,
  IconFingerprint,
  IconGridDots,
  IconMoon,
  IconSun,
  IconToggleRight,
} from '@tabler/icons-react'
import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { AppearanceSettings, ButtonModel } from '../api/types'
import { AppShell } from '../components/AppShell'
import { DeckKey } from '../components/DeckKey'
import { HousePlate } from '../components/HousePlate'
import { toast } from '../components/Toasts'
import { HOUSE_PLATE_PRESETS } from '../lib/housePlates'
import { useStore } from '../state/store'

function toInput(a: AppearanceSettings, patch: Partial<AppearanceSettings> = {}) {
  const nextStateStyle = patch.stateStyle ?? a.stateStyle ?? 'fill'
  const nextIndicator =
    nextStateStyle === 'glow'
      ? 'glow'
      : nextStateStyle === 'corner'
      ? 'corner'
      : nextStateStyle === 'led'
      ? 'led'
      : nextStateStyle === 'level'
      ? 'level'
      : 'none'

  return {
    pressBehavior: patch.pressBehavior ?? a.pressBehavior,
    volumeIndicator: patch.volumeIndicator ?? nextIndicator,
    plate: patch.plate ?? a.plate ?? 'house:studiopro',
    stateStyle: nextStateStyle,
    displayMesh: patch.displayMesh ?? a.displayMesh ?? false,
  }
}

/** Echte Beispiel-Tasten fuer die Live-Deck-Vorschau: Zeigen Toggle-An, Toggle-Aus, Fader/Meter, Neutral, Kamera & CPU. */
const PREVIEW_KEYS: { button: ButtonModel; active?: boolean; level?: number | null; meterKey?: string }[] = [
  {
    button: { id: -1, pageId: 0, row: 0, column: 0, label: 'Aufnahme', icon: 'tabler:player-record', color: 'slate', actions: [{ type: 'obs.record', params: { mode: 'toggle' } }], hotkey: null },
    active: true,
  },
  {
    button: { id: -2, pageId: 0, row: 0, column: 1, label: 'Aufnahme', icon: 'tabler:player-record', color: 'slate', actions: [{ type: 'obs.record', params: { mode: 'toggle' } }], hotkey: null },
    active: false,
  },
  {
    button: { id: -3, pageId: 0, row: 0, column: 2, label: 'Mikrofon', icon: 'tabler:microphone', color: 'slate', actions: [{ type: 'obs.inputMute', params: { mode: 'toggle' } }], hotkey: null },
    active: true,
    level: 0.72,
  },
  {
    button: { id: -4, pageId: 0, row: 1, column: 0, label: 'Szene 1', icon: 'tabler:device-tv', color: 'slate', actions: [{ type: 'obs.scene', params: {} }], hotkey: null },
    active: false,
  },
  {
    button: { id: -5, pageId: 0, row: 1, column: 1, label: 'Kamera', icon: 'tabler:video', color: 'slate', actions: [{ type: 'obs.virtualCam', params: { mode: 'toggle' } }], hotkey: null },
    active: true,
  },
  {
    button: { id: -6, pageId: 0, row: 1, column: 2, label: 'CPU 42%', icon: 'tabler:cpu', color: 'slate', actions: [], hotkey: null },
    active: false,
  },
]

/** Zentrale Live-Deck-Vorschau oben mit Dark/Light Theme-Switch nur fuer die Vorschau */
function LiveDeckPreview({
  appearance,
}: {
  appearance: AppearanceSettings
}) {
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark')
  const currentPlate = appearance.plate || 'house:studiopro'

  return (
    <section className="card overflow-hidden p-5">
      {/* Vorschau-Kopfleiste */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
            <IconEye size={20} />
          </span>
          <div>
            <h2 className="font-bold text-ink">Live-Deck Vorschau</h2>
            <p className="text-xs text-ink-faint">
              Reagiert sofort auf alle Einstellungen – Tasten können zum Testen des Tastenhubs angetippt werden.
            </p>
          </div>
        </div>

        {/* Separater Theme-Switch nur für die Vorschau */}
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1 text-xs">
          <span className="px-2 text-[11px] font-medium text-ink-muted">Vorschau-Theme:</span>
          <button
            type="button"
            onClick={() => setPreviewTheme('dark')}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
              previewTheme === 'dark' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <IconMoon size={14} /> Dunkel
          </button>
          <button
            type="button"
            onClick={() => setPreviewTheme('light')}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
              previewTheme === 'light' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <IconSun size={14} /> Hell
          </button>
        </div>
      </div>

      {/* Das Gehäuse mit echten Live-Tasten im gewählten Vorschau-Theme */}
      <div
        data-theme={previewTheme}
        className="flex min-h-[300px] w-full items-center justify-center rounded-card bg-canvas p-4 sm:p-8 transition-colors duration-200"
      >
        <HousePlate
          plateKey={currentPlate}
          className="w-full max-w-[480px]"
          preview
          deckName="Streaming"
          keyCount={6}
        >
          <div className="grid grid-cols-3 gap-3">
            {PREVIEW_KEYS.map((k) => (
              <div key={k.button.id} className="aspect-square w-full">
                <DeckKey
                  button={k.button}
                  size={110}
                  active={k.active}
                  level={k.level}
                  stateStyle={appearance.stateStyle}
                  volumeIndicator={appearance.volumeIndicator}
                  displayMesh={appearance.displayMesh}
                  pressBehavior={appearance.pressBehavior}
                />
              </div>
            ))}
          </div>
        </HousePlate>
      </div>
    </section>
  )
}

/** Einheitliche, kollisionsfreie Zustandsanzeige & Tasten-Optik */
function KeyOpticsSection({
  appearance,
  onSaved,
}: {
  appearance: AppearanceSettings
  onSaved: (a: AppearanceSettings) => void
}) {
  const [saving, setSaving] = useState(false)

  const update = async (patch: Partial<AppearanceSettings>, label: string) => {
    setSaving(true)
    try {
      const result = await api<AppearanceSettings>('/api/settings/appearance', {
        method: 'PUT',
        body: toInput(appearance, patch),
      })
      onSaved(result)
      toast(`${label} gespeichert.`, 'success')
    } catch (e) {
      toast(`${label} konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // 6 eigenständige, unmissverständliche Zustandsstile:
  // Jede Option schließt eine Doppel-Färbung von Fläche + LED automatisch aus!
  const stateOptions: {
    value: 'fill' | 'glow' | 'corner' | 'led' | 'level' | 'icon'
    title: string
    desc: string
  }[] = [
    {
      value: 'fill',
      title: 'Vollfläche',
      desc: 'Ganze Taste leuchtet grün (an) bzw. rot (aus), Symbol und Text in Weiß.',
    },
    {
      value: 'glow',
      title: 'Diffusor-LED (Backlight)',
      desc: 'Taste bleibt neutral, von unten leuchtet ein weicher Kristallglas-Glow.',
    },
    {
      value: 'corner',
      title: 'Eck-Diffusor',
      desc: 'Taste bleibt neutral, die satinierte Milchglas-Ecke oben rechts leuchtet.',
    },
    {
      value: 'led',
      title: 'Runde LED',
      desc: 'Taste bleibt neutral, eine klassische runde Hardware-Linse oben rechts leuchtet.',
    },
    {
      value: 'level',
      title: 'Status-Strich',
      desc: 'Taste bleibt neutral, ein horizontaler LED-Balken oben mittig leuchtet.',
    },
    {
      value: 'icon',
      title: 'Nur Symbol & Text',
      desc: 'Taste bleibt neutral, nur das Icon und die Beschriftung leuchten farbig.',
    },
  ]

  return (
    <section className="card p-5 space-y-6">
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconToggleRight size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Zustandsanzeige & Tasten-Optik</h2>
          <p className="text-xs text-ink-faint">
            Wähle, wie aktive Tasten (Aufnahme, Stumm, Stream etc.) ihren Zustand signalisieren.
          </p>
        </div>
      </div>

      {/* 1. Die 6 kollisionsfreien Zustandsanzeigen */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Zustandsanzeige (An / Aus)
          </span>
          <span className="text-[11px] text-ink-faint">Keine Kollisionen zwischen Fläche und LED</span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {stateOptions.map((o) => {
            const isSelected = appearance.stateStyle === o.value
            return (
              <button
                key={o.value}
                type="button"
                disabled={saving}
                aria-pressed={isSelected}
                onClick={() => void update({ stateStyle: o.value }, 'Zustandsanzeige')}
                className="btn btn-ghost h-auto flex flex-col items-start p-3.5 text-left transition-all aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-semibold text-xs text-ink">{o.title}</span>
                  {isSelected && <IconCheck size={14} className="text-select" stroke={2.5} />}
                </div>
                <span className="mt-1 whitespace-normal text-[11px] text-ink-muted leading-tight">{o.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Display-Mesh & 3. Tastendruckverhalten nebeneinander */}
      <div className="grid grid-cols-1 gap-6 border-t border-line/60 pt-4 sm:grid-cols-2">
        {/* Display-Mesh auf allen Tasten */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <IconGridDots size={16} className="text-brand" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Display-Mesh (Tastenoberfläche)
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              aria-pressed={!appearance.displayMesh}
              onClick={() => void update({ displayMesh: false }, 'Display-Mesh')}
              className="btn btn-ghost flex-1 py-2.5 text-center text-xs font-semibold aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
            >
              Glatt (Standard)
            </button>
            <button
              type="button"
              disabled={saving}
              aria-pressed={appearance.displayMesh}
              onClick={() => void update({ displayMesh: true }, 'Display-Mesh')}
              className="btn btn-ghost flex-1 py-2.5 text-center text-xs font-semibold aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
            >
              Subpixel-Matrix
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {appearance.displayMesh
              ? 'Subpixel-Matrix auf allen Tasten für den authentischen Stream-Deck LCD-Look.'
              : 'Glatte, unstrukturierte Tastenkappen ohne Punktraster.'}
          </p>
        </div>

        {/* Tastendruckverhalten */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <IconFingerprint size={16} className="text-brand" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Tastendruckverhalten
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              aria-pressed={appearance.pressBehavior === 'spring'}
              onClick={() => void update({ pressBehavior: 'spring' }, 'Tastendruckverhalten')}
              className="btn btn-ghost flex-1 py-2.5 text-center text-xs font-semibold aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
            >
              Federt zurück
            </button>
            <button
              type="button"
              disabled={saving}
              aria-pressed={appearance.pressBehavior === 'stay'}
              onClick={() => void update({ pressBehavior: 'stay' }, 'Tastendruckverhalten')}
              className="btn btn-ghost flex-1 py-2.5 text-center text-xs font-semibold aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
            >
              Bleibt gedrückt
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {appearance.pressBehavior === 'stay'
              ? 'Tasten mit echtem Zustand bleiben im An-Zustand optisch gedrückt.'
              : 'Taste federt sofort nach dem Antippen wieder in ihre Ursprungshöhe zurück.'}
          </p>
        </div>
      </div>
    </section>
  )
}

/** Gehäuse-Plate Galerie (Option "Kein Gehäuse" ist entfernt – es bleibt immer ein Gehäuse aktiv) */
function PlateSection({
  appearance,
  onSaved,
}: {
  appearance: AppearanceSettings
  onSaved: (a: AppearanceSettings) => void
}) {
  const currentPlate = appearance.plate || 'house:studiopro'
  const [selected, setSelected] = useState(currentPlate)
  const [saving, setSaving] = useState(false)

  const choose = async (plate: string) => {
    if (saving || plate === selected) return
    setSelected(plate)
    setSaving(true)
    try {
      const result = await api<AppearanceSettings>('/api/settings/appearance', {
        method: 'PUT',
        body: toInput(appearance, { plate }),
      })
      onSaved(result)
      toast('Gehäuse-Plate gespeichert.', 'success')
    } catch (e) {
      toast(`Gehäuse-Plate konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const selectedPreset = HOUSE_PLATE_PRESETS.find((p) => p.key === selected) ?? HOUSE_PLATE_PRESETS[0]

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconDeviceGamepad2 size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Gehäuse-Plate</h2>
          <p className="text-xs text-ink-faint">
            Die physische Gehäuse-Fassung um das Tastenraster herum – bestimmt Material, Glanzkante und Enclosure.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {HOUSE_PLATE_PRESETS.map((p) => {
          const isCurrent = (selected || 'house:studiopro') === p.key
          return (
            <button
              key={p.key}
              type="button"
              title={p.description}
              aria-label={p.name}
              aria-pressed={isCurrent}
              disabled={saving}
              onClick={() => void choose(p.key)}
              className="group relative aspect-video overflow-hidden rounded-ctl ring-offset-2 ring-offset-surface transition-all hover:scale-[1.02] aria-pressed:ring-2 aria-pressed:ring-select border border-white/10"
              style={{ background: p.surface }}
            >
              {p.hardware?.chamferHighlight && (
                <div className="absolute inset-x-2 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
              )}
              {p.hardware?.underglow && (
                <div className="absolute inset-x-3 bottom-7 h-[2px] rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1.5 text-left text-xs font-semibold text-white backdrop-blur-sm flex items-center justify-between">
                <span className="truncate pr-1">{p.name}</span>
                {p.hardware && (
                  <span className="shrink-0 text-[8px] font-extrabold uppercase tracking-wider text-cyan-300 px-1 py-0.5 rounded bg-cyan-500/25 border border-cyan-400/40">
                    Pro
                  </span>
                )}
              </span>
              {isCurrent && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-select text-white z-10 shadow-md">
                  <IconCheck size={13} stroke={2.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Ausgewählt: <span className="font-semibold text-ink">{selectedPreset.name}</span> – {selectedPreset.description}.
      </p>
    </section>
  )
}

export function AppearancePage() {
  const stored = useStore((s) => s.appearance)
  const [local, setLocal] = useState(stored)
  const appearance = local ?? stored

  if (!appearance) {
    return (
      <AppShell title="Aussehen">
        <div className="p-8 text-center text-sm text-ink-muted">Lade Einstellungen …</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Aussehen">
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
        {/* 1. Große Live-Deck Vorschau im Gehäuse mit Dark/Light Switch */}
        <LiveDeckPreview appearance={appearance} />

        {/* 2. Aufgeräumte Zustandsanzeige & Tasten-Optik ohne Kollisionen */}
        <KeyOpticsSection appearance={appearance} onSaved={setLocal} />

        {/* 3. Gehäuse-Plate Galerie (ohne 'Kein Gehäuse') */}
        <PlateSection appearance={appearance} onSaved={setLocal} />
      </div>
    </AppShell>
  )
}
