export type Params = Record<string, string | number | boolean | null | undefined | ActionStep[] | unknown>

export interface MultiSwitchParams {
  onSteps: ActionStep[]
  offSteps: ActionStep[]
  labelOff?: string
  iconOff?: string
}

export interface ActionStep {
  type: string
  params?: Params | null
}

export interface ButtonModel {
  id: number
  pageId: number
  row: number
  column: number
  label: string
  icon: string | null
  color: string
  actions: ActionStep[]
  /** z.B. "Ctrl+Shift+KeyF" - siehe lib/hotkeys.ts */
  hotkey: string | null
}

export interface PageModel {
  id: number
  parentPageId: number | null
  name: string
  buttons: ButtonModel[]
}

/** OBS-Leistungswerte waehrend einer Aufnahme (obs-websocket GetStats). */
export interface ObsStats {
  cpuUsage: number
  memoryUsageMb: number
  availableDiskSpaceMb: number
  activeFps: number
  averageFrameRenderTimeMs: number
  renderSkippedFrames: number
  renderTotalFrames: number
  outputSkippedFrames: number
  outputTotalFrames: number
  /** Bisher geschriebene Bytes der laufenden Aufnahme. */
  outputBytes: number
  recordDirectory: string | null
  /** Datei, in die gerade aufgenommen wird (falls ermittelbar). */
  recordPath: string | null
  /** Leinwand (Basis-Aufloesung) und Ausgabe-Aufloesung, Soll-Bildrate laut OBS. */
  baseWidth: number
  baseHeight: number
  outputWidth: number
  outputHeight: number
  targetFps: number
  /** Aufnahme-Einstellungen des OBS-Profils (nur waehrend einer Aufnahme). */
  record?: RecordSettings | null
  /** Stream-Einstellungen des OBS-Profils (nur waehrend eines Streams). */
  streamSettings?: StreamSettings | null
  /** Tatsaechlich gesendete Stream-Bitrate in kbit/s und Netzwerk-Stau (0-1). */
  streamKbps: number
  streamCongestion: number
}

export interface AudioTrackInfo {
  number: number
  /** Eigener Spurname aus OBS, sonst null. */
  name: string | null
}
export interface RecordSettings {
  /** z. B. "AV1 · NVIDIA NVENC". */
  codec: string
  /** z. B. "Hybrid MP4". */
  format: string
  tracks: AudioTrackInfo[]
}
export interface StreamSettings {
  codec: string | null
  /** Enhanced Broadcasting: Dienst (Twitch) waehlt Codec und Videospuren selbst. */
  enhanced: boolean
  /** Bandbreiten-Limit in kbit/s; null = automatisch. */
  maxKbps: number | null
  maxVideoTracks: number | null
}

/** Oeffentlicher Twitch-Stand (keine Zugangsdaten): Live-Zahlen des verbundenen Kanals. */
export interface TwitchSnapshot {
  configured: boolean
  connected: boolean
  login: string | null
  live: boolean
  viewers: number
  startedAt: string | null
  title: string | null
  game: string | null
  followers: number | null
  subs: number | null
  /** false, solange der Kanal kein Abo-Programm hat (kein Twitch-Affiliate/-Partner). */
  subsAvailable: boolean
  error: string | null
  /** Was im oberen OLED angezeigt wird - jede Angabe ist einzeln abschaltbar (Einstellungen > Twitch). */
  showViewers: boolean
  showSubs: boolean
  showCategory: boolean
  showTitle: boolean
  updatedAt: string
}

export interface TwitchDeviceFlow {
  userCode: string
  verificationUri: string
  expiresAt: string
}

/** Status fuer die Einstellungen (nur Besitzer): laufende Anmeldung + Hinweis auf die gespeicherte Client-ID (nie vollstaendig). */
export interface TwitchStatus {
  snapshot: TwitchSnapshot
  flow: TwitchDeviceFlow | null
  clientIdHint: string | null
}

/** Laufende Wiedergabe (Spotify als App oder im Browser, andere Player) aus der Windows-Mediensteuerung. */
export interface NowPlaying {
  /** Anzeigename des Players, z.B. "Spotify", "Edge". */
  app: string
  title: string
  artist: string
  album: string | null
  playing: boolean
  /** Position zum Empfangszeitpunkt (der Server rechnet vor dem Senden auf "jetzt" hoch); 0 = Anfang. */
  positionSeconds: number
  /** 0 = unbekannt (Livestream). */
  durationSeconds: number
  /** Aendert sich mit dem Cover-Bild; null = kein Cover (Bild: GET /api/now-playing/cover). */
  coverId?: string | null
}

/** Aktiver Windows-Monitor mit HDR-Zustand und den unterstützten Auflösungen (Hz absteigend). */
export interface DisplayResolution {
  width: number
  height: number
  refreshRates: number[]
}
export interface DisplayInfo {
  id: string
  name: string
  gdiName: string
  isPrimary: boolean
  hdrSupported: boolean
  hdrEnabled: boolean
  width: number
  height: number
  refreshRate: number
  resolutions: DisplayResolution[]
  /** Monitor ist gedreht (Hochkant) - Breite/Höhe sind trotzdem in der nativen Ausrichtung angegeben. */
  rotated?: boolean
}

/** Aktives Windows-Audiogeraet: Wiedergabe ("output") oder Aufnahme/Mikrofon ("input"). */
export interface AudioDevice {
  id: string
  name: string
  kind: 'output' | 'input'
  isDefault: boolean
  percent: number
  muted: boolean
  /** Daempfung des Reglers in dB (0 = voll aufgedreht). */
  volumeDb?: number
}

