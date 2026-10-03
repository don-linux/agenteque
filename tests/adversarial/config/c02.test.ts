import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

/** npm exact version: major.minor.patch, optional prerelease or build. No ranges. */
const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

/** Scripts pnpm runs for the root package during install. */
const ROOT_INSTALL_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
] as const

/**
 * Dependency lifecycle scripts may run only for these names.
 * They are the allowlist in pnpm-workspace.yaml; pnpm 10 denies every other package.
 */
const ALLOWED_BUILT_DEPENDENCIES = ['electron', 'esbuild'] as const
const IGNORED_BUILT_DEPENDENCIES = ['electron-winstaller'] as const

const PNPMFILES = ['.pnpmfile.cjs', 'pnpmfile.cjs'] as const

const NPMRC_BUILD_KEYS = new Set([
  'allow-builds',
  'dangerously-allow-all-builds',
  'global-pnpmfile',
  'ignored-built-dependencies',
  'never-built-dependencies',
  'only-built-dependencies',
  'only-built-dependencies-file',
  'pnpmfile',
])

/** Workspace and package.json keys that can run extra code or redirect versions. */
const HIDDEN_INSTALL_KEYS = [
  'allowBuilds',
  'configDependencies',
  'neverBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'overrides',
  'packageExtensions',
  'patchedDependencies',
  'pnpmfile',
] as const

function readText(name: string): string {
  return readFileSync(resolve(root, name), 'utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), label).toBe(true)
  if (!isRecord(value)) throw new Error(`${label} is not a mapping`)
  return value
}

function readJson(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readText(name))
  return expectRecord(parsed, name)
}

function readYaml(name: string): Record<string, unknown> {
  const parsed: unknown = parse(readText(name))
  return expectRecord(parsed, name)
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {}
  const record = expectRecord(value, label)
  const entries: Record<string, string> = {}
  for (const [name, version] of Object.entries(record)) {
    expect(typeof version, `${label}.${name}`).toBe('string')
    if (typeof version !== 'string') throw new Error(`${label}.${name} is not a string`)
    entries[name] = version
  }
  return entries
}

function stringList(value: unknown, label: string): string[] {
  expect(Array.isArray(value), label).toBe(true)
  if (!Array.isArray(value)) throw new Error(`${label} is not a list`)
  const list: string[] = []
  for (const entry of value) {
    expect(typeof entry, label).toBe('string')
    if (typeof entry !== 'string') throw new Error(`${label} has a non-string entry`)
    list.push(entry)
  }
  return list
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted()
}

function sameMembers(actual: readonly string[], expected: readonly string[], label: string): void {
  expect(sortedUnique(actual), label).toEqual(sortedUnique(expected))
}

/** Drop the pnpm peer-dependency suffix: `1.2.3(peer@1.0.0)` → `1.2.3`. */
function peerless(version: string): string {
  const index = version.indexOf('(')
  return index === -1 ? version : version.slice(0, index)
}

function npmrcBuildKeys(text: string): string[] {
  const hits: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const eq = line.indexOf('=')
    const key = (eq === -1 ? line : line.slice(0, eq)).trim().toLowerCase().replace(/\[\]$/, '')
    if (NPMRC_BUILD_KEYS.has(key)) hits.push(key)
  }
  return hits
}

