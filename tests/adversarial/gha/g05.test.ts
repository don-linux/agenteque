/**
 * G05. "Rename and verify artifacts" is the gate before
 * `dist/agenteque-${{ inputs.label }}-*` is uploaded. A complete set is renamed
 * to the label. A missing file, an empty file, or an unknown PLATFORM must fail
 * the step. An extra name that matches the upload glob must not be published,
 * and a directory or symlink must not count as a package.
 *
 * Extra publishable names, directories, and symlinks are accepted today, so
 * those cases stay `it.fails` until the step rejects them.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { readWorkflowYaml, runWorkflowStep, type WorkflowStepResult } from '../helpers/workflow'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_G05 = { id: 'ADV-G05' } as const

/**
 * `[ -s ]` is true for a directory only when st_size > 0. On this filesystem
 * an empty directory is 4096 bytes, so the step accepts it and the case
 * stays `it.fails`. A zero-size directory is already rejected, so that
 * registration runs and the `it.fails` one is skipped.
 */
function emptyDirectorySize(): number {
  const root = mkdtempSync(resolve(tmpdir(), 'agenteque-g05-dir-'))
  const dir = resolve(root, 'empty')
  mkdirSync(dir)
  try {
    return statSync(dir).size
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const directoryLooksNonEmpty = emptyDirectorySize() > 0

const yaml = readWorkflowYaml('build.yml')
const STEP = 'Rename and verify artifacts'
const VERSION = '0.0.1'
const LABEL = 'pr-12'
const PUBLISH_PREFIX = `agenteque-${LABEL}-`
const UPLOAD_GLOB = 'path: dist/agenteque-${{ inputs.label }}-*'

const PLATFORMS = ['linux', 'windows', 'macos'] as const
type Platform = (typeof PLATFORMS)[number]

const SPECS: Record<Platform, { built: readonly string[]; renamed: readonly string[] }> = {
  linux: {
    built: [
      `agenteque-${VERSION}-x86_64.AppImage`,
      `agenteque-${VERSION}-amd64.deb`,
      `agenteque-${VERSION}-x86_64.rpm`,
      `agenteque-${VERSION}-x64.tar.gz`,
    ],
    renamed: [
      `agenteque-${LABEL}-x86_64.AppImage`,
      `agenteque-${LABEL}-x86_64.deb`,
      `agenteque-${LABEL}-x86_64.rpm`,
      `agenteque-${LABEL}-x86_64-linux.tar.gz`,
    ],
  },
  windows: {
    built: [`agenteque ${VERSION}.exe`],
    renamed: [`agenteque-${LABEL}-x86_64-windows-portable.exe`],
  },
  macos: {
    built: [`agenteque-${VERSION}-arm64.dmg`],
    renamed: [`agenteque-${LABEL}-macos-arm64.dmg`],
  },
}

const UNKNOWN_PLATFORMS = [
  '',
  'Linux',
  'freebsd',
  'linux ',
  'linux)',
  'linux\nwindows',
  '${{ matrix.platform }}',
  '$(touch adv-g05-pwned)',
  'linux; touch adv-g05-pwned',
] as const

function payload(name: string): string {
  return `payload ${name}\n`
}

function builtTree(platform: Platform): Record<string, string> {
  const files: Record<string, string> = {}
  for (const name of SPECS[platform].built) files[name] = payload(name)
  return files
}

function without(files: Readonly<Record<string, string>>, name: string): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(files)) {
    if (key !== name) next[key] = value
  }
  return next
}

function published(distDir: string): string[] {
  return readdirSync(distDir)
    .filter((name) => name.startsWith(PUBLISH_PREFIX))
    .toSorted()
}

function expectedPublished(platform: Platform): string[] {
  return [...SPECS[platform].renamed].toSorted()
}

function nameAt(names: readonly string[], index: number): string {
  const name = names[index]
  if (name === undefined) throw new Error(`artifact index ${index} is missing`)
  return name
}

function isRegularNonEmpty(distDir: string, name: string): boolean {
  const path = resolve(distDir, name)
  if (!existsSync(path)) return false
  const stat = lstatSync(path)
  return stat.isFile() && stat.size > 0
}

/** A failed step is not uploaded. Success requires a regular non-empty file. */
function rejectedOrRealFile(result: WorkflowStepResult, name: string): boolean {
  if (result.exitCode !== 0) return true
  return isRegularNonEmpty(result.distDir, name)
}

async function rename(
  platform: string,
  distFiles: Readonly<Record<string, string>>,
  prepare?: (dir: string) => void,
): Promise<WorkflowStepResult> {
  return runWorkflowStep({
    yaml,
    step: STEP,
    job: 'package',
    env: { LABEL, PLATFORM: platform },
    files: {
      'package.json': JSON.stringify({ name: 'agenteque', version: VERSION, type: 'module' }),
    },
    distFiles,
    prepare,
  })
}

it('renames a complete set and does not publish leftovers', async () => {
  expect(yaml).toContain(UPLOAD_GLOB)

  for (const platform of PLATFORMS) {
    const spec = SPECS[platform]
    const result = await rename(platform, {
      ...builtTree(platform),
      'builder-debug.yml': 'debug\n',
      'latest-linux.yml': 'latest\n',
      [`agenteque-${VERSION}-x86_64.AppImage.blockmap`]: 'blockmap\n',
    })

    expect(result.exitCode, platform).toBe(0)
    for (const [index, builtName] of spec.built.entries()) {
      const renamed = nameAt(spec.renamed, index)
      expect(readFileSync(resolve(result.distDir, renamed), 'utf8'), renamed).toBe(
        payload(builtName),
      )
      expect(existsSync(resolve(result.distDir, builtName)), builtName).toBe(false)
    }
    expect(published(result.distDir), platform).toEqual(expectedPublished(platform))
    await result.cleanup()
  }
})