/** Seitliches OLED-Display neben dem Tastenraster. source: "system", "obs:<Eingangsname>" oder "win:<Windows-Geraete-ID>". */
export interface SideDisplay {
  id: string
  side: 'left' | 'right'
  source: string
  label?: string | null
}

export interface DeckModel {
  id: number
  name: string
  rows: number
  columns: number
  sortOrder: number
  pages: PageModel[]
  sideDisplays: SideDisplay[]
  /** Groesse des oberen OLED-Displays der Plate: eine Zeile oder gross (Cover + Titel/Interpret/Album). */
  oledSize: 'normal' | 'large'
}

export type ObsConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface ObsSceneItem {
  id: number
  sourceName: string
  enabled: boolean
  isGroup: boolean
}

export interface ObsScene {
  name: string
  items: ObsSceneItem[]
}

export interface ObsSnapshot {
  status: ObsConnectionStatus
  error: string | null
  obsVersion: string | null
  programScene: string | null
  programSceneSince: string | null
  previewScene: string | null
  studioMode: boolean
  scenes: ObsScene[]
  audioInputs: { name: string; muted: boolean; volumeDb: number }[]
  inputs: { name: string; kind: string }[]
  mediaInputs: { name: string; playing: boolean }[]
  transitions: string[]
  currentTransition: string | null
  sceneCollections: string[]
  currentSceneCollection: string | null
  profiles: string[]
  currentProfile: string | null
  streaming: boolean
  streamStartedAt: string | null
  recording: boolean
  recordPaused: boolean
  recordStartedAt: string | null
  replayBuffer: boolean
  virtualCam: boolean
  filters: { source: string; filterName: string; enabled: boolean }[]
}

/** Globale Aussehen-Einstellungen - siehe backend AppearanceController. Jedes Geraet darf lesen,
 * nur der Besitzer darf aendern. */
export interface AppearanceSettings {
  pressBehavior: 'spring' | 'stay'
  volumeIndicator?: 'led' | 'level' | 'corner' | 'glow' | 'none'
  /** Zustandsanzeige: "fill" (Vollfläche), "glow" (Diffusor-LED), "corner" (Eck-Diffusor), "led" (Runde LED), "level" (Status-Strich), "icon" (Nur Symbol/Text). */
  stateStyle: 'fill' | 'glow' | 'corner' | 'led' | 'level' | 'icon'
  /** Gewaehlte Gehaeuse-Plate-Fassung um das Tastenraster ("house:<key>", siehe lib/housePlates.ts). */
  plate: string
  /** Optisches Subpixel-Mesh ueber alle Tasten (LCD CueDeck Matrix). */
  displayMesh: boolean
  /** Tastenoberflaeche: glatt, Subpixel-Matrix oder flache OLED-Displays (ohne Tastenhub, ohne Druckverhalten). */
  keySurface?: 'smooth' | 'mesh' | 'oled'
  /** Eigene Beschriftung oben rechts im SushiFlux-Gehaeuse (max. 16 Zeichen; leer = ausgeblendet; nie gesetzt = "SUSHIFLUX"). */
  plateText?: string
  ledColors?: string[]
  ledEffect?: string
  ledSpeed?: number
}

export type FieldKind =
  | 'display'
  | 'scene'
  | 'sceneItem'
  | 'audioInput'
  | 'audioDevice'
  | 'page'
  | 'rootPage'
  | 'source'
  | 'filter'
  | 'mediaInput'
  | 'browserInput'
  | 'transition'
  | 'sceneCollection'
  | 'profile'
  | 'automation'
  | 'text'
  | 'number'
  | 'select'
  | 'url'

export interface ActionField {
  key: string
  label: string
  kind: FieldKind
  required: boolean
  options: { value: string; label: string }[] | null
  default: string | null
}

export interface ActionDefinition {
  type: string
  category: string
  name: string
  description: string
  icon: string
  fields: ActionField[]
  suggestedColor: string | null
  /** Reine Anzeige-Kachel (z.B. Live-Systemwert) statt klickbarer Auslöser. */
  displayOnly: boolean
}

export interface Catalog {
  actions: ActionDefinition[]
  triggers: ActionDefinition[]
  conditions: ActionDefinition[]
}

export type DeviceRole = 'owner' | 'controller'

export interface Me {
  id: number
  name: string
  role: DeviceRole
}

export interface DeviceModel {
  id: number
  name: string
  role: DeviceRole
  createdAt: string
  lastSeenAt: string | null
  isCurrent: boolean
}

export interface AutomationModel {
  id: number
  name: string
  enabled: boolean
  /** Gesetzt = an diese Taste gebunden (Ausloeser dann implizit "button.pressed"). */
  buttonId: number | null
  trigger: ActionStep
  conditions: ActionStep[]
  actions: ActionStep[]
  lastRun: { at: string; ok: boolean; error: string | null } | null
}

export interface PluginModel {
  id: string
  name: string
  version: string
  author: string | null
  icon: string
  actions: ActionDefinition[]
}

export interface AutomationState {
  id: number
  name: string
  enabled: boolean
}

/** Live-Systemwerte (CPU/GPU/RAM) - Werte sind null, wenn kein Sensor gefunden wurde. */
export interface SystemMonitorSnapshot {
  available: boolean
  cpuLoad: number | null
  cpuTemp: number | null
  gpuLoad: number | null
  gpuTemp: number | null
  ramLoad: number | null
  volumePercent: number | null
  volumeMuted: boolean | null
  error: string | null
}
