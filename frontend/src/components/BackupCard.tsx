import { IconDatabaseExport, IconDownload, IconUpload } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { errorMessage } from '../api/client'
import { downloadExport, importFile } from '../lib/backup'
import { toast } from './Toasts'

/** Einstellungen > Sichern & Wiederherstellen: alle Decks exportieren bzw. eine Sicherung einspielen. */
export function BackupCard() {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)

  const exportAll = async () => {
    setBusy('export')
    try {
      await downloadExport()
      toast('Sicherung heruntergeladen.', 'success')
    } catch (e) {
      toast(`Export fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy('import')
    try {
      const result = await importFile(file)
      toast(result.message, result.skippedHotkeys || result.droppedActions ? 'info' : 'success', 8000)
    } catch (e) {
      toast(`Import fehlgeschlagen: ${errorMessage(e)}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-brand-soft text-brand">
          <IconDatabaseExport size={20} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Sichern & Wiederherstellen</h2>
          <p className="text-xs text-ink-faint">Alle Decks mit Tasten, Ordnern, Icons, Tastenkürzeln und Automationen – z.B. vor einer PC-Neuinstallation.</p>
        </div>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Beim Importieren werden die Decks <strong className="text-ink">zusätzlich</strong> angelegt – Bestehendes wird nie überschrieben. Bereits vergebene Tastenkürzel werden ausgelassen.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = '' // dieselbe Datei erneut waehlbar
          }}
        />
        <button className="btn btn-ghost" onClick={() => input.current?.click()} disabled={busy !== null}>
          <IconUpload size={16} /> {busy === 'import' ? 'Importiert …' : 'Sicherung importieren'}
        </button>
        <button className="btn btn-confirm" onClick={() => void exportAll()} disabled={busy !== null}>
          <IconDownload size={16} /> {busy === 'export' ? 'Exportiert …' : 'Alle Decks exportieren'}
        </button>
      </div>
    </section>
  )
}