it('rejects a missing artifact', async () => {
  for (const platform of PLATFORMS) {
    const spec = SPECS[platform]
    for (const [index, builtName] of spec.built.entries()) {
      const renamed = nameAt(spec.renamed, index)
      const result = await rename(platform, without(builtTree(platform), builtName))
      const label = `${platform} missing ${builtName}`
      expect(result.exitCode, label).not.toBe(0)
      expect(existsSync(resolve(result.distDir, renamed)), label).toBe(false)
      await result.cleanup()
    }
  }
})

it('rejects an empty artifact', async () => {
  for (const platform of PLATFORMS) {
    const spec = SPECS[platform]
    for (const [index, builtName] of spec.built.entries()) {
      const renamed = nameAt(spec.renamed, index)
      const result = await rename(platform, { ...builtTree(platform), [builtName]: '' })
      const label = `${platform} empty ${builtName}`
      expect(result.exitCode, label).not.toBe(0)
      expect(isRegularNonEmpty(result.distDir, renamed), label).toBe(false)
      await result.cleanup()
    }
  }
})

it.fails('ADV-G05 rejects an extra publishable artifact', { meta: ADV_G05 }, async () => {
  const problems: string[] = []

  for (const platform of PLATFORMS) {
    const extra = `${PUBLISH_PREFIX}unexpected.AppImage`
    const result = await rename(platform, { ...builtTree(platform), [extra]: 'not-a-package\n' })
    if (result.exitCode === 0 && published(result.distDir).includes(extra)) {
      problems.push(`${platform} published ${extra}`)
    }
    await result.cleanup()
  }

  const emptyExtra = `${PUBLISH_PREFIX}empty.bin`
  const empty = await rename('linux', { ...builtTree('linux'), [emptyExtra]: '' })
  if (empty.exitCode === 0 && published(empty.distDir).includes(emptyExtra)) {
    problems.push(`linux published empty ${emptyExtra}`)
  }
  await empty.cleanup()

  const extraDir = `${PUBLISH_PREFIX}unexpected`
  const directory = await rename('linux', builtTree('linux'), (dir) => {
    mkdirSync(resolve(dir, 'dist', extraDir))
    writeFileSync(resolve(dir, 'dist', extraDir, 'payload'), 'extra')
  })
  if (directory.exitCode === 0 && published(directory.distDir).includes(extraDir)) {
    problems.push(`linux published directory ${extraDir}`)
  }
  await directory.cleanup()

  expect(problems, problems.join('\n')).toEqual([])
})

async function directoryArtifactProblems(): Promise<string[]> {
  const problems: string[] = []

  for (const platform of PLATFORMS) {
    const builtName = nameAt(SPECS[platform].built, 0)
    const renamed = nameAt(SPECS[platform].renamed, 0)
    const result = await rename(platform, without(builtTree(platform), builtName), (dir) => {
      mkdirSync(resolve(dir, 'dist', builtName))
    })
    if (!rejectedOrRealFile(result, renamed)) {
      problems.push(
        `${platform} directory ${builtName} exit=${String(result.exitCode)} stderr=${result.stderr.trim()}`,
      )
    }
    await result.cleanup()
  }

  return problems
}

it.fails.skipIf(!directoryLooksNonEmpty)(
  'ADV-G05 rejects a directory in place of an artifact',
  { meta: ADV_G05 },
  async () => {
    const problems = await directoryArtifactProblems()
    expect(problems, problems.join('\n')).toEqual([])
  },
)

it.skipIf(directoryLooksNonEmpty)(
  'ADV-G05 rejects a directory in place of an artifact when the directory size is zero',
  { meta: ADV_G05 },
  async () => {
    const problems = await directoryArtifactProblems()
    expect(problems, problems.join('\n')).toEqual([])
  },
)

it.fails('ADV-G05 rejects a symlink in place of an artifact', { meta: ADV_G05 }, async () => {
  const problems: string[] = []

  for (const platform of PLATFORMS) {
    const builtName = nameAt(SPECS[platform].built, 0)
    const renamed = nameAt(SPECS[platform].renamed, 0)
    const result = await rename(platform, without(builtTree(platform), builtName), (dir) => {
      writeFileSync(resolve(dir, 'outside.bin'), 'outside-bytes')
      symlinkSync('../outside.bin', resolve(dir, 'dist', builtName))
    })
    if (!rejectedOrRealFile(result, renamed)) {
      problems.push(`${platform} symlink ${builtName} exit=${String(result.exitCode)}`)
    }
    await result.cleanup()
  }

  expect(problems, problems.join('\n')).toEqual([])
})

it('rejects an unknown PLATFORM', async () => {
  const built = builtTree('linux')

  for (const platform of UNKNOWN_PLATFORMS) {
    const result = await rename(platform, built)
    const label = JSON.stringify(platform)
    expect(result.exitCode, label).not.toBe(0)
    expect(result.stdout, label).toContain('Unknown platform:')
    expect(published(result.distDir), label).toEqual([])
    expect(existsSync(resolve(result.dir, 'adv-g05-pwned')), label).toBe(false)
    for (const name of SPECS.linux.built) {
      expect(readFileSync(resolve(result.distDir, name), 'utf8'), label).toBe(payload(name))
    }
    await result.cleanup()
  }
})
