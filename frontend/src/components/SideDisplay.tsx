import { useEffect, useRef } from 'react'
import type { AudioDevice, ObsSnapshot, SideDisplay as SideDisplayModel, SystemMonitorSnapshot } from '../api/types'
import { INPUT_LEVEL_SUFFIX, useMeterDb } from '../state/meters'
import { ORIGIN_ICONS, type AudioOrigin } from '../lib/origin'
import { KeyIcon } from './KeyIcon'

const METER_MIN_DB = -60

export interface SideDisplayInfo {
  /** Schluessel im Pegel-Store (state/meters.ts). */
  meterKey: string
  name: string
  isSystem: boolean
  /** Herkunft: Windows-Geraet/Standard-Ausgabe (unbearbeitet, ohne Filter) oder OBS-Quelle (kann Filter haben). */
  origin: AudioOrigin
  /** Aktive OBS-Filter der Quelle (nur bei origin 'obs'). */
  filters?: string[]
  /** Windows-Mikrofon/Aufnahmegeraet - bestimmt das Icon. */
  isInput?: boolean
  muted: boolean
  /** Eingestellte Lautstaerke 0..1 (Fader/Windows-Regler), null wenn unbekannt. */
  volume?: number | null
  /** false, solange die Quelle nicht abrufbar ist (OBS offline, Quelle gibt es nicht mehr). */
  available: boolean
}

/** Anzeigename, Stumm-Zustand und Verfuegbarkeit einer Display-Quelle ("system", "obs:<Name>" oder "win:<Geraete-ID>"). */
export function sideDisplayInfo(source: string, obs: ObsSnapshot | null, systemMonitor: SystemMonitorSnapshot | null, audioDevices: AudioDevice[] = []): SideDisplayInfo {
  if (source.startsWith('win:')) {
    const device = audioDevices.find((d) => d.id === source.slice(4))
    return { meterKey: source, origin: 'windows', name: device?.name ?? 'Audiogerät', isSystem: device?.kind === 'output', isInput: device?.kind === 'input', muted: device?.muted === true, volume: device ? device.percent / 100 : null, available: !!device }
  }
  if (source === 'system') {
    return { meterKey: 'system', origin: 'windows', name: 'System', isSystem: true, muted: systemMonitor?.volumeMuted === true, volume: systemMonitor?.volumePercent != null ? systemMonitor.volumePercent / 100 : null, available: true }
  }
  const name = source.replace(/^obs:/, '')
  const input = obs?.status === 'connected' ? obs.audioInputs.find((a) => a.name === name) : undefined
  const filters = obs?.status === 'connected' ? obs.filters.filter((f) => f.source === name && f.enabled).map((f) => f.filterName) : []
  return { meterKey: source, origin: 'obs', filters, name, isSystem: false, muted: input?.muted === true, volume: input ? Math.max(0, Math.min(1, (input.volumeDb + 60) / 60)) : null, available: !!input }
}

interface Props {
  display: SideDisplayModel
  info: SideDisplayInfo
  orientation: 'vertical' | 'horizontal'
  width: number
  height: number
  onPress?: () => void
}

/**
 * Schmales OLED-Display neben dem Tastenraster: Quellenname, Live-Pegel (segmentiert, gruen/orange/rot
 * wie in OBS) und Stumm-Zustand. Hochkant (links/rechts) oder liegend (Handy im Hochformat, dort
 * ueber/unter dem transponierten Raster). Klick schaltet die Quelle stumm. Nur die Pegel-Teile
 * zeichnen pro Update neu (siehe state/meters.ts).
 */
export function SideDisplay({ display, info, orientation, width, height, onPress }: Props) {
  const label = display.label?.trim() || info.name
  const thin = Math.min(width, height)
  const icon = !info.available ? 'tabler:plug-connected-x' : info.isInput ? (info.muted ? 'tabler:microphone-off' : 'tabler:microphone') : info.isSystem ? (info.muted ? 'tabler:volume-off' : 'tabler:volume') : info.muted ? 'tabler:microphone-off' : 'tabler:microphone'

  return (
    <button
      type="button"
      className="oled-display"
      data-orientation={orientation}
      data-origin={info.origin}
      data-muted={info.muted || undefined}
      data-offline={!info.available || undefined}
      style={{ width, height, fontSize: Math.max(10, Math.min(16, Math.round(thin * 0.14))) }}
      onClick={onPress}
      disabled={!onPress || !info.available}
      title={info.available ? `${label} · ${originText(info)} – ${info.muted ? 'stumm (Klick: Ton an)' : 'Klick: stumm schalten'}` : `${label} – nicht verfügbar`}
      aria-label={`${label}, ${info.muted ? 'stumm' : 'Ton an'}`}
    >
      {orientation === 'vertical' ? (
        <>
          {/* Hochkant: Pegelbalken oben (nimmt die volle Resthoehe), darunter Icon + dB-Wert, ganz unten der Name - alles waagerecht lesbar. */}
          <OriginMarks info={info} corner />
          <span className="oled-bars">
            <OledMeter meterKey={info.meterKey} muted={info.muted} available={info.available} />
            <OledVolume volume={info.volume ?? null} available={info.available} />
          </span>
          <span className="oled-foot">
            <span className="oled-icon">
              <KeyIcon name={icon} size="1.4em" />
            </span>
            <OledReadout meterKey={info.meterKey} muted={info.muted} available={info.available} />
          </span>
          <span className="oled-name">
            <span className="oled-name-text">{label}</span>
          </span>
        </>
      ) : (
        <>
          <span className="oled-icon">
            <KeyIcon name={icon} size="1.5em" />
          </span>
          <span className="oled-name">
            <OriginMarks info={info} />
            <span className="oled-name-text">{label}</span>
          </span>
          <span className="oled-bars">
            <OledMeter meterKey={info.meterKey} muted={info.muted} available={info.available} />
            <OledVolume volume={info.volume ?? null} available={info.available} />
          </span>
          <OledReadout meterKey={info.meterKey} muted={info.muted} available={info.available} />
        </>
      )}
    </button>
  )
}

