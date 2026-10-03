export type NodeKind = 'dir' | 'file'

export interface TreeNode {
  name: string
  path: string
  kind: NodeKind
  children: TreeNode[]
}

export interface WorkspaceDirs {
  root: string
  dirs: string[]
}

/**
 * Lo que la pantalla de workspace necesita de un sistema de archivos. Las
 * firmas son las mismas que exponía el backend nativo para que cambiar de
 * implementación no toque ningún componente.
 *
 * Contrato:
 * - Las rutas que cruzan este puerto son siempre POSIX y relativas a `root`.
 *   Traducir a `\` en Windows es responsabilidad de la implementación.
 * - El editor normaliza a LF en memoria; preservar CRLF al escribir también es
 *   responsabilidad de la implementación.
 * - Las colisiones de nombre se comparan sin distinguir mayúsculas, porque en
 *   Windows y macOS `Notas.md` y `notas.md` son el mismo fichero.
 */
export interface WorkspaceBackend {
  listWorkspaceDirs(root: string): Promise<WorkspaceDirs>
  listContextTree(root: string, includeDirs: string[] | null): Promise<TreeNode[]>
  readMarkdown(root: string, path: string): Promise<string>
  writeMarkdown(root: string, path: string, contents: string): Promise<void>
  createEntry(root: string, path: string, kind: NodeKind): Promise<void>
  renameEntry(root: string, from: string, to: string, kind: NodeKind): Promise<void>
  moveEntry(root: string, from: string, to: string, kind: NodeKind): Promise<void>
  deleteEntry(root: string, path: string, kind: NodeKind): Promise<void>
}

export interface TerminalSpawn {
  id: string
  cwd: string
  cols: number
  rows: number
  onData: (chunk: string) => void
  onExit: (code: number) => void
}

export interface TerminalBackend {
  spawn(options: TerminalSpawn): Promise<void>
  write(id: string, data: string): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
  kill(id: string): Promise<void>
  killAll(): Promise<void>
}

export type BrowserCommand =
  | { cmd: 'navigate'; url: string }
  | { cmd: 'back' }
  | { cmd: 'forward' }
  | { cmd: 'stop' }
  | { cmd: 'reload'; ignoreCache: boolean }
  | { cmd: 'devtools' }

export interface BrowserBoot {
  chromium: string
}

export interface BrowserBackend {
  spawn(url: string): Promise<BrowserBoot>
  navigate(url: string): Promise<void>
  command(command: BrowserCommand): Promise<void>
  kill(): Promise<void>
}
