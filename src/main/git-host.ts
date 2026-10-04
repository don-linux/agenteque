import { spawn } from 'node:child_process'
import { constants, statSync, accessSync } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { GIT_CLIENT_MISSING_MESSAGE, GIT_NOT_REPOSITORY_MESSAGE } from '../shared/messages'
import {
  gitCandidatePaths,
  overrideCandidate,
  overrideFromEnv,
  type GitCandidate,
} from '../shared/git-search'
import {
  isDubiousOwnership,
  isNotARepositoryMessage,
  isSafeRef,
  isSupportedGitVersion,
  parseForEachRef,
  parseGitLog,
  parseGitVersion,
  parseLeftRight,
  shellQuote,
  type GitCommit,
  type GitComparison,
  type GitGraphRepository,
  type GitProbe,
  type GitRef,
  type GitRefRepository,
} from '../shared/git-text'

const PROBE_TIMEOUT_MS = 250
const COMMAND_TIMEOUT_MS = 60_000
const MAX_OUTPUT = 8 * 1024 * 1024
const GRAPH_LIMIT = '1000'
const SHORT_ABBREV = '12'

const STRIPPED_ENV = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_GRAFT_FILE',
  'GIT_TRACE',
  'GIT_TRACE2',
  'GIT_TRACE2_EVENT',
  'GIT_TRACE2_PERF',
  'GIT_TRACE_PACKET',
] as const

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

interface GitBinary {
  path: string
  version: string
}

interface GitOutput {
  stdout: string
  stderr: string
  code: number
}

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

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of STRIPPED_ENV) delete env[key]
  env.LC_ALL = 'C'
  env.GIT_TERMINAL_PROMPT = '0'
  return env
}

function runGit(
  binary: string,
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<GitOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        '--no-optional-locks',
        '--no-pager',
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'log.showSignature=false',
        ...args,
      ],
      {
        cwd,
        env: gitEnv(),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    let settled = false

    const finish = (result: GitOutput | Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (result instanceof Error) reject(result)
      else resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(new Error('Git no respondió a tiempo'))
    }, timeoutMs)

    const take = (chunks: Buffer[], chunk: Buffer): void => {
      size += chunk.length
      if (size > MAX_OUTPUT) {
        child.kill()
        finish(new Error('La salida de Git supera el límite'))
        return
      }
      chunks.push(chunk)
    }

    child.stdout?.on('data', (chunk: Buffer) => take(stdout, chunk))
    child.stderr?.on('data', (chunk: Buffer) => take(stderr, chunk))
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      finish({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
        code: code ?? 1,
      })
    })
  })
}

async function probeBinary(candidate: GitCandidate): Promise<GitBinary | 'old' | null> {
  try {
    const output = await runGit(candidate.spawnPath, process.cwd(), ['--version'], PROBE_TIMEOUT_MS)
    if (output.code !== 0) return null
    const version = parseGitVersion(output.stdout)
    if (!version) return null
    if (!isSupportedGitVersion(version)) return 'old'
    return { path: candidate.reportedPath, version: version.raw }
  } catch {
    return null
  }
}

export async function discoverGit(): Promise<GitBinary | null> {
  const override = overrideFromEnv(process.env)
  if (override) {
    const candidate = overrideCandidate(override, process.platform)
    if (!fileIsExecutable(candidate.spawnPath) && !fileIsExecutable(candidate.reportedPath)) {
      throw new Error(`${GIT_CLIENT_MISSING_MESSAGE} (${override} no es un ejecutable)`)
    }
    const probed = await probeBinary({
      spawnPath: fileIsExecutable(candidate.spawnPath)
        ? candidate.spawnPath
        : candidate.reportedPath,
      reportedPath: candidate.reportedPath,
    })
    if (probed === 'old' || probed === null) return null
    return probed
  }

  const paths = gitCandidatePaths({
    platform: process.platform,
    overridePath: undefined,
    pathVar: process.env.PATH,
    env: process.env,
  })
  let sawOld = false
  for (const file of paths) {
    if (!fileIsExecutable(file)) continue
    const probed = await probeBinary({ spawnPath: file, reportedPath: file })
    if (probed === 'old') {
      sawOld = true
      continue
    }
    if (probed) return probed
  }
  if (sawOld) return null
  return null
}

function missingProbe(): GitProbe {
  return { available: false }
}

