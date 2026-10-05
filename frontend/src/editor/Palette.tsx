import { useDraggable } from '@dnd-kit/core'
import { IconChevronRight, IconSearch } from '@tabler/icons-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { ActionStep, AudioDevice, Catalog, DisplayInfo, ObsSnapshot } from '../api/types'
import { KeyIcon } from '../components/KeyIcon'
import { defaultParams } from './StepEditor'

/** Sonderfaelle, die statt einer einfachen Taste etwas Besonderes anlegen. */
export type TileKind = 'folder' | 'multi' | 'multi-switch'

export interface PaletteItem {
  id: string
  label: string
  sublabel?: string
  icon: string
  color: string
  actions: ActionStep[]
  kind?: TileKind
}

/** Ein Eintrag mit optionalen Varianten (z.B. Mikro: Stumm / Lauter / Leiser). */
export interface PaletteEntry extends PaletteItem {
  variants?: (PaletteItem & { short: string })[]
}

export interface PaletteSection {
  id: string
  title: string
  entries: PaletteEntry[]
  emptyHint?: string
}

export interface PaletteGroup {
  id: string
  title: string
  icon: string
  sections: PaletteSection[]
}

const step = (type: string, params: ActionStep['params'] = {}): ActionStep[] => [{ type, params }]

