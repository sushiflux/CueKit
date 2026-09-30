import { IconDeviceGamepad2, IconGauge, IconPointer, IconSquareCheck } from '@tabler/icons-react'
import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { AppearanceSettings } from '../api/types'
import { AppShell } from '../components/AppShell'
import { HousePlate } from '../components/HousePlate'
import { toast } from '../components/Toasts'
import { HOUSE_PLATE_PRESETS } from '../lib/housePlates'
import { useStore } from '../state/store'

/** Baut einen kompletten PUT-Body aus dem aktuellen Stand + gezielten Aenderungen - das Backend
 * erwartet immer das vollstaendige AppearanceInput-Objekt, nicht nur das geaenderte Feld. */
function toInput(a: AppearanceSettings, patch: Partial<AppearanceSettings> = {}) {
  return {
    pressBehavior: patch.pressBehavior ?? a.pressBehavior,
    volumeIndicator: patch.volumeIndicator ?? a.volumeIndicator,
    plate: patch.plate ?? a.plate,
  }
}

/** Abschnitt 1b: globales Tastendruckverhalten (federt zurück / bleibt gedrückt). */
function PressBehaviorSection({ appearance, onSaved }: { appearance: AppearanceSettings; onSaved: (a: AppearanceSettings) => void }) {
  const [saving, setSaving] = useState(false)

  const choose = async (pressBehavior: 'spring' | 'stay') => {
    if (pressBehavior === appearance.pressBehavior) return
    setSaving(true)
    try {
      const result = await api<AppearanceSettings>('/api/settings/appearance', { method: 'PUT', body: toInput(appearance, { pressBehavior }) })
      onSaved(result)
      toast('Tastendruckverhalten gespeichert.', 'success')
    } catch (e) {
      toast(`Tastendruckverhalten konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconPointer size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Tastendruckverhalten</h2>
          <p className="text-xs text-ink-faint">Gilt nur für Tasten mit echtem An/Aus-Zustand – reine Einmal-Aktionen federn immer kurz zurück.</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={saving}
          aria-pressed={appearance.pressBehavior === 'spring'}
          onClick={() => void choose('spring')}
          className="btn btn-ghost flex-1 aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
        >
          Federt zurück
        </button>
        <button
          type="button"
          disabled={saving}
          aria-pressed={appearance.pressBehavior === 'stay'}
          onClick={() => void choose('stay')}
          className="btn btn-ghost flex-1 aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
        >
          Bleibt gedrückt
        </button>
      </div>
    </section>
  )
}

/** Abschnitt 1c: LED oder Status-Strich als OBEREN An/Aus-Indikator fuer Lautstaerke-Tasten
 * (Volume/Mute) - betrifft nur diesen oberen Status, NICHT den unteren Pegelbalken (der zeigt bei
 * jeder Lautstaerke-Taste immer den tatsaechlichen Pegel, unabhaengig von dieser Einstellung).
 * Reine An/Aus-Tasten ohne Lautstaerke-Bezug (z.B. "Stream") sind davon nicht betroffen. */
function VolumeIndicatorSection({ appearance, onSaved }: { appearance: AppearanceSettings; onSaved: (a: AppearanceSettings) => void }) {
  const [saving, setSaving] = useState(false)

  const choose = async (volumeIndicator: 'led' | 'level') => {
    if (volumeIndicator === appearance.volumeIndicator) return
    setSaving(true)
    try {
      const result = await api<AppearanceSettings>('/api/settings/appearance', { method: 'PUT', body: toInput(appearance, { volumeIndicator }) })
      onSaved(result)
      toast('Zustandsanzeige gespeichert.', 'success')
    } catch (e) {
      toast(`Zustandsanzeige konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconGauge size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Lautstärke-Anzeige</h2>
          <p className="text-xs text-ink-faint">
            Oberer An/Aus-Status für Tasten mit Lautstärke-Bezug (Volume/Mute) – der Pegelbalken unten läuft davon unabhängig immer mit. Andere Tasten mit An/Aus-Zustand behalten immer die LED.
          </p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={saving}
          aria-pressed={appearance.volumeIndicator === 'led'}
          onClick={() => void choose('led')}
          className="btn btn-ghost flex-1 aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
        >
          LED
        </button>
        <button
          type="button"
          disabled={saving}
          aria-pressed={appearance.volumeIndicator === 'level'}
          onClick={() => void choose('level')}
          className="btn btn-ghost flex-1 aria-pressed:border-select aria-pressed:bg-select-soft aria-pressed:text-select"
        >
          Strich
        </button>
      </div>
    </section>
  )
}

/** Ein paar Platzhalter-Tasten fuer die Mini-Vorschau, ohne echte Tastenlogik/Icons zu brauchen -
 * reine visuelle Attrappen, damit die Vorschau wie ein echtes Mini-Stream-Deck wirkt statt nur wie
 * eine Farbfläche. */
function PreviewKeys() {
  return (
    <div className="grid w-full grid-cols-3 gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="deck-key aspect-square h-auto w-auto" />
      ))}
    </div>
  )
}

