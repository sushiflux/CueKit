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
  audioInputs: { name: string; muted: boolean }[]
  streaming: boolean
  streamStartedAt: string | null
  recording: boolean
  recordPaused: boolean
  recordStartedAt: string | null
  replayBuffer: boolean
  virtualCam: boolean
}

export type FieldKind = 'scene' | 'sceneItem' | 'audioInput' | 'page' | 'text' | 'number' | 'select'

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
