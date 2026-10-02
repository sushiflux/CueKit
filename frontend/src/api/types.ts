export type Params = Record<string, string | number | boolean | null | undefined>

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

export interface DeckModel {
  id: number
  name: string
  rows: number
  columns: number
  sortOrder: number
  pages: PageModel[]
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
  volumeIndicator: 'led' | 'level' | 'corner' | 'glow'
  /** Zustandsdarstellung der Tasten: "fill" = Vollflaeche (an gruen, aus rot), "icon" = nur Symbol/Text farbig. */
  stateStyle: 'fill' | 'icon'
  /** Gewaehlte Gehaeuse-Plate-Fassung um das Tastenraster ("house:<key>", siehe lib/housePlates.ts)
   * oder "" fuer kein Gehaeuse (nur die normale App-Flaeche). */
  plate: string
}

export type FieldKind =
  | 'scene'
  | 'sceneItem'
  | 'audioInput'
  | 'page'
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
