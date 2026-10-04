import { GIT_OVERRIDE_VAR } from './git-text'

export interface GitSearchInput {
  platform: string
  overridePath: string | undefined
  pathVar: string | undefined
  env: Readonly<Record<string, string | undefined>>
}

export interface GitCandidate {
  /** Ruta que se ejecuta. Un override relativo de un solo nombre se lanza como `./nombre`. */
  spawnPath: string
  /** Ruta que se informa. En un override, la que escribió el usuario. */
  reportedPath: string
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

function exeName(platform: string): string {
  return platform === 'win32' ? 'git.exe' : 'git'
}

function fallbacks(input: GitSearchInput): string[] {
  if (input.platform === 'darwin') {
    return ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']
  }
  if (input.platform === 'win32') {
    const tails = [
      ['ProgramFiles', 'Git\\cmd\\git.exe'],
      ['ProgramFiles', 'Git\\bin\\git.exe'],
      ['ProgramFiles(x86)', 'Git\\cmd\\git.exe'],
      ['LOCALAPPDATA', 'Programs\\Git\\cmd\\git.exe'],
      ['USERPROFILE', 'scoop\\shims\\git.exe'],
    ] as const
    const files: string[] = []
    for (const [variable, tail] of tails) {
      const base = input.env[variable]
      if (!base || !isAbsolute(base, 'win32')) continue
      files.push(join(base, tail, 'win32'))
    }
    return files
  }
  return ['/usr/bin/git', '/usr/local/bin/git']
}

/**
 * Candidatos en orden, sin lanzarlos. Las entradas relativas de PATH se
 * ignoran para que un repositorio no plante su propio `git`.
 */
export function gitCandidatePaths(input: GitSearchInput): string[] {
  const name = exeName(input.platform)
  const sep = input.platform === 'win32' ? ';' : ':'
  const fromPath = (input.pathVar ?? '')
    .split(sep)
    .map((entry) => unquote(entry.trim()))
    .filter((dir) => dir !== '' && isAbsolute(dir, input.platform))
    .map((dir) => join(dir, name, input.platform))

  const seen = new Set<string>()
  const paths: string[] = []
  for (const file of [...fromPath, ...fallbacks(input)]) {
    if (seen.has(file)) continue
    seen.add(file)
    paths.push(file)
  }
  return paths
}

/** Un nombre suelto (`git`) se lanza como `./git`, no buscado otra vez en PATH. */
export function overrideCandidate(raw: string, platform: string): GitCandidate {
  const trimmed = raw.trim()
  const hasSeparator = trimmed.includes('/') || trimmed.includes('\\')
  const spawnPath = hasSeparator ? trimmed : join('.', trimmed, platform)
  return { spawnPath, reportedPath: trimmed }
}

export function overrideFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env[GIT_OVERRIDE_VAR]
  if (!value || value.trim() === '') return undefined
  return value
}
