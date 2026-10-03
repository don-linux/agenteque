/**
 * ADV-G10. The publish job's Checksums step must hash every file in dist/.
 * Names that start with `-`, contain spaces or newlines, or are blank must stay
 * filenames. A leading `./` keeps an operand named `-` from being read as stdin.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import {
  extractRunScript,
  readWorkflowYaml,
  runWorkflowStep,
  type WorkflowStepResult,
} from '../helpers/workflow'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_G10 = { id: 'ADV-G10' } as const
const yaml = readWorkflowYaml('release.yml')
const emptyDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

/** Names the release actually publishes, beside the hostile ones. */
const artifacts = {
  'agenteque-v0.0.1-x86_64.AppImage': 'appimage-bytes',
  'agenteque-v0.0.1-x86_64.deb': 'deb-bytes',
  'agenteque-v0.0.1-x86_64.rpm': 'rpm-bytes',
  'agenteque-v0.0.1-x86_64-linux.tar.gz': 'tarball-bytes',
  'agenteque-v0.0.1-x86_64-windows-portable.exe': 'exe-bytes',
  'agenteque-v0.0.1-macos-arm64.dmg': 'dmg-bytes',
} as const

interface ChecksumRecord {
  hash: string
  name: string
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents).digest('hex')
}

function unescapeGnuName(name: string): string {
  let out = ''
  for (let index = 0; index < name.length; index += 1) {
    if (name[index] !== '\\') {
      out += name[index]
      continue
    }
    const next = name[index + 1]
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === '\\') out += '\\'
    else throw new Error(`bad checksum escape: ${JSON.stringify(name)}`)
    index += 1
  }
  return out
}

function parseChecksumLine(line: string): ChecksumRecord {
  let body = line
  let escaped = false
  if (body.startsWith('\\')) {
    escaped = true
    body = body.slice(1)
  }
  const hash = body.slice(0, 64)
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`checksum line has no hash: ${JSON.stringify(line)}`)
  }
  const mode = body[65]
  if (body[64] !== ' ' || (mode !== ' ' && mode !== '*')) {
    throw new Error(`checksum line has no name marker: ${JSON.stringify(line)}`)
  }
  const name = escaped ? unescapeGnuName(body.slice(66)) : body.slice(66)
  return { hash, name }
}

function parseChecksums(contents: string): ChecksumRecord[] {
  if (contents === '') return []
  const text = contents.endsWith('\n') ? contents.slice(0, -1) : contents
  if (text === '') return []
  return text.split('\n').map((line) => parseChecksumLine(line))
}

function assertNoPwned(result: WorkflowStepResult): void {
  expect(readdirSync(result.dir)).not.toContain('pwned')
  expect(readdirSync(result.distDir)).not.toContain('pwned')
}

/** Each planted file has one record whose hash is its bytes. `./` prefixes are the same file. */
function assertChecksums(
  result: WorkflowStepResult,
  files: Readonly<Record<string, string>>,
): void {
  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  const raw = readFileSync(join(result.distDir, 'checksums.txt'), 'utf8')
  expect(result.stdout).toBe(raw)

  const records = parseChecksums(raw)
  expect(records).toHaveLength(Object.keys(files).length)
  for (const record of records) expect(record.name).not.toBe('')

  for (const [name, contents] of Object.entries(files)) {
    const filePath = join(result.distDir, name)
    expect(readFileSync(filePath, 'utf8'), JSON.stringify(name)).toBe(contents)
    const hits = records.filter((record) => {
      return resolve(result.distDir, record.name) === filePath && record.hash === sha256(contents)
    })
    expect(hits, JSON.stringify(name)).toHaveLength(1)
  }

  const verified = spawnSync('sha256sum', ['-c', 'checksums.txt'], {
    cwd: result.distDir,
    input: 'stdin-must-not-be-the-artifact',
    encoding: 'utf8',
  })
  expect(verified.status, verified.stderr).toBe(0)
  const lines = (verified.stdout ?? '').split('\n').filter((line) => line.length > 0)
  expect(lines).toHaveLength(Object.keys(files).length)
  for (const line of lines) expect(line.endsWith(': OK'), line).toBe(true)
}