describe('C02 supply chain', () => {
  it('pins package.json dependencies to exact versions', () => {
    const manifest = readJson('package.json')
    const packageManager = manifest.packageManager
    expect(typeof packageManager, 'packageManager').toBe('string')
    if (typeof packageManager !== 'string') throw new Error('packageManager is not a string')
    expect(packageManager.startsWith('pnpm@'), 'packageManager').toBe(true)
    const pnpmVersion = packageManager.slice('pnpm@'.length)
    expect(pnpmVersion, 'packageManager').toMatch(EXACT_VERSION)
    expect(Number(pnpmVersion.split('.')[0]), 'pnpm major').toBeGreaterThanOrEqual(10)

    for (const field of DEPENDENCY_FIELDS) {
      const versions = stringRecord(manifest[field], field)
      for (const [name, version] of Object.entries(versions)) {
        expect(version, `${field}.${name}`).toMatch(EXACT_VERSION)
      }
    }

    expect(manifest.resolutions, 'resolutions').toBeUndefined()
    expect(manifest.pnpm, 'package.json pnpm').toBeUndefined()
  })

  it('matches the pnpm lockfile to those exact versions', () => {
    const manifest = readJson('package.json')
    const lock = readYaml('pnpm-lock.yaml')
    expect(lock.lockfileVersion, 'lockfileVersion').toBe('9.0')
    expect(lock.patchedDependencies, 'patchedDependencies').toBeUndefined()
    expect(lock.pnpmfileChecksum, 'pnpmfileChecksum').toBeUndefined()

    const importers = expectRecord(lock.importers, 'importers')
    expect(Object.keys(importers), 'importers').toEqual(['.'])
    const importer = expectRecord(importers['.'], 'importers.')
    const packages = expectRecord(lock.packages, 'packages')
    const snapshots = expectRecord(lock.snapshots, 'snapshots')

    for (const field of DEPENDENCY_FIELDS) {
      const declared = stringRecord(manifest[field], field)
      const locked = expectRecord(importer[field] ?? {}, `lockfile ${field}`)
      expect(Object.keys(locked).toSorted(), field).toEqual(Object.keys(declared).toSorted())

      for (const [name, version] of Object.entries(declared)) {
        const entry = expectRecord(locked[name], `${field}.${name}`)
        expect(entry.specifier, `${name} specifier`).toBe(version)
        expect(typeof entry.version, `${name} version`).toBe('string')
        if (typeof entry.version !== 'string') throw new Error(`${name} version is not a string`)
        expect(peerless(entry.version), `${name} resolved`).toBe(version)
        expect(packages[`${name}@${version}`], `${name}@${version}`).toBeDefined()
        expect(snapshots[`${name}@${entry.version}`], `${name} snapshot`).toBeDefined()
      }
    }

    const referenced = new Set<string>()
    for (const id of Object.keys(snapshots)) {
      const packageId = peerless(id)
      referenced.add(packageId)
      expect(packages[packageId], packageId).toBeDefined()
    }

    for (const [id, info] of Object.entries(packages)) {
      expect(referenced.has(id), `${id} is installed`).toBe(true)
      const pkg = expectRecord(info, id)
      const resolution = expectRecord(pkg.resolution, `${id} resolution`)
      expect(Object.keys(resolution), `${id} resolution`).toEqual(['integrity'])
      expect(resolution.integrity, `${id} integrity`).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/)
    }
  })

  it('allows dependency install scripts only as listed in pnpm-workspace.yaml', () => {
    const manifest = readJson('package.json')
    const scripts = stringRecord(manifest.scripts, 'scripts')
    const lifecycle = ROOT_INSTALL_SCRIPTS.filter((name) => scripts[name] !== undefined)
    expect(lifecycle, 'root install scripts').toEqual(['postinstall'])
    expect(scripts.postinstall, 'postinstall').toBe('install-electron')

    const workspace = readYaml('pnpm-workspace.yaml')
    const allowsAll = workspace.dangerouslyAllowAllBuilds
    expect(allowsAll === undefined || allowsAll === false, 'dangerouslyAllowAllBuilds').toBe(true)
    for (const key of HIDDEN_INSTALL_KEYS) {
      expect(workspace[key], `pnpm-workspace.yaml ${key}`).toBeUndefined()
    }
    expect(workspace.packages ?? ['.'], 'workspace packages').toEqual(['.'])

    const allowed = stringList(workspace.onlyBuiltDependencies, 'onlyBuiltDependencies')
    const ignored = stringList(workspace.ignoredBuiltDependencies, 'ignoredBuiltDependencies')
    expect(new Set(allowed).size, 'onlyBuiltDependencies duplicates').toBe(allowed.length)
    expect(new Set(ignored).size, 'ignoredBuiltDependencies duplicates').toBe(ignored.length)
    sameMembers(allowed, ALLOWED_BUILT_DEPENDENCIES, 'onlyBuiltDependencies')
    sameMembers(ignored, IGNORED_BUILT_DEPENDENCIES, 'ignoredBuiltDependencies')
    expect(
      allowed.filter((name) => ignored.includes(name)),
      'allow and ignore overlap',
    ).toEqual([])

    expect(manifest.pnpm, 'package.json pnpm').toBeUndefined()

    const npmrc = resolve(root, '.npmrc')
    const npmrcText = existsSync(npmrc) ? readFileSync(npmrc, 'utf8') : ''
    expect(npmrcBuildKeys(npmrcText), '.npmrc build policy').toEqual([])

    for (const name of PNPMFILES) {
      expect(existsSync(resolve(root, name)), name).toBe(false)
    }
  })
})