/** Baut die Palette aus dem Live-Zustand von OBS, dem Aktionskatalog und den Plugins. */
export function buildPalette(obs: ObsSnapshot | null, catalog: Catalog | null, audioDevices: AudioDevice[] = [], audioDevicesError: string | null = null, displays: DisplayInfo[] = []): PaletteGroup[] {
  const def = (type: string) => defaultParams(catalog?.actions.find((a) => a.type === type))

  const browserInputs = new Set((obs?.inputs ?? []).filter((i) => i.kind === 'browser_source').map((i) => i.name))

  const liveScenes: PaletteEntry[] = (obs?.scenes ?? []).map((s) => ({
    id: `scene:${s.name}`,
    label: s.name,
    icon: 'tabler:layout-board',
    color: 'violet',
    actions: step('obs.scene.switch', { scene: s.name }),
    variants: [{ id: `scene-preview:${s.name}`, short: 'Vorschau', label: `${s.name} (Vorschau)`, icon: 'tabler:eye', color: 'indigo', actions: step('obs.scene.preview', { scene: s.name }) }],
  }))

  const defaultSceneEntries: PaletteEntry[] = [
    {
      id: 'ctl:scene-switch',
      label: 'Szene wechseln',
      sublabel: 'Szene danach wählen',
      icon: 'tabler:layout-board',
      color: 'violet',
      actions: step('obs.scene.switch', def('obs.scene.switch')),
      variants: [{ id: 'ctl:scene-preview', short: 'Vorschau', label: 'Szene (Vorschau)', icon: 'tabler:eye', color: 'indigo', actions: step('obs.scene.preview', def('obs.scene.preview')) }],
    },
  ]

  const liveSources: PaletteEntry[] = (obs?.scenes ?? []).flatMap((s) =>
    s.items.map((i) => ({
      id: `source:${s.name}:${i.id}`,
      label: i.sourceName,
      sublabel: s.name,
      icon: i.isGroup ? 'tabler:folders' : browserInputs.has(i.sourceName) ? 'tabler:world' : 'tabler:photo',
      color: 'sky',
      actions: step('obs.source.visibility', { scene: s.name, source: i.sourceName, mode: 'toggle' }),
      variants: browserInputs.has(i.sourceName)
        ? [{ id: `refresh:${s.name}:${i.id}`, short: 'Neu laden', label: `${i.sourceName} neu laden`, icon: 'tabler:refresh', color: 'sky', actions: step('obs.source.refresh', { input: i.sourceName }) }]
        : undefined,
    })),
  )

  const defaultSourceEntries: PaletteEntry[] = [
    {
      id: 'ctl:source-visibility',
      label: 'Quelle ein/aus',
      sublabel: 'Quelle danach wählen',
      icon: 'tabler:photo',
      color: 'sky',
      actions: step('obs.source.visibility', def('obs.source.visibility')),
      variants: [{ id: 'ctl:source-refresh', short: 'Neu laden', label: 'Browserquelle neu laden', icon: 'tabler:refresh', color: 'sky', actions: step('obs.source.refresh', def('obs.source.refresh')) }],
    },
    {
      id: 'ctl:source-refresh-direct',
      label: 'Browserquelle neu laden',
      sublabel: 'Browser-Quelle danach wählen',
      icon: 'tabler:refresh',
      color: 'sky',
      actions: step('obs.source.refresh', def('obs.source.refresh')),
    },
  ]

  const liveAudio: PaletteEntry[] = (obs?.audioInputs ?? []).map((a) => ({
    id: `audio:${a.name}`,
    label: a.name,
    sublabel: 'Stumm / Ton an',
    icon: /mic|mikro/i.test(a.name) ? 'tabler:microphone' : 'tabler:volume',
    color: 'emerald',
    actions: step('obs.audio.mute', { input: a.name, mode: 'toggle' }),
    variants: [
      { id: `vol-up:${a.name}`, short: 'Lauter', label: `${a.name} +`, icon: 'mdi:volume-plus', color: 'emerald', actions: step('obs.audio.volume', { input: a.name, mode: 'up', step: 3 }) },
      { id: `vol-down:${a.name}`, short: 'Leiser', label: `${a.name} −`, icon: 'mdi:volume-minus', color: 'emerald', actions: step('obs.audio.volume', { input: a.name, mode: 'down', step: 3 }) },
    ],
  }))

  const defaultAudioEntries: PaletteEntry[] = [
    {
      id: 'ctl:audio-mute',
      label: 'Stumm / Ton an',
      sublabel: 'Audioquelle danach wählen',
      icon: 'tabler:microphone',
      color: 'emerald',
      actions: step('obs.audio.mute', def('obs.audio.mute')),
      variants: [
        { id: 'ctl:audio-vol-up', short: 'Lauter', label: 'Audioquelle +', icon: 'mdi:volume-plus', color: 'emerald', actions: step('obs.audio.volume', { ...def('obs.audio.volume'), mode: 'up', step: 3 }) },
        { id: 'ctl:audio-vol-down', short: 'Leiser', label: 'Audioquelle −', icon: 'mdi:volume-minus', color: 'emerald', actions: step('obs.audio.volume', { ...def('obs.audio.volume'), mode: 'down', step: 3 }) },
      ],
    },
    {
      id: 'ctl:audio-volume',
      label: 'Lautstärke ändern',
      sublabel: 'Lauter, leiser oder Zielwert',
      icon: 'tabler:volume',
      color: 'emerald',
      actions: step('obs.audio.volume', def('obs.audio.volume')),
    },
  ]

  const liveMedia: PaletteEntry[] = (obs?.mediaInputs ?? []).map((m) => ({
    id: `media:${m.name}`,
    label: m.name,
    sublabel: 'Abspielen / Pause',
    icon: 'tabler:player-play',
    color: 'pink',
    actions: step('obs.media', { input: m.name, mode: 'playpause' }),
    variants: [
      { id: `media-stop:${m.name}`, short: 'Stopp', label: `${m.name} Stopp`, icon: 'tabler:player-stop', color: 'pink', actions: step('obs.media', { input: m.name, mode: 'stop' }) },
      { id: `media-restart:${m.name}`, short: 'Von vorn', label: `${m.name} von vorn`, icon: 'tabler:player-skip-back', color: 'pink', actions: step('obs.media', { input: m.name, mode: 'restart' }) },
    ],
  }))

  const defaultMediaEntries: PaletteEntry[] = [
    {
      id: 'ctl:media-control',
      label: 'Medien abspielen / Pause',
      sublabel: 'Medienquelle danach wählen',
      icon: 'tabler:player-play',
      color: 'pink',
      actions: step('obs.media', def('obs.media')),
      variants: [
        { id: 'ctl:media-stop', short: 'Stopp', label: 'Medien Stopp', icon: 'tabler:player-stop', color: 'pink', actions: step('obs.media', { ...def('obs.media'), mode: 'stop' }) },
        { id: 'ctl:media-restart', short: 'Von vorn', label: 'Medien von vorn', icon: 'tabler:player-skip-back', color: 'pink', actions: step('obs.media', { ...def('obs.media'), mode: 'restart' }) },
      ],
    },
  ]

  const liveProfiles: PaletteEntry[] = [
    ...(obs?.sceneCollections ?? []).map((c) => ({ id: `collection:${c}`, label: c, sublabel: 'Szenensammlung', icon: 'tabler:stack-2', color: 'teal', actions: step('obs.collection', { collection: c }) })),
    ...(obs?.profiles ?? []).map((p) => ({ id: `profile:${p}`, label: p, sublabel: 'Profil', icon: 'tabler:user-cog', color: 'teal', actions: step('obs.profile', { profile: p }) })),
  ]

  const defaultProfileEntries: PaletteEntry[] = [
    { id: 'ctl:collection', label: 'Szenensammlung wechseln', sublabel: 'Sammlung danach wählen', icon: 'tabler:stack-2', color: 'teal', actions: step('obs.collection', def('obs.collection')) },
    { id: 'ctl:profile', label: 'Profil wechseln', sublabel: 'Profil danach wählen', icon: 'tabler:user-cog', color: 'teal', actions: step('obs.profile', def('obs.profile')) },
  ]

  const liveTransitions: PaletteEntry[] = (obs?.transitions ?? []).map((t) => ({
    id: `transition:${t}`,
    label: t,
    sublabel: 'Übergang wählen',
    icon: 'tabler:transition-right',
    color: 'indigo',
    actions: step('obs.transition.set', { transition: t }),
  }))

  const defaultTransitionEntry: PaletteEntry = {
    id: 'ctl:transition-set',
    label: 'Übergang wählen',
    sublabel: 'Übergang danach wählen',
    icon: 'tabler:transition-right',
    color: 'indigo',
    actions: step('obs.transition.set', def('obs.transition.set')),
  }

  const obsGroup: PaletteGroup = {
    id: 'obs',
    title: 'OBS',
    icon: 'simple-icons:obsstudio',
    sections: [
      {
        id: 'scenes',
        title: 'Szenen',
        entries: liveScenes.length > 0 ? liveScenes : defaultSceneEntries,
      },
      {
        id: 'sources',
        title: 'Quellen',
        entries: liveSources.length > 0 ? liveSources : defaultSourceEntries,
      },
      {
        id: 'audio',
        title: 'Audio',
        entries: liveAudio.length > 0 ? liveAudio : defaultAudioEntries,
      },
      {
        id: 'media',
        title: 'Medien',
        entries: liveMedia.length > 0 ? liveMedia : defaultMediaEntries,
      },
      {
        id: 'outputs',
        title: 'Stream & Aufnahme',
        entries: [
          { id: 'ctl:stream', label: 'Stream', icon: 'tabler:broadcast', color: 'red', actions: step('obs.stream', def('obs.stream')) },
          { id: 'ctl:record', label: 'Aufnahme', icon: 'tabler:player-record', color: 'rose', actions: step('obs.record', def('obs.record')) },
          { id: 'ctl:pause', label: 'Aufnahme pausieren', icon: 'tabler:player-pause', color: 'amber', actions: step('obs.record.pause') },
          { id: 'ctl:chapter', label: 'Kapitelmarke', icon: 'tabler:bookmark', color: 'rose', actions: step('obs.record.chapter') },
          { id: 'ctl:split', label: 'Aufnahme teilen', icon: 'tabler:scissors', color: 'rose', actions: step('obs.record.split') },
          { id: 'ctl:replay', label: 'Replay-Puffer', icon: 'tabler:history', color: 'orange', actions: step('obs.replay', def('obs.replay')) },
          { id: 'ctl:replay-save', label: 'Replay speichern', icon: 'tabler:device-floppy', color: 'orange', actions: step('obs.replay.save') },
          { id: 'ctl:vcam', label: 'Virtuelle Kamera', icon: 'tabler:camera', color: 'teal', actions: step('obs.vcam', def('obs.vcam')) },
        ],
      },
      {
        id: 'studio',
        title: 'Studio & Übergänge',
        entries: [
          { id: 'ctl:studio', label: 'Studio-Modus', icon: 'tabler:layout-columns', color: 'indigo', actions: step('obs.studio', def('obs.studio')) },
          { id: 'ctl:transition', label: 'Übergang auslösen', icon: 'tabler:arrows-exchange', color: 'indigo', actions: step('obs.studio.transition') },
          ...(liveTransitions.length > 0 ? liveTransitions : [defaultTransitionEntry]),
        ],
      },
      {
        id: 'profiles',
        title: 'Profile & Sammlungen',
        entries: liveProfiles.length > 0 ? liveProfiles : defaultProfileEntries,
      },
      {
        id: 'advanced',
        title: 'Erweitert',
        entries: [
          { id: 'ctl:filter', label: 'Filter ein/aus', sublabel: 'Quelle & Filter danach wählen', icon: 'tabler:filter', color: 'sky', actions: step('obs.filter', def('obs.filter')) },
          { id: 'ctl:hotkey', label: 'OBS-Hotkey', sublabel: 'Name danach eintragen', icon: 'tabler:keyboard', color: 'slate', actions: step('obs.hotkey') },
        ],
      },
    ],
  }

  const deckGroup: PaletteGroup = {
    id: 'deck',
    title: 'Deck',
    icon: 'tabler:layout-grid',
    sections: [
      {
        id: 'deck',
        title: 'Tasten & Navigation',
        entries: [
          { id: 'deck:multi', label: 'Multifunktion', sublabel: 'Mehrere Aktionen nacheinander', icon: 'tabler:stack-3', color: 'violet', actions: [], kind: 'multi' },
          {
            id: 'deck:multi-switch',
            label: 'Multi-Aktionsschalter',
            sublabel: 'Zwei Zustände mit eigenen Aktionen',
            icon: 'tabler:toggle-right',
            color: 'indigo',
            actions: [{ type: 'deck.multiSwitch', params: { onSteps: [], offSteps: [], labelOff: '', iconOff: '' } }],
            kind: 'multi-switch',
          },
          { id: 'deck:folder', label: 'Ordner', icon: 'tabler:folder-plus', color: 'amber', actions: [], kind: 'folder' },
          { id: 'deck:back', label: 'Zurück', sublabel: 'Eine Ordner-Ebene zurück', icon: 'tabler:arrow-back-up', color: 'slate', actions: step('deck.back') },
          { id: 'deck:prev-page', label: 'Seite zurück', sublabel: 'Zur vorherigen Seite blättern', icon: 'tabler:arrow-left', color: 'slate', actions: step('deck.prevPage') },
          { id: 'deck:next-page', label: 'Seite weiter', sublabel: 'Zur nächsten Seite blättern', icon: 'tabler:arrow-right', color: 'slate', actions: step('deck.nextPage') },
          { id: 'deck:home', label: 'Home', sublabel: 'Home-Seite danach wählen', icon: 'tabler:home', color: 'slate', actions: step('deck.home', def('deck.home')) },
        ],
      },
    ],
  }

  const monitorMetrics: { metric: string; label: string; icon: string }[] = [
    { metric: 'cpuLoad', label: 'CPU-Auslastung', icon: 'tabler:cpu' },
    { metric: 'cpuTemp', label: 'CPU-Temperatur', icon: 'tabler:thermometer' },
    { metric: 'gpuLoad', label: 'GPU-Auslastung', icon: 'tabler:gpu' },
    { metric: 'gpuTemp', label: 'GPU-Temperatur', icon: 'tabler:thermometer' },
    { metric: 'ramLoad', label: 'RAM-Auslastung', icon: 'tabler:database' },
  ]

  // Alle aktiven Windows-Audiogeraete: Ausgaben (Lautsprecher, Kopfhoerer, virtuelle Geraete) und Eingaenge (Mikrofone).
  const deviceEntry = (d: AudioDevice): PaletteEntry => ({
    id: `win:${d.id}`,
    label: d.name,
    sublabel: d.isDefault ? 'Stumm / Ton an · Standard' : 'Stumm / Ton an',
    icon: d.kind === 'input' ? 'tabler:microphone' : 'tabler:headphones',
    color: 'cyan',
    actions: step('system.mute', { device: d.id, mode: 'toggle' }),
    variants: [
      { id: `win-up:${d.id}`, short: 'Lauter', label: `${d.name} +`, icon: 'mdi:volume-plus', color: 'cyan', actions: step('system.volume', { device: d.id, mode: 'up', step: 5 }) },
      { id: `win-down:${d.id}`, short: 'Leiser', label: `${d.name} −`, icon: 'mdi:volume-minus', color: 'cyan', actions: step('system.volume', { device: d.id, mode: 'down', step: 5 }) },
    ],
  })

  // Monitore: HDR nur fuer HDR-faehige; Aufloesungen als feste Tasten (native + gaengige Stufen, soweit der Monitor sie kann).
  const COMMON_RESOLUTIONS: [number, number][] = [[5120, 1440], [3840, 2160], [3840, 1080], [3440, 1440], [2560, 1440], [1920, 1080], [1280, 720]]
  const hdrEntry = (m: DisplayInfo): PaletteEntry => ({
    id: `hdr:${m.id}`,
    label: `HDR · ${m.name}`,
    sublabel: 'HDR ein / aus',
    icon: 'tabler:sun-high',
    color: 'amber',
    actions: step('system.hdr', { display: m.id, mode: 'toggle' }),
    variants: [
      { id: `hdr-on:${m.id}`, short: 'HDR an', label: `HDR an · ${m.name}`, icon: 'tabler:sun-high', color: 'amber', actions: step('system.hdr', { display: m.id, mode: 'on' }) },
      { id: `hdr-off:${m.id}`, short: 'HDR aus', label: `HDR aus · ${m.name}`, icon: 'tabler:sun-off', color: 'amber', actions: step('system.hdr', { display: m.id, mode: 'off' }) },
    ],
  })
  const resolutionEntries = (m: DisplayInfo): PaletteEntry[] => {
    const native = m.resolutions[0]
    const wanted = new Map<string, [number, number]>()
    if (native) wanted.set(`${native.width}x${native.height}`, [native.width, native.height])
    for (const [w, h] of COMMON_RESOLUTIONS) if (m.resolutions.some((r) => r.width === w && r.height === h)) wanted.set(`${w}x${h}`, [w, h])
    // Umschalter zwischen Hauptaufloesung (A) und einer kleineren (B, bevorzugt 1920x1080); die Taste zeigt die aktuelle Aufloesung.
    const small = m.resolutions.find((r) => r.width === 1920 && r.height === 1080) ?? [...m.resolutions].reverse().find((r) => COMMON_RESOLUTIONS.some(([w, h]) => w === r.width && h === r.height)) ?? m.resolutions[m.resolutions.length - 1]
    const toggle: PaletteEntry[] =
      native && small && (small.width !== native.width || small.height !== native.height)
        ? [{
            id: `res-toggle:${m.id}`,
            label: `${m.name}: umschalten`,
            sublabel: `${native.width}×${native.height} ⇄ ${small.width}×${small.height}`,
            icon: 'tabler:arrows-exchange',
            color: 'cyan',
            actions: step('system.resolution.toggle', { display: m.id, widthA: native.width, heightA: native.height, widthB: small.width, heightB: small.height }),
          }]
        : []
    return [...toggle, ...[...wanted.values()].map(([w, h]) => ({
      id: `res:${m.id}:${w}x${h}`,
      short: `${w}×${h}`,
      label: `${m.name}: ${w}×${h}`,
      icon: 'tabler:device-desktop',
      color: 'cyan',
      actions: step('system.resolution', { display: m.id, width: w, height: h }),
    }))]
  }
  const displayHint = 'Keine Monitore gefunden (nur im nativ installierten Windows-Dienst verfügbar).'

  const deviceHint = (what: string) =>
    audioDevicesError ? `Geräteliste nicht ladbar: ${audioDevicesError}. Dienst neu starten (start.ps1).` : `Keine ${what} gefunden.`

  const systemGroup: PaletteGroup = {
    id: 'system',
    title: 'System',
    icon: 'tabler:cpu',
    sections: [
      {
        id: 'volume',
        title: 'Lautstärke',
        entries: [
          {
            id: 'system:mute',
            label: 'Stumm / Ton an',
            icon: 'tabler:volume',
            color: 'cyan',
            actions: step('system.mute', def('system.mute')),
            variants: [
              { id: 'system:vol-up', short: 'Lauter', label: 'Systemlautstärke +', icon: 'mdi:volume-plus', color: 'cyan', actions: step('system.volume', { mode: 'up', step: 5 }) },
              { id: 'system:vol-down', short: 'Leiser', label: 'Systemlautstärke −', icon: 'mdi:volume-minus', color: 'cyan', actions: step('system.volume', { mode: 'down', step: 5 }) },
            ],
          },
        ],
      },
      {
        id: 'win-outputs',
        title: 'Audioquellen · Ausgabe',
        entries: audioDevices.filter((d) => d.kind === 'output').map(deviceEntry),
        emptyHint: deviceHint('Wiedergabegeräte'),
      },
      {
        id: 'win-inputs',
        title: 'Audioquellen · Eingang',
        entries: audioDevices.filter((d) => d.kind === 'input').map(deviceEntry),
        emptyHint: deviceHint('Aufnahmegeräte'),
      },
      {
        id: 'hdr',
        title: 'Monitor · HDR',
        entries: displays.filter((m) => m.hdrSupported).map(hdrEntry),
        emptyHint: displays.length > 0 ? 'Kein angeschlossener Monitor unterstützt HDR.' : displayHint,
      },
      {
        id: 'resolution',
        title: 'Monitor · Auflösung',
        entries: [
          ...displays.flatMap(resolutionEntries),
          { id: 'system:resolution', label: 'Eigene Auflösung', sublabel: 'Monitor und Größe danach wählen', icon: 'tabler:device-desktop-cog', color: 'cyan', actions: step('system.resolution', def('system.resolution')) },
        ],
      },
      {
        id: 'misc',
        title: 'Sonstiges',
        entries: [
          { id: 'system:browser', label: 'Browser öffnen', sublabel: 'URL danach eintragen', icon: 'tabler:world', color: 'cyan', actions: step('system.browser.open', def('system.browser.open')) },
          { id: 'system:program', label: 'Programm öffnen', sublabel: 'Pfad zur .exe danach eintragen', icon: 'tabler:app-window', color: 'cyan', actions: step('system.program.open', def('system.program.open')) },
          { id: 'system:path', label: 'Datei / Ordner öffnen', sublabel: 'Pfad danach eintragen', icon: 'tabler:folder-open', color: 'cyan', actions: step('system.path.open', def('system.path.open')) },
        ],
      },
      {
        id: 'power',
        title: 'Energie',
        entries: [
          {
            id: 'system:shutdown',
            label: 'Herunterfahren',
            sublabel: 'Programme dürfen nachfragen',
            icon: 'tabler:power',
            color: 'red',
            actions: step('system.shutdown', { mode: 'normal' }),
            variants: [
              { id: 'system:shutdown-force', short: 'Erzwungen', label: 'Herunterfahren erzwingen', icon: 'tabler:power', color: 'red', actions: step('system.shutdown', { mode: 'force' }) },
            ],
          },
        ],
      },
      {
        id: 'monitor',
        title: 'System-Wert anzeigen',
        entries: monitorMetrics.map((m) => ({
          id: `system:monitor:${m.metric}`,
          label: m.label,
          sublabel: 'Live-Anzeige, kein Auslöser',
          icon: m.icon,
          color: 'cyan',
          actions: step('system.monitor.display', { metric: m.metric }),
        })),
      },
    ],
  }

  // Jedes Plugin als eigene Gruppe - wie OBS.
  const pluginActions = (catalog?.actions ?? []).filter((a) => a.type.startsWith('plugin:'))
  const pluginGroups: PaletteGroup[] = [...new Set(pluginActions.map((a) => a.category))].map((name) => ({
    id: `plugin:${name}`,
    title: name,
    icon: 'tabler:puzzle',
    sections: [
      {
        id: 'actions',
        title: 'Aktionen',
        entries: pluginActions
          .filter((a) => a.category === name)
          .map((a) => ({ id: `plugin:${a.type}`, label: a.name, icon: a.icon, color: a.suggestedColor ?? 'slate', actions: step(a.type, defaultParams(a)) })),
      },
    ],
  }))

  // Twitch: Live-Werte als Anzeige-Kacheln und Aktionen (Anmeldung unter Einstellungen > Twitch)
  const twitchGroup: PaletteGroup = {
    id: 'twitch',
    title: 'Twitch',
    icon: 'tabler:brand-twitch',
    sections: [
      {
        id: 'twitch-stats',
        title: 'Anzeige',
        entries: [
          { id: 'twitch:viewers', label: 'Live-Zuschauer', sublabel: 'Live-Wert auf der Kachel', icon: 'tabler:eye', color: 'violet', actions: step('twitch.display', { metric: 'twitchViewers' }) },
          { id: 'twitch:followers', label: 'Follower', sublabel: 'Gesamtzahl auf der Kachel', icon: 'tabler:heart', color: 'violet', actions: step('twitch.display', { metric: 'twitchFollowers' }) },
          { id: 'twitch:subs', label: 'Abonnenten (Subs)', sublabel: 'Gesamtzahl auf der Kachel', icon: 'tabler:star', color: 'violet', actions: step('twitch.display', { metric: 'twitchSubs' }) },
          { id: 'twitch:uptime', label: 'Stream-Zeit', sublabel: 'Wie lange du schon live bist', icon: 'tabler:clock', color: 'violet', actions: step('twitch.display', { metric: 'twitchUptime' }) },
        ],
      },
      {
        id: 'twitch-actions',
        title: 'Aktionen',
        entries: [
          { id: 'twitch:clip', label: 'Clip erstellen', sublabel: 'Letzte Sekunden des Streams', icon: 'tabler:movie', color: 'violet', actions: step('twitch.clip', {}) },
          { id: 'twitch:category', label: 'Kategorie setzen', sublabel: 'Spielname danach eintragen', icon: 'tabler:category', color: 'violet', actions: step('twitch.category', def('twitch.category')) },
          { id: 'twitch:title', label: 'Titel setzen', sublabel: 'Stream-Titel danach eintragen', icon: 'tabler:letter-case', color: 'violet', actions: step('twitch.title', def('twitch.title')) },
          { id: 'twitch:chat', label: 'Chat-Nachricht senden', sublabel: 'Text/Befehl danach eintragen (z. B. !preise)', icon: 'tabler:message-circle', color: 'violet', actions: step('twitch.chat', def('twitch.chat')) },
          { id: 'twitch:marker', label: 'Stream-Marker setzen', sublabel: 'Lesezeichen im Stream', icon: 'tabler:bookmark', color: 'violet', actions: step('twitch.marker', def('twitch.marker')) },
        ],
      },
    ],
  }

  // Reihenfolge: OBS, System, weitere Plugins - "Deck" (Navigation) bewusst zuletzt.
  return [obsGroup, systemGroup, twitchGroup, ...pluginGroups, deckGroup]
}

