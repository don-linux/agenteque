import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, resolve } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { readWorkflowYaml, runWorkflowStep } from '../helpers/workflow'

/**
 * The package job runs on ubuntu-24.04, whose default locale is C.UTF-8.
 * GNU grep `[0-9]` under en_US.UTF-8 also matches fullwidth digits. The
 * workflow helper inherits this process locale, so the gate is pinned here.
 */
const RUNNER_LOCALE = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } as const

const yaml = readWorkflowYaml('build.yml')
const step = 'Check the glibc requirement'

/**
 * `sort -V` must rank 2.3 before documented 2.25, and 2.25.1 after it.
 * Empty objdump stdout must fail the release gate instead of counting as 2.25.
 */
function symbolTable(versions: readonly string[]): string {
  return versions
    .map(
      (version) =>
        `0000000000000000      DF *UND*\t0000000000000000  GLIBC_${version}   sym_${version.replaceAll('.', '_')}`,
    )
    .join('\n')
    .concat('\n')
}

function shQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function installObjdump(stdout: string): { binDir: string; logPath: string } {
  const root = mkdtempSync(resolve(tmpdir(), 'agenteque-g09-'))
  const binDir = resolve(root, 'bin')
  mkdirSync(binDir)
  const logPath = resolve(root, 'argv.txt')
  const payloadPath = resolve(root, 'stdout.txt')
  writeFileSync(payloadPath, stdout)
  writeFileSync(logPath, '')
  writeFileSync(
    resolve(binDir, 'objdump'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${shQuote(logPath)}`,
      'target=""',
      'for arg in "$@"; do target=$arg; done',
      'if [ ! -f "$target" ]; then',
      '  echo "objdump: $target: No such file" >&2',
      '  exit 1',
      'fi',
      `cat ${shQuote(payloadPath)}`,
      '',
    ].join('\n'),
  )
  chmodSync(resolve(binDir, 'objdump'), 0o755)
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true })
  })
  return { binDir, logPath }
}

function assertGnuSort(): void {
  const version = spawnSync('sort', ['--version'], { encoding: 'utf8' })
  const text = `${version.stdout ?? ''}\n${version.stderr ?? ''}`
  if (!text.includes('GNU coreutils')) {
    throw new Error(`The linux package job uses GNU sort -V. This host reported: ${text.trim()}`)
  }
}

async function runGlibcCheck(stdout: string) {
  assertGnuSort()
  const inherited = process.env.PATH
  if (!inherited) throw new Error('PATH is required so grep, sed, and sort resolve')
  const fake = installObjdump(stdout)
  const result = await runWorkflowStep({
    yaml,
    step,
    job: 'package',
    distFiles: { 'linux-unpacked/agenteque': 'not-an-elf' },
    env: { PATH: `${fake.binDir}${delimiter}${inherited}`, ...RUNNER_LOCALE },
  })
  return { result, invocations: readFileSync(fake.logPath, 'utf8') }
}

it('treats glibc 2.3 as older than documented 2.25', async () => {
  const { result, invocations } = await runGlibcCheck(symbolTable(['2.3']))
  const detail = `${result.stdout}\n${result.stderr}`

  expect(invocations).toContain('-T dist/linux-unpacked/agenteque')
  expect(result.stdout).toContain('The packaged binary needs glibc 2.3 (documented: 2.25)')
  expect(result.stdout).not.toContain('::error::')
  expect(result.exitCode, detail).toBe(0)
  await result.cleanup()
})

it('treats glibc 2.25.1 as newer than documented 2.25', async () => {
  // 2.25.1 is first in the file so a missing sort -V would keep 2.25 and pass.
  const { result, invocations } = await runGlibcCheck(symbolTable(['2.25.1', '2.3', '2.25']))
  const detail = `${result.stdout}\n${result.stderr}`

  expect(invocations).toContain('-T dist/linux-unpacked/agenteque')
  expect(result.stdout).toContain('The packaged binary needs glibc 2.25.1 (documented: 2.25)')
  expect(result.stdout).toContain(
    '::error::glibc 2.25.1 is newer than the documented 2.25; update docs/HOW-TO-CHANGELOG.md, the release notes and GLIBC_DOCUMENTED',
  )
  expect(result.exitCode, detail).not.toBe(0)
  await result.cleanup()
})

it('rejects empty objdump output', async () => {
  const { result, invocations } = await runGlibcCheck('')
  const detail = `${result.stdout}\n${result.stderr}`

  expect(invocations).toContain('-T dist/linux-unpacked/agenteque')
  expect(result.stdout, detail).not.toContain('documented: 2.25')
  expect(result.exitCode, detail).not.toBe(0)
  await result.cleanup()
})