/** Abschnitt 1c: Gehäuse-Plate - Rahmen/Fassung um das Tastenraster, austauschbar per Galerie mit
 * Live-Vorschau (Mini-Stream-Deck mit Platzhalter-Tasten statt nur einer Farbfläche). */
function PlateSection({ appearance, onSaved }: { appearance: AppearanceSettings; onSaved: (a: AppearanceSettings) => void }) {
  const [selected, setSelected] = useState(appearance.plate)
  const [saving, setSaving] = useState(false)

  const choose = async (plate: string) => {
    setSelected(plate)
    setSaving(true)
    try {
      const result = await api<AppearanceSettings>('/api/settings/appearance', { method: 'PUT', body: toInput(appearance, { plate }) })
      onSaved(result)
      toast('Gehäuse-Plate gespeichert.', 'success')
    } catch (e) {
      toast(`Gehäuse-Plate konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const selectedPreset = HOUSE_PLATE_PRESETS.find((p) => p.key === selected)

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconDeviceGamepad2 size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Gehäuse-Plate</h2>
          <p className="text-xs text-ink-faint">Die austauschbare Fassung direkt um das Tastenraster auf der Live-Deck-Ansicht – wie beim physischen Gehäuse.</p>
        </div>
      </div>

      {/* Live-Vorschau der aktuellen Auswahl */}
      <div className="mb-4 flex aspect-video w-full items-center justify-center overflow-hidden rounded-card bg-canvas p-3">
        <HousePlate plateKey={selected} className="w-[52%]">
          <PreviewKeys />
        </HousePlate>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button
          type="button"
          title="Kein Gehäuse"
          aria-label="Kein Gehäuse"
          aria-pressed={selected === ''}
          disabled={saving}
          onClick={() => void choose('')}
          className="group relative aspect-video overflow-hidden rounded-ctl border-2 border-dashed border-line bg-surface-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-[1.03] aria-pressed:border-select aria-pressed:ring-2 aria-pressed:ring-select"
        >
          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-ink-faint">Kein Gehäuse</span>
          {selected === '' && (
            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-select text-white">
              <IconSquareCheck size={13} />
            </span>
          )}
        </button>
        {HOUSE_PLATE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            title={p.description}
            aria-label={p.name}
            aria-pressed={selected === p.key}
            disabled={saving}
            onClick={() => void choose(p.key)}
            className="group relative aspect-video overflow-hidden rounded-ctl ring-offset-2 ring-offset-surface transition-transform hover:scale-[1.03] aria-pressed:ring-2 aria-pressed:ring-select"
            style={{ background: p.surface }}
          >
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1.5 text-left text-xs font-semibold text-white backdrop-blur-sm">{p.name}</span>
            {selected === p.key && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-select text-white">
                <IconSquareCheck size={13} />
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-faint">{selectedPreset ? `Ausgewählt: ${selectedPreset.name} – ${selectedPreset.description}.` : 'Kein Gehäuse ausgewählt – die normale App-Fläche bleibt sichtbar.'}</p>
    </section>
  )
}

export function AppearancePage() {
  const stored = useStore((s) => s.appearance)
  // Lokaler Zwischenstand, damit ein PUT-Ergebnis sofort ohne Rundflug uebers Hub sichtbar ist -
  // appearanceChanged aktualisiert den Store ohnehin gleich mit (auch auf anderen Geraeten).
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
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
        <PressBehaviorSection appearance={appearance} onSaved={setLocal} />
        <VolumeIndicatorSection appearance={appearance} onSaved={setLocal} />
        <PlateSection appearance={appearance} onSaved={setLocal} />
      </div>
    </AppShell>
  )
}
