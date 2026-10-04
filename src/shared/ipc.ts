import type {
  AppConfig,
  AppearanceSettings,
  LayoutSettings,
  TerminalSettings,
  WorkspaceView,
} from './config'
import type { SystemFont } from './fonts'
import type { GitGraphRepository, GitProbe, GitRefRepository } from './git-text'

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
  shellStatus: 'shell:status',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyKillAll: 'pty:killAll',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  pickFolder: 'fs:pickFolder',
  listWorkspaceDirs: 'fs:listDirs',
  listContextTree: 'fs:listTree',
  readMarkdown: 'fs:readMarkdown',
  writeMarkdown: 'fs:writeMarkdown',
  createEntry: 'fs:createEntry',
  renameEntry: 'fs:renameEntry',
  moveEntry: 'fs:moveEntry',
  deleteEntry: 'fs:deleteEntry',
  workspaceChanged: 'fs:changed',
  gitRefs: 'git:refs',
  gitGraph: 'git:graph',
  gitSummary: 'git:summary',
  fontPage: 'app:fontPage',
} as const

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

export interface ShellStatus {
  available: boolean
}

export interface PtySpawnRequest {
  id: string
  cwd: string
  cols: number
  rows: number
}

export interface PtyChunk {
  id: string
  data: string
}

export interface PtyExit {
  id: string
  code: number
}

export interface WorkspaceDirsResult {
  root: string
  dirs: string[]
}

export interface TreeNodeResult {
  name: string
  path: string
  kind: 'dir' | 'file'
  children: TreeNodeResult[]
}

export interface EntryRequest {
  root: string
  path: string
  kind: 'dir' | 'file'
}

export interface MoveRequest {
  root: string
  from: string
  to: string
  kind: 'dir' | 'file'
}

export interface GitRefsResult {
  probe: GitProbe
  repository?: GitRefRepository
  error?: string
}

export interface GitGraphResult {
  probe: GitProbe
  repository?: GitGraphRepository
  error?: string
}

export interface GitSummaryRepository {
  toplevel: string
  branch?: string
  detached: boolean
}

export interface GitSummaryResult {
  probe: GitProbe
  repository?: GitSummaryRepository
  error?: string
}

export interface FontPageRequest {
  query: string
  offset: number
  limit: number
}

export interface FontPageResult {
  families: SystemFont[]
  total: number
  scanning: boolean
  error?: string
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
  shellStatus(): Promise<ShellStatus>
  ptySpawn(request: PtySpawnRequest): Promise<void>
  ptyWrite(id: string, data: string): Promise<void>
  ptyResize(id: string, cols: number, rows: number): Promise<void>
  ptyKill(id: string): Promise<void>
  ptyKillAll(): Promise<void>
  onPtyData(listener: (chunk: PtyChunk) => void): () => void
  onPtyExit(listener: (exit: PtyExit) => void): () => void
  pickFolder(): Promise<string | null>
  listWorkspaceDirs(root: string): Promise<WorkspaceDirsResult>
  listContextTree(root: string, includeDirs: string[] | null): Promise<TreeNodeResult[]>
  readMarkdown(root: string, path: string): Promise<string>
  writeMarkdown(root: string, path: string, contents: string): Promise<void>
  createEntry(request: EntryRequest): Promise<void>
  renameEntry(request: MoveRequest): Promise<void>
  moveEntry(request: MoveRequest): Promise<void>
  deleteEntry(request: EntryRequest): Promise<void>
  onWorkspaceChanged(listener: (root: string) => void): () => void
  gitRefs(root: string): Promise<GitRefsResult>
  gitGraph(root: string, selected: string[]): Promise<GitGraphResult>
  gitSummary(root: string): Promise<GitSummaryResult>
  fontPage(request: FontPageRequest): Promise<FontPageResult>
}