function readyProbe(binary: GitBinary): GitProbe {
  return { available: true, path: binary.path, version: binary.version }
}

async function directoryOrThrow(root: string): Promise<string> {
  const trimmed = root.trim()
  if (trimmed === '') throw new Error('Falta la carpeta')
  let info
  try {
    info = await lstat(trimmed)
  } catch {
    throw new Error(`No existe la carpeta \`${trimmed}\``)
  }
  if (!info.isDirectory()) throw new Error(`No existe la carpeta \`${trimmed}\``)
  return trimmed
}

async function gitOk(binary: GitBinary, cwd: string, args: readonly string[]): Promise<GitOutput> {
  const output = await runGit(binary.path, cwd, args, COMMAND_TIMEOUT_MS)
  if (output.code === 0) return output
  if (isNotARepositoryMessage(output.stderr)) {
    throw new NotRepositoryError()
  }
  if (isDubiousOwnership(output.stderr)) {
    throw new Error(
      `Git no lee esta carpeta porque pertenece a otro usuario. Para confiar en ella: git config --global --add safe.directory ${shellQuote(cwd)}`,
    )
  }
  throw new Error(output.stderr || 'Git no responde')
}

class NotRepositoryError extends Error {
  constructor() {
    super(GIT_NOT_REPOSITORY_MESSAGE)
  }
}

async function loadRefs(binary: GitBinary, cwd: string): Promise<GitRefRepository> {
  const listed = await gitOk(binary, cwd, [
    'for-each-ref',
    '--format=%(objectname)%00%(refname:short)%00%(HEAD)',
    'refs/heads',
  ])
  const branches = parseForEachRef(listed.stdout)
  const head = await runGit(binary.path, cwd, ['rev-parse', '--verify', 'HEAD'], COMMAND_TIMEOUT_MS)
  const initial = head.code !== 0
  let oid: string | undefined
  if (!initial) {
    const parsed = await gitOk(binary, cwd, ['rev-parse', 'HEAD'])
    const hash = parsed.stdout.trim()
    if (hash !== '') oid = hash
  }

  let current = branches.find((branch) => branch.current)?.name
  if (initial && !current) {
    const symbolic = await runGit(
      binary.path,
      cwd,
      ['symbolic-ref', '--short', 'HEAD'],
      COMMAND_TIMEOUT_MS,
    )
    const name = symbolic.code === 0 ? symbolic.stdout.trim() : ''
    if (isSafeRef(name)) current = name
  }

  if (initial && current && !branches.some((branch) => branch.name === current)) {
    branches.push({ name: current, current: true })
  }

  return {
    ...(current ? { current } : {}),
    ...(oid ? { oid } : {}),
    detached: !initial && current === undefined,
    initial,
    branches,
  }
}

async function compareToHead(binary: GitBinary, cwd: string, name: string): Promise<GitComparison> {
  const merge = await runGit(binary.path, cwd, ['merge-base', 'HEAD', name], COMMAND_TIMEOUT_MS)
  const mergeBase = merge.code === 0 && merge.stdout.trim() !== '' ? merge.stdout.trim() : undefined
  const counts = await runGit(
    binary.path,
    cwd,
    ['rev-list', '--count', '--left-right', `HEAD...${name}`],
    COMMAND_TIMEOUT_MS,
  )
  const { ahead, behind } =
    counts.code === 0 ? parseLeftRight(counts.stdout) : { ahead: 0, behind: 0 }
  return { name, ...(mergeBase ? { mergeBase } : {}), ahead, behind }
}

function selectedBranches(
  branches: readonly GitRef[],
  current: string | undefined,
  selected: readonly string[],
): string[] {
  const allowed = new Set(branches.map((branch) => branch.name))
  const extras: string[] = []
  for (const name of selected) {
    if (!isSafeRef(name) || !allowed.has(name) || name === current || extras.includes(name))
      continue
    extras.push(name)
  }
  return extras
}