function DragHandle({ item, children, className, onAdd, title }: { item: PaletteItem; children: React.ReactNode; className: string; onAdd: (item: PaletteItem) => void; title?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${item.id}`, data: { item } })
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd(item)} data-color={item.color} className={`${className} touch-none ${isDragging ? 'opacity-40' : ''}`} title={title}>
      {children}
    </button>
  )
}

function EntryRow({ entry, onAdd }: { entry: PaletteEntry; onAdd: (item: PaletteItem) => void }) {
  return (
    <div className="group rounded-ctl border border-transparent px-1.5 py-1 hover:border-line hover:bg-surface-2">
      <DragHandle item={entry} onAdd={onAdd} className="flex w-full items-center gap-2.5 text-left" title="Auf eine Taste ziehen – oder klicken für den nächsten freien Platz">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl"
          style={{ background: 'color-mix(in oklab, var(--key-solid) 18%, transparent)', color: 'var(--key-solid)' }}
        >
          <KeyIcon name={entry.icon} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{entry.label}</span>
          {entry.sublabel && <span className="block truncate text-xs text-ink-faint">{entry.sublabel}</span>}
        </span>
      </DragHandle>
      {entry.variants && entry.variants.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-[2.6rem]">
          {entry.variants.map((v) => (
            <DragHandle
              key={v.id}
              item={v}
              onAdd={onAdd}
              className="flex h-6 items-center gap-1 rounded-badge border border-line bg-surface px-1.5 text-[11px] font-semibold text-ink-muted hover:border-line-strong hover:text-ink"
              title={v.label}
            >
              <KeyIcon name={v.icon} size={12} /> {v.short}
            </DragHandle>
          ))}
        </div>
      )}
    </div>
  )
}

function Collapsible({ title, count, open, onToggle, level, icon }: { title: string; count?: number; open: boolean; onToggle: () => void; level: 1 | 2; icon?: string }) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-ctl text-left transition-colors hover:bg-surface-2 ${
        level === 1 ? 'px-2 py-2 text-sm font-extrabold tracking-tight text-ink' : 'px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted'
      }`}
      onClick={onToggle}
      aria-expanded={open}
    >
      <IconChevronRight size={level === 1 ? 15 : 13} className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`} />
      {icon && <KeyIcon name={icon} size={16} className="shrink-0 text-brand" />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {count != null && <span className="text-[11px] font-semibold text-ink-faint">{count}</span>}
    </button>
  )
}

export function Palette({ groups, onAdd }: { groups: PaletteGroup[]; onAdd: (item: PaletteItem) => void }) {
  const [query, setQuery] = useState('')
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
  // Standardmaessig offen: Szenen, Audio, Stream & Aufnahme - der Rest auf Klick.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['obs/scenes', 'obs/audio', 'obs/outputs', 'deck/deck']))

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return null
    return groups.flatMap((g) =>
      g.sections.flatMap((s) =>
        s.entries.filter((e) => `${e.label} ${e.sublabel ?? ''} ${s.title} ${g.title}`.toLowerCase().includes(q)),
      ),
    )
  }, [groups, q])

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 pb-2">
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="field h-9 pl-8" placeholder="Aktionen durchsuchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">Nichts gefunden.</p>
          ) : (
            matches.map((e) => <EntryRow key={e.id} entry={e} onAdd={onAdd} />)
          )
        ) : (
          groups.map((g) => {
            const groupOpen = !closedGroups.has(g.id)
            return (
              <div key={g.id} className="mb-1">
                <Collapsible level={1} title={g.title} icon={g.icon} open={groupOpen} onToggle={() => toggle(closedGroups, g.id, setClosedGroups)} />
                <AnimatePresence initial={false}>
                  {groupOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden pl-2">
                      {g.sections.map((s) => {
                        const key = `${g.id}/${s.id}`
                        const sectionOpen = g.sections.length === 1 || openSections.has(key)
                        return (
                          <div key={key}>
                            {g.sections.length > 1 && (
                              <Collapsible level={2} title={s.title} count={s.entries.length} open={sectionOpen} onToggle={() => toggle(openSections, key, setOpenSections)} />
                            )}
                            {sectionOpen && (
                              <div className="pb-1">
                                {s.entries.length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-ink-faint">{s.emptyHint ?? 'Keine Einträge.'}</p>
                                ) : (
                                  s.entries.map((e) => <EntryRow key={e.id} entry={e} onAdd={onAdd} />)
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })
        )}
        <p className="px-3 pt-3 text-[11px] leading-relaxed text-ink-faint">
          Tipp: Auf eine Taste ziehen – oder eine leere Taste anklicken für Multifunktion und Ordner.
        </p>
      </div>
    </div>
  )
}
