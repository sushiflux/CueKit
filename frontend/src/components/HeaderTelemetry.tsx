import { useStore } from '../state/store'
import { KeyIcon } from './KeyIcon'

/** Last-Farbe wie am Auslastungsring der Tasten (components/RingGauge.tsx): gruen / orange / rot. */
function loadColor(load: number | null | undefined): string {
  if (load == null) return '#7d8798'
  return load >= 80 ? '#ef4444' : load >= 50 ? '#f59e0b' : '#22c55e'
}

const pct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v)}%`)
const deg = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v)}°`)

/**
 * Live-Hardwarewerte im oberen OLED der Gehaeuse-Plate: Auslastung (und Temperatur) von CPU und GPU
 * sowie RAM-Auslastung. Die Werte kommen aus dem gemeinsamen Monitor-Store (siehe DeckPage: das Abo laeuft,
 * solange eine Plate mit solchem Display sichtbar ist). Temperaturen brauchen unter Windows meist
 * Administratorrechte (start-admin.ps1) - sonst steht dort "–".
 */
export function HeaderTelemetry({ tiles = false }: { tiles?: boolean }) {
  const m = useStore((s) => s.systemMonitor)
  const items = [
    { key: 'cpu', icon: 'tabler:cpu', label: 'CPU', load: m?.cpuLoad, temp: m?.cpuTemp },
    { key: 'gpu', icon: 'tabler:gpu', label: 'GPU', load: m?.gpuLoad, temp: m?.gpuTemp },
    { key: 'ram', icon: 'tabler:database', label: 'RAM', load: m?.ramLoad, temp: undefined },
  ]
  if (tiles) {
    // Grosses OLED: drei ruhige Spalten (Label, grosse Auslastung, Temperatur darunter), durch feine Linien getrennt
    return (
      <div className="relative z-10 hidden min-[900px]:flex items-stretch font-mono" aria-label="Systemauslastung">
        {items.map((i, idx) => (
          <div key={i.key} className={`flex min-w-[68px] flex-col items-center justify-center gap-0.5 px-4 ${idx > 0 ? 'border-l border-white/10' : ''}`} title={`${i.label}: Auslastung${i.temp !== undefined ? ' und Temperatur' : ''}`}>
            <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{i.label}</span>
            <span className="text-[20px] font-bold leading-none tabular-nums" style={{ color: loadColor(i.load) }}>
              {pct(i.load)}
            </span>
            <span className="h-[14px] text-[11px] tabular-nums text-slate-300/90">{i.temp !== undefined ? deg(i.temp) : ''}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className='relative z-10 ml-auto mr-6 hidden min-[1000px]:flex items-center gap-5 font-mono'
      aria-label="Systemauslastung"
    >
      {items.map((i) => (
        <div key={i.key} className="flex items-center gap-1.5" title={`${i.label}: Auslastung${i.temp !== undefined ? ' und Temperatur' : ''}`}>
          <KeyIcon name={i.icon} size={16} className="text-slate-400" />
          <span className="text-[10px] uppercase tracking-widest text-slate-400/90">{i.label}</span>
          <span className="min-w-[3ch] text-right text-[13px] font-bold tabular-nums" style={{ color: loadColor(i.load) }}>
            {pct(i.load)}
          </span>
          {i.temp !== undefined && <span className="min-w-[3ch] text-right text-[13px] tabular-nums text-slate-200/90">{deg(i.temp)}</span>}
        </div>
      ))}
    </div>
  )
}