function originText(info: SideDisplayInfo): string {
  if (info.origin === 'obs') return info.filters?.length ? `OBS-Quelle mit Filtern: ${info.filters.join(', ')}` : 'OBS-Quelle (ohne aktive Filter)'
  return 'Windows-Gerät (unbearbeitet, ohne Filter)'
}

/** Kleine Herkunftsmarke vor dem Namen: Windows-Logo (unbearbeitetes Geraet) bzw. OBS-Logo (+ Filter-Symbol, wenn Filter aktiv sind). */
function OriginMarks({ info, corner = false }: { info: SideDisplayInfo; corner?: boolean }) {
  const filtered = (info.filters?.length ?? 0) > 0
  return (
    <span className="oled-origin" data-corner={corner || undefined} title={originText(info)}>
      <KeyIcon name={ORIGIN_ICONS[info.origin]} size="1.25em" />
      {filtered && <KeyIcon name="tabler:adjustments-horizontal" size="1.25em" />}
    </span>
  )
}

function useLevel(meterKey: string, muted: boolean) {
  // Stumm: Eingangspegel (vor Fader/Stumm), damit das Signal grau weiter sichtbar ist.
  const db = useMeterDb(muted ? `${meterKey}${INPUT_LEVEL_SUFFIX}` : meterKey)
  return db
}

/** Anstiegs-/Abfallgeschwindigkeit der Anzeige (1/s): schneller Anstieg, deutlich langsameres Abklingen - wie ein echtes Pegelinstrument. */
const ATTACK_RATE = 30
const RELEASE_RATE = 5

function OledMeter({ meterKey, muted, available }: { meterKey: string; muted: boolean; available: boolean }) {
  const db = useLevel(meterKey, muted)
  const target = !available || db == null ? 0 : Math.min(1, Math.max(0, (db - METER_MIN_DB) / -METER_MIN_DB))
  const meterRef = useRef<HTMLSpanElement>(null)
  const targetRef = useRef(target)
  const shown = useRef(0)
  const raf = useRef(0)
  targetRef.current = target

  // Die Pegelwerte kommen nur ~20x pro Sekunde - die Anzeige glaettet dazwischen mit eigener Animation (rAF),
  // direkt am Element (kein React-Render pro Frame). Die Schleife laeuft nur, solange sich etwas bewegt.
  useEffect(() => {
    if (raf.current) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = targetRef.current
      let v = shown.current
      v += (t - v) * (1 - Math.exp(-(t > v ? ATTACK_RATE : RELEASE_RATE) * dt))
      if (Math.abs(t - v) < 0.0004) v = t
      shown.current = v
      meterRef.current?.style.setProperty('--lvl', `${(v * 100).toFixed(2)}%`)
      raf.current = v === t ? 0 : requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [target])

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0 // StrictMode: nach dem Aufraeumen muss die Schleife neu starten duerfen
    },
    [],
  )

  // Ein durchgehender Balken: der Farbverlauf liegt fest ueber der ganzen Laenge, der Pegel schneidet ihn mit harter Kante frei (clip-path).
  return (
    <span ref={meterRef} className="oled-meter" aria-hidden="true">
      <span className="oled-meter-fill" />
    </span>
  )
}

/** Schmaler Balken neben dem Pegel: die eingestellte Lautstaerke (Fader bzw. Windows-Regler), 0..100 %. */
function OledVolume({ volume, available }: { volume: number | null; available: boolean }) {
  const v = !available || volume == null ? 0 : Math.min(1, Math.max(0, volume))
  return (
    <span className="oled-volume" style={{ ['--vol' as string]: `${(v * 100).toFixed(1)}%` }} title={volume == null ? undefined : `Lautstärke ${Math.round(v * 100)} %`} aria-hidden="true">
      <span className="oled-volume-fill" />
    </span>
  )
}

function OledReadout({ meterKey, muted, available }: { meterKey: string; muted: boolean; available: boolean }) {
  const db = useLevel(meterKey, muted)
  const text = muted ? 'MUTE' : !available ? '–' : db == null || db <= METER_MIN_DB ? '−∞' : `${Math.round(db)}`
  return <span className="oled-readout">{text}</span>
}
