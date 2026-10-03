/**
 * Hostile LABEL values for "Rename and verify artifacts" in build.yml.
 * The label arrives as an environment variable and must stay data: no command
 * execution, no globbing, and no artifact writes outside dist/.
 */
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { expect, it } from 'vitest'
import {
  extractRunScript,
  readWorkflowYaml,
  runWorkflowStep,
  type WorkflowStepResult,
} from '../helpers/workflow'

const yaml = readWorkflowYaml('build.yml')
const step = 'Rename and verify artifacts'
const version = '0.0.1'
const artifactBytes = 'artifact-bytes'
const platforms = ['linux', 'windows', 'macos'] as const

type Platform = (typeof platforms)[number]

const traversalLabels = [
  '../pwned',
  '../../outside/pwned',
  'linux-unpacked/../../outside/pwned',
  'foo/../../../outside/pwned',
  '$(touch pwned) ../ *\ntouch pwned',
]

function builtNames(platform: Platform): readonly string[] {
  if (platform === 'linux') {
    return [
      `agenteque-${version}-x86_64.AppImage`,
      `agenteque-${version}-amd64.deb`,
      `agenteque-${version}-x86_64.rpm`,
      `agenteque-${version}-x64.tar.gz`,
    ]
  }
  if (platform === 'windows') return [`agenteque ${version}.exe`]
  return [`agenteque-${version}-arm64.dmg`]
}

function renamedNames(platform: Platform, label: string): readonly string[] {
  if (platform === 'linux') {
    return [
      `agenteque-${label}-x86_64.AppImage`,
      `agenteque-${label}-x86_64.deb`,
      `agenteque-${label}-x86_64.rpm`,
      `agenteque-${label}-x86_64-linux.tar.gz`,
    ]
  }
  if (platform === 'windows') return [`agenteque-${label}-x86_64-windows-portable.exe`]
  return [`agenteque-${label}-macos-arm64.dmg`]
}

function decoyName(platform: Platform): string {
  if (platform === 'linux') return 'agenteque-decoy-x86_64.AppImage'
  if (platform === 'windows') return 'agenteque-decoy-x86_64-windows-portable.exe'
  return 'agenteque-decoy-macos-arm64.dmg'
}

function isInside(parent: string, target: string): boolean {
  const fromParent = relative(parent, target)
  return (
    fromParent !== '' &&
    fromParent !== '..' &&
    !fromParent.startsWith(`..${sep}`) &&
    !isAbsolute(fromParent)
  )
}

function relativeFiles(root: string): string[] {
  const found: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else found.push(relative(root, path))
    }
  }
  visit(root)
  return found.toSorted()
}

async function runRename(platform: Platform, label: string): Promise<WorkflowStepResult> {
  const distFiles: Record<string, string> = {
    'unrelated.txt': 'unrelated',
    [decoyName(platform)]: 'decoy',
  }
  for (const name of builtNames(platform)) distFiles[name] = artifactBytes

  return runWorkflowStep({
    yaml,
    step,
    job: 'package',
    env: { LABEL: label, PLATFORM: platform },
    files: {
      'package.json': `${JSON.stringify({ version })}\n`,
      'outside/sentinel': 'sentinel',
    },
    distFiles,
    prepare(dir) {
      const unpacked = join(dir, 'dist', 'linux-unpacked')
      mkdirSync(unpacked, { recursive: true })
      writeFileSync(join(unpacked, 'agenteque'), 'unpacked')
    },
  })
}

/** `$LABEL` / `${LABEL}` only inside double quotes, so the value is not split or globbed. */
function assertLabelExpansionsAreQuoted(script: string): void {
  const withoutDoubleQuotes = script.replace(/"(?:[^"\\]|\\.)*"/g, '""')
  expect(withoutDoubleQuotes.includes('$LABEL')).toBe(false)
  expect(withoutDoubleQuotes.includes('${LABEL}')).toBe(false)
}

function assertNoCommandSideEffects(result: WorkflowStepResult, where: string): void {
  expect(result.script, where).toContain('agenteque-$LABEL-')
  assertLabelExpansionsAreQuoted(result.script)
  for (const path of relativeFiles(result.dir)) {
    expect(path.split(sep), where).not.toContain('pwned')
  }
  expect(readFileSync(join(result.dir, 'outside/sentinel'), 'utf8'), where).toBe('sentinel')
  expect(readFileSync(join(result.dir, 'dist/unrelated.txt'), 'utf8'), where).toBe('unrelated')
  expect(readFileSync(join(result.dir, 'dist/linux-unpacked/agenteque'), 'utf8'), where).toBe(
    'unpacked',
  )
}

function assertDecoyUntouched(result: WorkflowStepResult, platform: Platform, where: string): void {
  expect(readFileSync(join(result.distDir, decoyName(platform)), 'utf8'), where).toBe('decoy')
}

