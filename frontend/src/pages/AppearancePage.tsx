import { IconCheck, IconPalette, IconPhoto, IconPointer, IconSquareCheck, IconTrash, IconUpload } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { api, apiUpload, errorMessage } from '../api/client'
import type { AppearanceBackground, AppearanceSettings } from '../api/types'
import { AppShell } from '../components/AppShell'
import { BackgroundImageCropModal } from '../components/BackgroundImageCropModal'
import { toast } from '../components/Toasts'
import { resolveBackgroundStyle } from '../lib/appearanceBackground'
import { PHOTO_PRESETS } from '../lib/photoPresets'
import { PLATE_PRESETS } from '../lib/platePresets'
import { useStore } from '../state/store'

/** Baut einen kompletten PUT-Body aus dem aktuellen Stand + gezielten Aenderungen - das Backend
 * erwartet immer das vollstaendige AppearanceInput-Objekt, nicht nur das geaenderte Feld. */
function toInput(a: AppearanceSettings, patch: Partial<Pick<AppearanceSettings, 'pressBehavior'>> = {}, bgPatch: Partial<AppearanceBackground> = {}) {
  return {
    pressBehavior: patch.pressBehavior ?? a.pressBehavior,
    volumeIndicator: a.volumeIndicator,
    background: {
      kind: a.background.kind,
      solid: a.background.solid,
      gradientFrom: a.background.gradientFrom,
      gradientTo: a.background.gradientTo,
      gradientAngle: a.background.gradientAngle,
      preset: a.background.preset,
      imageX: a.background.imageX,
      imageY: a.background.imageY,
      imageZoom: a.background.imageZoom,
      ...bgPatch,
    },
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

type BgTab = 'solid' | 'gradient' | 'preset' | 'image'

/** Abschnitt 1c: Deck-Hintergrund ("Plate") - vier Quellen, jeweils mit Live-Vorschau + Speichern. */
function BackgroundSection({ appearance, onSaved }: { appearance: AppearanceSettings; onSaved: (a: AppearanceSettings) => void }) {
  const bg = appearance.background
  const [tab, setTab] = useState<BgTab>(bg.kind)
  const [solid, setSolid] = useState(bg.solid)
  const [gradientFrom, setGradientFrom] = useState(bg.gradientFrom)
  const [gradientTo, setGradientTo] = useState(bg.gradientTo)
  const [gradientAngle, setGradientAngle] = useState(bg.gradientAngle)
  const [selectedPreset, setSelectedPreset] = useState(bg.preset)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const previewBg: AppearanceBackground =
    tab === 'solid'
      ? { ...bg, kind: 'solid', solid }
      : tab === 'gradient'
        ? { ...bg, kind: 'gradient', gradientFrom, gradientTo, gradientAngle }
        : tab === 'preset'
          ? { ...bg, kind: 'preset', preset: selectedPreset }
          : { ...bg, kind: 'image' }

  const save = async (bgPatch: Partial<AppearanceBackground>) => {
    setSaving(true)
    try {
      const result = await api<AppearanceSettings>('/api/settings/appearance', { method: 'PUT', body: toInput(appearance, {}, bgPatch) })
      onSaved(result)
      toast('Hintergrund gespeichert.', 'success')
    } catch (e) {
      toast(`Hintergrund konnte nicht gespeichert werden: ${errorMessage(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await apiUpload<{ imageUrl: string }>('/api/settings/appearance/background-image', form)
      setPendingImageUrl(result.imageUrl)
      setCropOpen(true)
    } catch (e) {
      toast(`Bild-Upload fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = async () => {
    try {
      await api('/api/settings/appearance/background-image', { method: 'DELETE' })
      const result = await api<AppearanceSettings>('/api/settings/appearance')
      onSaved(result)
      toast('Hintergrundbild entfernt.', 'success')
    } catch (e) {
      toast(`Bild konnte nicht entfernt werden: ${errorMessage(e)}`, 'error')
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconPalette size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Deck-Hintergrund</h2>
          <p className="text-xs text-ink-faint">Die Fläche hinter den Tasten auf der Live-Deck-Ansicht.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {(['solid', 'gradient', 'preset', 'image'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} className="chip-select h-9 px-3 text-sm" onClick={() => setTab(t)}>
            {t === 'solid' ? 'Farbe' : t === 'gradient' ? 'Verlauf' : t === 'preset' ? 'Muster' : 'Bild'}
          </button>
        ))}
      </div>

      {/* Live-Vorschau */}
      <div className="mb-4 aspect-video w-full overflow-hidden rounded-card border border-line" style={resolveBackgroundStyle(previewBg)} />

      {tab === 'solid' && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="bg-solid">
              Farbe
            </label>
            <div className="flex items-center gap-2">
              <input id="bg-solid" type="color" className="h-9 w-14 cursor-pointer rounded-ctl border border-line bg-surface p-1" value={solid} onChange={(e) => setSolid(e.target.value)} />
              <input className="field w-32 font-mono" value={solid} onChange={(e) => setSolid(e.target.value)} maxLength={7} />
            </div>
          </div>
          <button className="btn btn-confirm" disabled={saving} onClick={() => void save({ kind: 'solid', solid })}>
            <IconCheck size={16} /> {saving ? 'Speichert …' : 'Übernehmen'}
          </button>
        </div>
      )}

      {tab === 'gradient' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="bg-grad-from">
                Von
              </label>
              <input id="bg-grad-from" type="color" className="h-9 w-14 cursor-pointer rounded-ctl border border-line bg-surface p-1" value={gradientFrom} onChange={(e) => setGradientFrom(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="bg-grad-to">
                Nach
              </label>
              <input id="bg-grad-to" type="color" className="h-9 w-14 cursor-pointer rounded-ctl border border-line bg-surface p-1" value={gradientTo} onChange={(e) => setGradientTo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="bg-grad-angle">
              Winkel: {gradientAngle}°
            </label>
            <input
              id="bg-grad-angle"
              type="range"
              min={0}
              max={360}
              className="w-full max-w-sm accent-[var(--c-brand-solid)]"
              value={gradientAngle}
              onChange={(e) => setGradientAngle(Number(e.target.value))}
              onPointerUp={() => void save({ kind: 'gradient', gradientFrom, gradientTo, gradientAngle })}
            />
          </div>
          <button className="btn btn-confirm" disabled={saving} onClick={() => void save({ kind: 'gradient', gradientFrom, gradientTo, gradientAngle })}>
            <IconCheck size={16} /> {saving ? 'Speichert …' : 'Übernehmen'}
          </button>
        </div>
      )}

      {tab === 'preset' && (
        <div className="space-y-3">
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-auto rounded-ctl border border-line bg-surface-2 p-2 sm:grid-cols-4 md:grid-cols-6">
            {PLATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.name}
                aria-label={p.name}
                aria-pressed={selectedPreset === p.key}
                onClick={() => setSelectedPreset(p.key)}
                className="group relative aspect-square overflow-hidden rounded-ctl ring-offset-2 ring-offset-surface-2 transition-transform hover:scale-105 aria-pressed:ring-2 aria-pressed:ring-select"
                style={{ background: p.css }}
              >
                {selectedPreset === p.key && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-select text-white">
                    <IconSquareCheck size={12} />
                  </span>
                )}
              </button>
            ))}
            {PHOTO_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.name}
                aria-label={p.name}
                aria-pressed={selectedPreset === p.key}
                onClick={() => setSelectedPreset(p.key)}
                className="group relative aspect-square overflow-hidden rounded-ctl bg-cover bg-center ring-offset-2 ring-offset-surface-2 transition-transform hover:scale-105 aria-pressed:ring-2 aria-pressed:ring-select"
                style={{ backgroundImage: `url(${p.url})` }}
              >
                {selectedPreset === p.key && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-select text-white">
                    <IconSquareCheck size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-faint">
            {PLATE_PRESETS.length} gestaltete Muster + {PHOTO_PRESETS.length} Fotos – {selectedPreset ? 'ausgewählt: ' + (PLATE_PRESETS.find((p) => p.key === selectedPreset)?.name ?? PHOTO_PRESETS.find((p) => p.key === selectedPreset)?.name ?? selectedPreset) : 'noch nichts ausgewählt'}.
          </p>
          <button className="btn btn-confirm" disabled={saving || !selectedPreset} onClick={() => void save({ kind: 'preset', preset: selectedPreset })}>
            <IconCheck size={16} /> {saving ? 'Speichert …' : 'Übernehmen'}
          </button>
        </div>
      )}

      {tab === 'image' && (
        <div className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void uploadFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <IconUpload size={16} /> {uploading ? 'Lädt hoch …' : bg.imageUrl ? 'Bild ändern' : 'Bild hochladen'}
            </button>
            {bg.imageUrl && (
              <>
                <button className="btn btn-ghost" onClick={() => { setPendingImageUrl(bg.imageUrl); setCropOpen(true) }}>
                  <IconPhoto size={16} /> Zuschnitt anpassen
                </button>
                <button className="btn btn-danger-ghost" onClick={() => void removeImage()}>
                  <IconTrash size={16} /> Entfernen
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-ink-faint">PNG, JPEG oder WebP, max. 8 MB. Nach dem Hochladen lässt sich der Ausschnitt anpassen.</p>
        </div>
      )}

      <BackgroundImageCropModal
        open={cropOpen}
        imageUrl={pendingImageUrl}
        initialX={bg.imageX}
        initialY={bg.imageY}
        initialZoom={bg.imageZoom}
        saving={saving}
        onClose={() => setCropOpen(false)}
        onConfirm={(x, y, zoom) => {
          void save({ kind: 'image', imageX: x, imageY: y, imageZoom: zoom }).then(() => setCropOpen(false))
        }}
      />
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
        <BackgroundSection appearance={appearance} onSaved={setLocal} />
      </div>
    </AppShell>
  )
}