async function runChecksums(
  distFiles: Readonly<Record<string, string>>,
): Promise<WorkflowStepResult> {
  return runWorkflowStep({
    yaml,
    step: 'Checksums',
    job: 'publish',
    distFiles,
  })
}

it('checksums files from the publish job', () => {
  const script = extractRunScript(yaml, 'Checksums', 'publish')
  expect(script.includes('${{')).toBe(false)
  expect(script).toContain('sha256sum')
  expect(script).toContain('checksums.txt')
})

it('hashes option-like names as files', async () => {
  const files = {
    ...artifacts,
    '-n': 'dash-n',
    '-c': 'dash-c',
    '-b': 'dash-b',
    '--': 'double-dash',
    '--check': 'not-a-check-flag',
    '--help': 'not-help',
    '--version': 'not-version',
    '--status': 'not-status',
    '--tag': 'not-tag',
    '--zero': 'not-zero',
    '--ignore-missing': 'not-ignore-missing',
    '--binary': 'not-binary',
    '--text': 'not-text',
    '-n;touch pwned': 'one-filename',
  }
  const result = await runChecksums(files)
  try {
    expect(result.exitCode).toBe(0)
    assertNoPwned(result)
    assertChecksums(result, files)
  } finally {
    await result.cleanup()
  }
})

it('hashes names that contain spaces as one file', async () => {
  const files = {
    ...artifacts,
    'my file.txt': 'spaces',
    'agenteque 0.0.1.exe': 'windows-style',
    ' leading space': 'leading',
    'trailing space ': 'trailing',
    'a  b': 'double-gap',
    'a b $(touch pwned)': 'command-looking',
  }
  const result = await runChecksums(files)
  try {
    expect(result.exitCode).toBe(0)
    assertNoPwned(result)
    assertChecksums(result, files)
  } finally {
    await result.cleanup()
  }
})

it('hashes names that contain newlines as one file', async () => {
  const files = {
    ...artifacts,
    'hello\nworld.txt': 'newline-name',
    'a\nb\nc': 'two-newlines',
    'ok\ntouch pwned': 'newline-command',
    'a\\b\nc': 'backslash-and-newline',
    '\n': 'newline-only',
    '\n\n': 'blank-lines',
  }
  const result = await runChecksums(files)
  try {
    expect(result.exitCode).toBe(0)
    assertNoPwned(result)
    assertChecksums(result, files)
  } finally {
    await result.cleanup()
  }
})

it('fails closed when there is no artifact name', async () => {
  const result = await runChecksums({})
  try {
    expect(result.exitCode).toBe(1)
    expect(result.stdout).not.toContain(emptyDigest)
    const checksumPath = join(result.distDir, 'checksums.txt')
    const raw = existsSync(checksumPath) ? readFileSync(checksumPath, 'utf8') : ''
    expect(raw).not.toContain(emptyDigest)
    expect(parseChecksums(raw)).toEqual([])
    expect(readdirSync(result.dir)).not.toContain('pwned')
  } finally {
    await result.cleanup()
  }
})

it('hashes whitespace-only names and records no empty name', async () => {
  // POSIX rejects an empty directory entry, so a blank name is the closest file.
  const files = {
    ...artifacts,
    ' ': 'one-space',
    '  ': 'two-spaces',
    '\t': 'tab',
    ' \t ': 'mixed-blank',
  }
  const result = await runChecksums(files)
  try {
    expect(result.exitCode).toBe(0)
    assertNoPwned(result)
    assertChecksums(result, files)
  } finally {
    await result.cleanup()
  }
})

it('ADV-G10 hashes a file named - as the artifact bytes', { meta: ADV_G10 }, async () => {
  const files = {
    ...artifacts,
    '-': 'not-stdin',
  }
  const result = await runChecksums(files)
  try {
    expect(result.exitCode).toBe(0)
    assertNoPwned(result)
    assertChecksums(result, files)
  } finally {
    await result.cleanup()
  }
})