function assertNothingOutsideDist(result: WorkflowStepResult, where: string): void {
  const outside = relativeFiles(result.dir).filter((path) => !path.startsWith(`dist${sep}`))
  expect(outside, where).toEqual(['.harness-step.sh', 'outside/sentinel', 'package.json'])
}

function artifactPaths(result: WorkflowStepResult): string[] {
  return relativeFiles(result.distDir).filter((path) => {
    return readFileSync(join(result.distDir, path), 'utf8') === artifactBytes
  })
}

it('does not inline inputs.label into the rename script', () => {
  const script = extractRunScript(yaml, step, 'package')
  expect(script.includes('${{')).toBe(false)
  expect(script).toContain('mv "dist/${built[$i]}" "dist/${renamed[$i]}"')
  expect(yaml).toContain('LABEL: ${{ inputs.label }}')
  assertLabelExpansionsAreQuoted(script)
})

it('treats $(touch pwned) in LABEL as a literal filename', async () => {
  const label = '$(touch pwned)'
  for (const platform of platforms) {
    const where = `${platform} ${JSON.stringify(label)}`
    const result = await runRename(platform, label)
    try {
      expect(result.exitCode, where).toBe(0)
      assertNoCommandSideEffects(result, where)
      assertDecoyUntouched(result, platform, where)
      assertNothingOutsideDist(result, where)
      for (const name of builtNames(platform)) {
        expect(relativeFiles(result.distDir), where).not.toContain(name)
      }
      for (const name of renamedNames(platform, label)) {
        expect(readFileSync(join(result.distDir, name), 'utf8'), where).toBe(artifactBytes)
        expect(isInside(result.distDir, realpathSync(join(result.distDir, name))), where).toBe(true)
      }
    } finally {
      await result.cleanup()
    }
  }
})

it('keeps spaces in LABEL inside one filename', async () => {
  const label = 'evil name'
  for (const platform of platforms) {
    const where = `${platform} ${JSON.stringify(label)}`
    const result = await runRename(platform, label)
    try {
      expect(result.exitCode, where).toBe(0)
      assertNoCommandSideEffects(result, where)
      assertDecoyUntouched(result, platform, where)
      assertNothingOutsideDist(result, where)
      for (const name of renamedNames(platform, label)) {
        expect(readFileSync(join(result.distDir, name), 'utf8'), where).toBe(artifactBytes)
        expect(name.split(sep), where).toHaveLength(1)
      }
      expect(artifactPaths(result), where).toHaveLength(builtNames(platform).length)
    } finally {
      await result.cleanup()
    }
  }
})

it('does not let * in LABEL expand to other files', async () => {
  const label = '*'
  for (const platform of platforms) {
    const where = `${platform} ${JSON.stringify(label)}`
    const result = await runRename(platform, label)
    try {
      expect(result.exitCode, where).toBe(0)
      assertNoCommandSideEffects(result, where)
      assertDecoyUntouched(result, platform, where)
      assertNothingOutsideDist(result, where)
      for (const name of renamedNames(platform, label)) {
        expect(readFileSync(join(result.distDir, name), 'utf8'), where).toBe(artifactBytes)
        expect(name.includes('*'), where).toBe(true)
      }
      expect(artifactPaths(result), where).toHaveLength(builtNames(platform).length)
    } finally {
      await result.cleanup()
    }
  }
})

it('does not run commands injected by a newline in LABEL', async () => {
  const label = 'evil\ntouch pwned'
  for (const platform of platforms) {
    const where = `${platform} ${JSON.stringify(label)}`
    const result = await runRename(platform, label)
    try {
      expect(result.exitCode, where).toBe(0)
      assertNoCommandSideEffects(result, where)
      assertDecoyUntouched(result, platform, where)
      assertNothingOutsideDist(result, where)
      for (const name of renamedNames(platform, label)) {
        expect(name.includes('\n'), where).toBe(true)
        expect(readFileSync(join(result.distDir, name), 'utf8'), where).toBe(artifactBytes)
        expect(isInside(result.distDir, realpathSync(join(result.distDir, name))), where).toBe(true)
      }
    } finally {
      await result.cleanup()
    }
  }
})

it('does not let ../ in LABEL write outside dist', async () => {
  for (const platform of platforms) {
    for (const label of traversalLabels) {
      const where = `${platform} ${JSON.stringify(label)}`
      const result = await runRename(platform, label)
      try {
        expect(result.exitCode, where).not.toBeNull()
        assertNoCommandSideEffects(result, where)
        assertDecoyUntouched(result, platform, where)
        assertNothingOutsideDist(result, where)
        const payloads = artifactPaths(result)
        expect(payloads, where).toHaveLength(builtNames(platform).length)
        for (const path of payloads) {
          expect(isInside(result.distDir, realpathSync(join(result.distDir, path))), where).toBe(
            true,
          )
          expect(path.split(sep), where).not.toContain('..')
        }
      } finally {
        await result.cleanup()
      }
    }
  }
})
