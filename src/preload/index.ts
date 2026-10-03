import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppearanceSettings,
  LayoutSettings,
  TerminalSettings,
  WorkspaceView,
} from '../shared/config'
import { type AgentequeApi, IpcChannel } from '../shared/ipc'

const api: AgentequeApi = {
  // Determinista y disponible en un preload con sandbox, al revés que olfatear
  // el user agent, que además está deprecado.
  platform: process.platform,
  getVersions: () => ipcRenderer.invoke(IpcChannel.versions),
  notifyRendererReady: () => ipcRenderer.send(IpcChannel.rendererReady),
  loadConfig: () => ipcRenderer.invoke(IpcChannel.configLoad),
  saveTerminalSettings: (terminal: TerminalSettings) =>
    ipcRenderer.invoke(IpcChannel.configSaveTerminal, terminal),
  saveAppearanceSettings: (appearance: AppearanceSettings) =>
    ipcRenderer.invoke(IpcChannel.configSaveAppearance, appearance),
  saveLayoutSettings: (layout: LayoutSettings) =>
    ipcRenderer.invoke(IpcChannel.configSaveLayout, layout),
  saveWorkspaceView: (view: WorkspaceView) =>
    ipcRenderer.invoke(IpcChannel.configSaveWorkspaceView, view),
  recordRecentFolder: (path: string) => ipcRenderer.invoke(IpcChannel.configRecordRecent, path),
  removeRecentFolder: (path: string) => ipcRenderer.invoke(IpcChannel.configRemoveRecent, path),
}

contextBridge.exposeInMainWorld('api', api)
