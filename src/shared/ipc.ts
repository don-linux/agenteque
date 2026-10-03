import type {
  AppConfig,
  AppearanceSettings,
  LayoutSettings,
  TerminalSettings,
  WorkspaceView,
} from './config'

export const IpcChannel = {
  versions: 'app:versions',
  rendererReady: 'app:renderer-ready',
  configLoad: 'config:load',
  configSaveTerminal: 'config:saveTerminal',
  configSaveAppearance: 'config:saveAppearance',
  configSaveLayout: 'config:saveLayout',
  configSaveWorkspaceView: 'config:saveWorkspaceView',
  configRecordRecent: 'config:recordRecent',
  configRemoveRecent: 'config:removeRecent',
} as const

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

/**
 * Cada comando de configuración devuelve el `AppConfig` completo, igual que
 * hacía el backend Rust: el renderer nunca compone el estado a trozos.
 */
export interface AgentequeApi {
  readonly platform: string
  getVersions(): Promise<AppVersions>
  notifyRendererReady(): void
  loadConfig(): Promise<AppConfig>
  saveTerminalSettings(terminal: TerminalSettings): Promise<AppConfig>
  saveAppearanceSettings(appearance: AppearanceSettings): Promise<AppConfig>
  saveLayoutSettings(layout: LayoutSettings): Promise<AppConfig>
  saveWorkspaceView(view: WorkspaceView): Promise<AppConfig>
  recordRecentFolder(path: string): Promise<AppConfig>
  removeRecentFolder(path: string): Promise<AppConfig>
}