export async function readGitRefs(root: string): Promise<GitRefsResult> {
  const cwd = await directoryOrThrow(root)
  let binary: GitBinary | null
  try {
    binary = await discoverGit()
  } catch (error) {
    return {
      probe: missingProbe(),
      error: error instanceof Error ? error.message : GIT_CLIENT_MISSING_MESSAGE,
    }
  }
  if (!binary) return { probe: missingProbe(), error: GIT_CLIENT_MISSING_MESSAGE }

  try {
    const inside = await runGit(
      binary.path,
      cwd,
      ['rev-parse', '--is-inside-work-tree'],
      COMMAND_TIMEOUT_MS,
    )
    if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
      if (isDubiousOwnership(inside.stderr)) {
        return {
          probe: readyProbe(binary),
          error: `Git no lee esta carpeta porque pertenece a otro usuario. Para confiar en ella: git config --global --add safe.directory ${shellQuote(cwd)}`,
        }
      }
      return { probe: readyProbe(binary) }
    }
    return { probe: readyProbe(binary), repository: await loadRefs(binary, cwd) }
  } catch (error) {
    if (error instanceof NotRepositoryError) return { probe: readyProbe(binary) }
    return {
      probe: readyProbe(binary),
      error: error instanceof Error ? error.message : 'Git no responde',
    }
  }
}

export async function readGitSummary(root: string): Promise<GitSummaryResult> {
  const cwd = await directoryOrThrow(root)
  let binary: GitBinary | null
  try {
    binary = await discoverGit()
  } catch (error) {
    return {
      probe: missingProbe(),
      error: error instanceof Error ? error.message : GIT_CLIENT_MISSING_MESSAGE,
    }
  }
  if (!binary) return { probe: missingProbe(), error: GIT_CLIENT_MISSING_MESSAGE }

  const top = await runGit(binary.path, cwd, ['rev-parse', '--show-toplevel'], COMMAND_TIMEOUT_MS)
  if (top.code !== 0 || top.stdout.trim() === '') {
    if (isDubiousOwnership(top.stderr)) {
      return {
        probe: readyProbe(binary),
        error: `Git no lee esta carpeta porque pertenece a otro usuario. Para confiar en ella: git config --global --add safe.directory ${shellQuote(cwd)}`,
      }
    }
    if (isNotARepositoryMessage(top.stderr)) return { probe: readyProbe(binary) }
    return { probe: readyProbe(binary), error: top.stderr || 'Git no responde' }
  }

  const symbolic = await runGit(
    binary.path,
    cwd,
    ['symbolic-ref', '--short', 'HEAD'],
    COMMAND_TIMEOUT_MS,
  )
  const name = symbolic.code === 0 ? symbolic.stdout.trim() : ''
  const detached = !isSafeRef(name)
  return {
    probe: readyProbe(binary),
    repository: {
      toplevel: top.stdout.trim(),
      ...(detached ? {} : { branch: name }),
      detached,
    },
  }
}

export async function readGitGraph(
  root: string,
  selected: readonly string[],
): Promise<GitGraphResult> {
  const refs = await readGitRefs(root)
  if (!refs.probe.available || !refs.repository) {
    return { probe: refs.probe, ...(refs.error ? { error: refs.error } : {}) }
  }

  const binary = await discoverGit()
  if (!binary) return { probe: missingProbe(), error: GIT_CLIENT_MISSING_MESSAGE }
  const cwd = await directoryOrThrow(root)
  const info = refs.repository
  if (info.initial) {
    return {
      probe: refs.probe,
      repository: {
        ...(info.current ? { current: info.current } : {}),
        ...(info.oid ? { oid: info.oid } : {}),
        detached: info.detached,
        initial: true,
        commits: [],
        comparisons: [],
      },
    }
  }

  const extras = selectedBranches(info.branches, info.current, selected)
  let commits: GitCommit[]
  try {
    const output = await gitOk(binary, cwd, [
      'log',
      '--topo-order',
      '--decorate=full',
      '--no-abbrev-commit',
      `--abbrev=${SHORT_ABBREV}`,
      '--format=%H%x00%h%x00%P%x00%D%x00%s',
      '-z',
      '-n',
      GRAPH_LIMIT,
      'HEAD',
      ...extras,
    ])
    commits = parseGitLog(output.stdout)
  } catch (error) {
    if (error instanceof NotRepositoryError) return { probe: refs.probe }
    return { probe: refs.probe, error: error instanceof Error ? error.message : 'Git no responde' }
  }

  const comparisons: GitComparison[] = []
  for (const name of extras) {
    comparisons.push(await compareToHead(binary, cwd, name))
  }

  return {
    probe: refs.probe,
    repository: {
      ...(info.current ? { current: info.current } : {}),
      ...(info.oid ? { oid: info.oid } : {}),
      detached: info.detached,
      initial: false,
      commits,
      comparisons,
    },
  }
}
