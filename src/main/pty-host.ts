import { spawn, type IPty } from 'node-pty'
import { constants } from 'node:fs'
import { accessSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { SHELL_MISSING_MESSAGE } from '../shared/messages'
import { resolveShell, type ShellLookup } from '../shared/shell'

export interface PtySpawnRequest {
  id: string
  cwd: string
  cols: number
  rows: number
}

interface Session {
  process: IPty
}

const sessions = new Map<string, Session>()

function fileIsExecutable(file: string): boolean {
  try {
    const info = statSync(file)
    if (!info.isFile()) return false
    if (process.platform === 'win32') return true
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function currentShell(): string | null {
  const lookup: ShellLookup = {
    platform: process.platform,
    env: process.env,
    isExecutable: fileIsExecutable,
  }
  return resolveShell(lookup)
}

function requireId(id: string): string {
  const trimmed = id.trim()
  if (trimmed === '') throw new Error('Falta el id de la terminal')
  return trimmed
}

function resolveCwd(cwd: string): string {
  const trimmed = cwd.trim()
  if (trimmed === '' || trimmed === '~') return homedir()
  if (!isAbsolute(trimmed)) throw new Error('La terminal necesita una ruta absoluta')
  return trimmed
}

function isWorkspaceSession(id: string): boolean {
  return id === 'workspace' || id.startsWith('workspace-')
}

function killSession(id: string): void {
  const current = sessions.get(id)
  if (!current) return
  sessions.delete(id)
  current.process.kill()
}

export function ptySpawn(
  request: PtySpawnRequest,
  onData: (chunk: string) => void,
  onExit: (code: number) => void,
): void {
  const id = requireId(request.id)
  const shell = currentShell()
  if (!shell) throw new Error(SHELL_MISSING_MESSAGE)

  killSession(id)

  const cols = Math.max(1, Math.trunc(request.cols))
  const rows = Math.max(1, Math.trunc(request.rows))
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'

  const pty = spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: resolveCwd(request.cwd),
    env,
  })

  pty.onData(onData)
  pty.onExit(({ exitCode }) => {
    sessions.delete(id)
    onExit(exitCode)
  })
  sessions.set(id, { process: pty })
}

export function ptyWrite(id: string, data: string): void {
  const session = sessions.get(requireId(id))
  if (!session) throw new Error('No hay terminal')
  session.process.write(data)
}

export function ptyResize(id: string, cols: number, rows: number): void {
  const session = sessions.get(requireId(id))
  if (!session) throw new Error('No hay terminal')
  session.process.resize(Math.max(1, Math.trunc(cols)), Math.max(1, Math.trunc(rows)))
}

export function ptyKill(id: string): void {
  killSession(requireId(id))
}

export function ptyKillAll(): void {
  const ids = Array.from(sessions.keys())
  for (const id of ids) {
    if (isWorkspaceSession(id)) killSession(id)
  }
}

export function ptyKillEvery(): void {
  const ids = Array.from(sessions.keys())
  for (const id of ids) killSession(id)
}
