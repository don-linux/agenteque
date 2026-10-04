export const MIN_GIT_VERSION = { major: 2, minor: 15, patch: 0 } as const

export const GIT_OVERRIDE_VAR = 'AGENTEQUE_GIT'

const VERSION_PREFIX = 'git version '

export interface GitVersion {
  major: number
  minor: number
  patch: number
  raw: string
}

export interface GitRef {
  name: string
  hash?: string
  current: boolean
}

export interface GitCommit {
  hash: string
  short: string
  parents: string[]
  subject: string
  refs: string[]
}

export interface GitComparison {
  name: string
  mergeBase?: string
  ahead: number
  behind: number
}

export interface GitProbe {
  available: boolean
  path?: string
  version?: string
}

export interface GitRefRepository {
  current?: string
  oid?: string
  detached: boolean
  initial: boolean
  branches: GitRef[]
}

export interface GitGraphRepository {
  current?: string
  oid?: string
  detached: boolean
  initial: boolean
  commits: GitCommit[]
  comparisons: GitComparison[]
}

export function parseGitVersion(output: string): GitVersion | null {
  const line = output.split('\n')[0]?.trim() ?? ''
  if (!line.startsWith(VERSION_PREFIX)) return null
  const raw = line.slice(VERSION_PREFIX.length).trim()
  if (raw === '') return null

  const numericEnd = raw.search(/[^0-9.]/)
  const numeric = (numericEnd === -1 ? raw : raw.slice(0, numericEnd)).replace(/\.+$/, '')
  const parts = numeric.split('.')
  if (parts.some((part) => part === '' || !/^\d+$/.test(part))) return null

  const major = Number(parts[0])
  const minor = parts[1] === undefined ? 0 : Number(parts[1])
  const patch = parts[2] === undefined ? 0 : Number(parts[2])
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null
  }
  return { major, minor, patch, raw }
}

function isPrerelease(raw: string): boolean {
  const rest = raw.replace(/^[0-9.]+/, '').toLowerCase()
  return ['-rc', '-alpha', '-beta', '-pre'].some((marker) => rest.startsWith(marker))
}

export function isSupportedGitVersion(version: GitVersion): boolean {
  const floor = [MIN_GIT_VERSION.major, MIN_GIT_VERSION.minor, MIN_GIT_VERSION.patch]
  const got = [version.major, version.minor, version.patch]
  for (let index = 0; index < floor.length; index += 1) {
    const left = got[index] ?? 0
    const right = floor[index] ?? 0
    if (left > right) break
    if (left < right) return false
  }
  return !isPrerelease(version.raw)
}

export function isSafeRef(name: string): boolean {
  return (
    name !== '' &&
    !name.startsWith('-') &&
    !name.includes('..') &&
    !name.includes('\0') &&
    !name.includes('\n') &&
    !name.includes('\\')
  )
}

export function parseForEachRef(stdout: string): GitRef[] {
  const branches: GitRef[] = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const [hash = '', name = '', head = ''] = line.split('\0')
    const branch = name.trim()
    if (!isSafeRef(branch)) continue
    const oid = hash.trim()
    branches.push({
      name: branch,
      ...(oid === '' ? {} : { hash: oid }),
      current: head.trim() === '*',
    })
  }
  return branches
}

function shortRef(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.startsWith('tag: ')) return null
  const name = trimmed.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '')
  if (name.startsWith('refs/') || !isSafeRef(name)) return null
  return name
}

export function parseDecorate(raw: string): string[] {
  const refs: string[] = []
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('HEAD -> ')) {
      const name = shortRef(trimmed.slice('HEAD -> '.length))
      if (name) refs.push(name)
      continue
    }
    if (trimmed === 'HEAD') {
      refs.push('HEAD')
      continue
    }
    const name = shortRef(trimmed)
    if (name) refs.push(name)
  }
  return refs
}

export function parseGitLog(stdout: string): GitCommit[] {
  const commits: GitCommit[] = []
  const fields: string[] = []
  let current = ''

  const pushCommit = (): void => {
    const hash = fields[0]?.trim() ?? ''
    const short = fields[1]?.trim() ?? ''
    const parents = (fields[2] ?? '').split(/\s+/).filter((parent) => parent !== '')
    const refs = parseDecorate(fields[3] ?? '')
    const subject = fields[4]?.trim() ?? ''
    commits.push({ hash, short, parents, subject, refs })
    fields.length = 0
  }

  for (const char of stdout) {
    if (char === '\0') {
      fields.push(current)
      current = ''
      if (fields.length === 5) pushCommit()
      continue
    }
    current += char
  }

  if (current !== '') fields.push(current)
  if (fields.length === 5) pushCommit()
  else if (fields.length > 0) throw new Error('Git log devolvió un registro incompleto')

  return commits
}

export function parseLeftRight(text: string): { ahead: number; behind: number } {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '')
  const ahead = Number(parts[0] ?? 0)
  const behind = Number(parts[1] ?? 0)
  return {
    ahead: Number.isInteger(ahead) && ahead >= 0 ? ahead : 0,
    behind: Number.isInteger(behind) && behind >= 0 ? behind : 0,
  }
}

/** El fatal principal, no una ruta que solo contenga esas palabras. */
export function isNotARepositoryMessage(stderr: string): boolean {
  return stderr
    .split('\n')
    .some((line) => line.trim().toLowerCase().startsWith('fatal: not a git repository'))
}

export function isDubiousOwnership(stderr: string): boolean {
  return stderr.includes('detected dubious ownership')
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
