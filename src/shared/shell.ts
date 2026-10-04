/**
 * Qué shell lanzar. La búsqueda no toca el disco: `isExecutable` lo decide
 * quien llama, así los tests no dependen del sistema.
 */
export interface ShellLookup {
  platform: string
  env: Readonly<Record<string, string | undefined>>
  isExecutable(file: string): boolean
}

function pathSeparator(platform: string): string {
  return platform === 'win32' ? ';' : ':'
}

function isAbsolute(file: string, platform: string): boolean {
  if (platform === 'win32') return /^[A-Za-z]:[\\/]/.test(file) || file.startsWith('\\\\')
  return file.startsWith('/')
}

function unquote(entry: string): string {
  if (entry.length >= 2 && entry.startsWith('"') && entry.endsWith('"')) {
    return entry.slice(1, -1)
  }
  return entry
}

function join(dir: string, name: string, platform: string): string {
  const sep = platform === 'win32' ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`
}

function firstExecutable(files: readonly string[], lookup: ShellLookup): string | null {
  for (const file of files) {
    if (lookup.isExecutable(file)) return file
  }
  return null
}

function absolutePathEntries(lookup: ShellLookup): string[] {
  const raw = lookup.env.PATH ?? ''
  const sep = pathSeparator(lookup.platform)
  const dirs: string[] = []
  for (const entry of raw.split(sep)) {
    const dir = unquote(entry.trim())
    if (dir === '' || !isAbsolute(dir, lookup.platform)) continue
    dirs.push(dir)
  }
  return dirs
}

function unixShell(lookup: ShellLookup): string | null {
  const configured = lookup.env.SHELL
  if (configured && isAbsolute(configured, lookup.platform) && lookup.isExecutable(configured)) {
    return configured
  }

  const fallbacks =
    lookup.platform === 'darwin' ? ['/bin/zsh', '/bin/bash', '/bin/sh'] : ['/bin/bash', '/bin/sh']
  return firstExecutable(fallbacks, lookup)
}

function windowsShell(lookup: ShellLookup): string | null {
  const programFiles = lookup.env.ProgramFiles
  const pwshKnown =
    programFiles && isAbsolute(programFiles, 'win32')
      ? [join(programFiles, 'PowerShell\\7\\pwsh.exe', 'win32')]
      : []
  const pwshOnPath = absolutePathEntries(lookup).map((dir) => join(dir, 'pwsh.exe', 'win32'))
  const pwsh = firstExecutable([...pwshKnown, ...pwshOnPath], lookup)
  if (pwsh) return pwsh

  const root = lookup.env.SystemRoot
  if (!root || !isAbsolute(root, 'win32')) return null
  const powershell = join(root, 'System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32')
  return lookup.isExecutable(powershell) ? powershell : null
}

/** Linux y macOS: la shell Unix. Windows: PowerShell 7 si está, si no la de Windows. */
export function resolveShell(lookup: ShellLookup): string | null {
  if (lookup.platform === 'win32') return windowsShell(lookup)
  return unixShell(lookup)
}
