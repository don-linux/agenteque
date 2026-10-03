import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { readWorkflowYaml, runWorkflowStep } from '../helpers/workflow'

const yaml = readWorkflowYaml('release.yml')
const versionStep = 'Tag matches package.json'
const notesStep = 'Release notes exist'
const tag = 'v0.0.1'
const notesRel = `docs/release-notes/${tag}.md`

async function runVersionCheck(tagName: string, version: string) {
  return runWorkflowStep({
    yaml,
    job: 'verify',
    step: versionStep,
    env: { TAG: tagName },
    files: { 'package.json': `${JSON.stringify({ version })}\n` },
  })
}

async function runNotesCheck(
  extra: Pick<Parameters<typeof runWorkflowStep>[0], 'files' | 'prepare'>,
) {
  return runWorkflowStep({
    yaml,
    job: 'verify',
    step: notesStep,
    env: { TAG: tag },
    ...extra,
  })
}

it('rejects a tag that does not match package.json', async () => {
  const mismatch = await runVersionCheck('v0.0.2', '0.0.1')
  try {
    expect(mismatch.exitCode).toBe(1)
    expect(mismatch.stdout).toContain('Tag v0.0.2 does not match package.json version 0.0.1')
  } finally {
    await mismatch.cleanup()
  }

  const hostile = await runVersionCheck(tag, '$(touch pwned)')
  try {
    expect(hostile.exitCode).toBe(1)
    expect(hostile.stdout).toContain('does not match package.json version $(touch pwned)')
    expect(existsSync(resolve(hostile.dir, 'pwned'))).toBe(false)
  } finally {
    await hostile.cleanup()
  }
})

it('accepts a tag that matches package.json', async () => {
  const result = await runVersionCheck(tag, '0.0.1')
  try {
    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('::error::')
  } finally {
    await result.cleanup()
  }
})

it('rejects an empty release notes file', async () => {
  const result = await runNotesCheck({ files: { [notesRel]: '' } })
  try {
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(`::error::Missing ${notesRel}`)
  } finally {
    await result.cleanup()
  }
})

it('accepts a regular non-empty release notes file', async () => {
  const result = await runNotesCheck({
    files: { [notesRel]: 'agenteque 0.0.1 release notes\n' },
  })
  try {
    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('::error::')
  } finally {
    await result.cleanup()
  }
})

it.fails('ADV-G07 rejects a symlink in place of the release notes file', async () => {
  const result = await runNotesCheck({
    prepare: (dir) => {
      const outside = resolve(dir, 'outside-notes.txt')
      writeFileSync(outside, 'not the release notes\n')
      mkdirSync(resolve(dir, 'docs/release-notes'), { recursive: true })
      symlinkSync(outside, resolve(dir, notesRel))
    },
  })
  try {
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toContain(`::error::Missing ${notesRel}`)
  } finally {
    await result.cleanup()
  }
})

it.fails('ADV-G07 rejects a directory in place of the release notes file', async () => {
  const result = await runNotesCheck({
    prepare: (dir) => {
      const notes = resolve(dir, notesRel)
      mkdirSync(notes, { recursive: true })
      writeFileSync(resolve(notes, 'nested.md'), 'not the release notes\n')
    },
  })
  try {
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toContain(`::error::Missing ${notesRel}`)
  } finally {
    await result.cleanup()
  }
})
