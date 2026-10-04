import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppearanceSettings,
  LayoutSettings,
  TerminalSettings,
  WorkspaceView,
} from '../shared/config'
import {
  type AgentequeApi,
  type EntryRequest,
  type FontPageRequest,
  type GitGraphResult,
  type GitRefsResult,
  type GitSummaryResult,
  type MoveRequest,
  type PtyChunk,
  type PtyExit,
  type PtySpawnRequest,
  type ShellStatus,
  type TreeNodeResult,
  type WorkspaceDirsResult,
  IpcChannel,
} from '../shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

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
  shellStatus: () => ipcRenderer.invoke(IpcChannel.shellStatus) as Promise<ShellStatus>,
  ptySpawn: (request: PtySpawnRequest) => ipcRenderer.invoke(IpcChannel.ptySpawn, request),
  ptyWrite: (id: string, data: string) => ipcRenderer.invoke(IpcChannel.ptyWrite, id, data),
  ptyResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IpcChannel.ptyResize, id, cols, rows),
  ptyKill: (id: string) => ipcRenderer.invoke(IpcChannel.ptyKill, id),
  ptyKillAll: () => ipcRenderer.invoke(IpcChannel.ptyKillAll),
  onPtyData: (listener) => subscribe<PtyChunk>(IpcChannel.ptyData, listener),
  onPtyExit: (listener) => subscribe<PtyExit>(IpcChannel.ptyExit, listener),
  pickFolder: () => ipcRenderer.invoke(IpcChannel.pickFolder),
  listWorkspaceDirs: (root: string) =>
    ipcRenderer.invoke(IpcChannel.listWorkspaceDirs, root) as Promise<WorkspaceDirsResult>,
  listContextTree: (root: string, includeDirs: string[] | null) =>
    ipcRenderer.invoke(IpcChannel.listContextTree, root, includeDirs) as Promise<TreeNodeResult[]>,
  readMarkdown: (root: string, path: string) =>
    ipcRenderer.invoke(IpcChannel.readMarkdown, root, path),
  writeMarkdown: (root: string, path: string, contents: string) =>
    ipcRenderer.invoke(IpcChannel.writeMarkdown, root, path, contents),
  createEntry: (request: EntryRequest) => ipcRenderer.invoke(IpcChannel.createEntry, request),
  renameEntry: (request: MoveRequest) => ipcRenderer.invoke(IpcChannel.renameEntry, request),
  moveEntry: (request: MoveRequest) => ipcRenderer.invoke(IpcChannel.moveEntry, request),
  deleteEntry: (request: EntryRequest) => ipcRenderer.invoke(IpcChannel.deleteEntry, request),
  onWorkspaceChanged: (listener) => subscribe<string>(IpcChannel.workspaceChanged, listener),
  gitRefs: (root: string) => ipcRenderer.invoke(IpcChannel.gitRefs, root) as Promise<GitRefsResult>,
  gitGraph: (root: string, selected: string[]) =>
    ipcRenderer.invoke(IpcChannel.gitGraph, root, selected) as Promise<GitGraphResult>,
  gitSummary: (root: string) =>
    ipcRenderer.invoke(IpcChannel.gitSummary, root) as Promise<GitSummaryResult>,
  fontPage: (request: FontPageRequest) => ipcRenderer.invoke(IpcChannel.fontPage, request),
}

contextBridge.exposeInMainWorld('api', api)
