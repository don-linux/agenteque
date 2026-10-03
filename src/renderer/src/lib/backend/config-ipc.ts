import type {
  AppConfig,
  AppearanceSettings,
  LayoutSettings,
  TerminalSettings,
  WorkspaceView,
} from '../../../../shared/config'

/** Lo que `app-config.svelte.ts` necesita del proceso principal. */
export interface ConfigBackend {
  load(): Promise<AppConfig>
  saveTerminal(terminal: TerminalSettings): Promise<AppConfig>
  saveAppearance(appearance: AppearanceSettings): Promise<AppConfig>
  saveLayout(layout: LayoutSettings): Promise<AppConfig>
  saveWorkspaceView(view: WorkspaceView): Promise<AppConfig>
  recordRecent(path: string): Promise<AppConfig>
  removeRecent(path: string): Promise<AppConfig>
}

export const configIpc: ConfigBackend = {
  load: () => window.api.loadConfig(),
  saveTerminal: (terminal) => window.api.saveTerminalSettings(terminal),
  saveAppearance: (appearance) => window.api.saveAppearanceSettings(appearance),
  saveLayout: (layout) => window.api.saveLayoutSettings(layout),
  saveWorkspaceView: (view) => window.api.saveWorkspaceView(view),
  recordRecent: (path) => window.api.recordRecentFolder(path),
  removeRecent: (path) => window.api.removeRecentFolder(path),
}
