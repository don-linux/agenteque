import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, posix, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packagedExecutable } from '../helpers/electron'
import { root } from '../helpers/paths'

interface AsarEntry {
  size?: number
  unpacked?: boolean
  files?: Record<string, unknown>
  link?: string
}

interface AsarModule {
  listPackage(archive: string): string[]
  statFile(archive: string, filename: string): AsarEntry
  extractFile(archive: string, filename: string): Buffer
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

interface AppFile {
  path: string
  bytes: Buffer
}

interface PackagedPayload {
  /** Paths inside the application package (asar and/or a loose `resources/app`). */
  appPaths: string[]
  appFiles: AppFile[]
  /** Filesystem paths relative to the unpacked package, plus the app paths above. */
  scannedPaths: string[]
}

const SOURCE_MAPPING_URL = Buffer.from('sourceMappingURL')
const TEST_DIRS = new Set(['test', 'tests', '__tests__', '__test__'])

let asarModule: AsarModule | undefined
let payload: PackagedPayload | undefined

describe('ADV-E21 packaged application payload', () => {
  it('contains only out/** and package.json', () => {
    const { appPaths } = packagedPayload()
    expect(appPaths).toContain('package.json')
    expect(appPaths.some((path) => path.startsWith('out/'))).toBe(true)
    expect(appPaths.filter((path) => !isAllowedAppPath(path))).toEqual([])
  })

  it('does not contain sourcemaps', () => {
    const { appFiles, scannedPaths } = packagedPayload()
    const mapFiles = scannedPaths.filter(isSourcemapPath)
    const inlineMaps = appFiles
      .filter((file) => file.bytes.includes(SOURCE_MAPPING_URL))
      .map((file) => file.path)
    expect(mapFiles).toEqual([])
    expect(inlineMaps).toEqual([])
  })

  it('does not contain .env files', () => {
    expect(packagedPayload().scannedPaths.filter(isDotEnvPath)).toEqual([])
  })

  it('does not contain tests', () => {
    expect(packagedPayload().scannedPaths.filter(isTestPath)).toEqual([])
  })

  it('does not contain src/', () => {
    expect(packagedPayload().scannedPaths.filter(isSrcPath)).toEqual([])
  })

  it('does not contain devDependencies', () => {
    const source = readPackageJson(readFileSync(join(root, 'package.json')))
    const devNames = new Set(Object.keys(source.devDependencies ?? {}))
    const prodNames = new Set([
      ...Object.keys(source.dependencies ?? {}),
      ...Object.keys(source.optionalDependencies ?? {}),
    ])

    const packagedFile = packagedPayload().appFiles.find((file) => file.path === 'package.json')
    if (!packagedFile) throw new Error('packaged app is missing package.json')
    const packaged = readPackageJson(packagedFile.bytes)
    expect(packaged.devDependencies ?? {}).toEqual({})

    const declared = [
      ...Object.keys(packaged.dependencies ?? {}),
      ...Object.keys(packaged.optionalDependencies ?? {}),
      ...Object.keys(packaged.devDependencies ?? {}),
    ]
    expect(declared.filter((name) => devNames.has(name) || !prodNames.has(name))).toEqual([])

    const installed = nodeModuleNames(packagedPayload().scannedPaths)
    expect(
      installed.filter(
        (name) => devNames.has(name) || name.startsWith('.') || !prodNames.has(name),
      ),
    ).toEqual([])
  })
})

function packagedPayload(): PackagedPayload {
  payload ??= readPackagedPayload()
  return payload
}

function readPackagedPayload(): PackagedPayload {
  const { unpackedDir, resourcesDir } = packagedLayout()
  const asarPath = join(resourcesDir, 'app.asar')
  const looseAppDir = join(resourcesDir, 'app')
  const unpackedAsarDir = join(resourcesDir, 'app.asar.unpacked')
  if (!existsSync(asarPath) && !existsSync(looseAppDir)) {
    throw new Error(`${asarPath} is missing. The adversarial globalSetup packs it.`)
  }

  const appPaths = new Set<string>()
  const appFiles: AppFile[] = []

  if (existsSync(asarPath)) {
    const asar = loadAsar()
    for (const entry of asar.listPackage(asarPath)) {
      const path = trimSlashes(entry)
      if (path.length === 0) continue
      appPaths.add(path)
      const stat = asar.statFile(asarPath, path)
      if (stat.link != null) {
        const target = posix.normalize(posix.join(posix.dirname(path), stat.link))
        appPaths.add(target)
        continue
      }
      if (stat.files) continue
      const bytes = stat.unpacked
        ? readFileSync(join(unpackedAsarDir, path))
        : asar.extractFile(asarPath, path)
      appFiles.push({ path, bytes })
    }
  }

  if (existsSync(looseAppDir)) collectDirectory(looseAppDir, appPaths, appFiles)
  if (existsSync(unpackedAsarDir)) collectDirectory(unpackedAsarDir, appPaths, appFiles)

  const scannedPaths = new Set<string>(appPaths)
  for (const relative of listRelative(unpackedDir)) scannedPaths.add(relative)

  return {
    appPaths: [...appPaths].toSorted(),
    appFiles,
    scannedPaths: [...scannedPaths].toSorted(),
  }
}

function packagedLayout(): { unpackedDir: string; resourcesDir: string } {
  const executable = packagedExecutable()
  if (!existsSync(executable)) {
    throw new Error(`${executable} is missing. The adversarial globalSetup packs it.`)
  }
  if (process.platform === 'darwin') {
    const contents = dirname(dirname(executable))
    return { unpackedDir: dirname(contents), resourcesDir: join(contents, 'Resources') }
  }
  const unpackedDir = dirname(executable)
  return { unpackedDir, resourcesDir: join(unpackedDir, 'resources') }
}

function collectDirectory(directory: string, appPaths: Set<string>, appFiles: AppFile[]): void {
  const seen = new Set(appFiles.map((file) => file.path))
  for (const relative of listRelative(directory)) {
    appPaths.add(relative)
    if (seen.has(relative)) continue
    const absolute = join(directory, ...relative.split('/'))
    let info
    try {
      info = statSync(absolute)
    } catch {
      continue
    }
    if (!info.isFile()) continue
    seen.add(relative)
    appFiles.push({ path: relative, bytes: readFileSync(absolute) })
  }
}

function listRelative(directory: string): string[] {
  const entries = readdirSync(directory, { encoding: 'utf8', recursive: true })
  const paths: string[] = []
  for (const entry of entries) {
    if (typeof entry !== 'string') continue
    paths.push(sep === '/' ? entry : entry.replaceAll('\\', '/'))
  }
  return paths
}

/** `@electron/asar` ships with app-builder-lib; pnpm does not hoist it for this package. */
function loadAsar(): AsarModule {
  if (asarModule) return asarModule
  const builderPackage = realpathSync(join(root, 'node_modules/electron-builder/package.json'))
  const requireBuilder = createRequire(builderPackage)
  const libPackage = requireBuilder.resolve('app-builder-lib/package.json')
  asarModule = createRequire(libPackage)('@electron/asar') as AsarModule
  return asarModule
}

function readPackageJson(bytes: Buffer): PackageJson {
  return JSON.parse(bytes.toString('utf8')) as PackageJson
}

function isAllowedAppPath(path: string): boolean {
  return path === 'package.json' || path === 'out' || path.startsWith('out/')
}

function isSourcemapPath(path: string): boolean {
  return baseName(path).endsWith('.map')
}

function isDotEnvPath(path: string): boolean {
  const base = baseName(path)
  return base === '.env' || base.startsWith('.env.')
}

function isTestPath(path: string): boolean {
  if (path.split('/').some((part) => TEST_DIRS.has(part))) return true
  return /\.(?:test|spec)\.[^/]+$/.test(baseName(path))
}

function isSrcPath(path: string): boolean {
  return path === 'src' || path.startsWith('src/') || path.includes('/src/')
}

function nodeModuleNames(paths: readonly string[]): string[] {
  const names = new Set<string>()
  for (const path of paths) {
    const parts = path.split('/')
    for (let index = 0; index < parts.length; index += 1) {
      if (parts[index] !== 'node_modules') continue
      const next = parts[index + 1]
      if (next == null || next.length === 0) continue
      if (next.startsWith('@')) {
        const scoped = parts[index + 2]
        if (scoped != null && scoped.length > 0) names.add(`${next}/${scoped}`)
        continue
      }
      names.add(next)
    }
  }
  return [...names]
}

function baseName(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}
