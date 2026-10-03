/**
 * "Tag format" in release.yml is the only gate that decides a publish tag is
 * vMAJOR.MINOR.PATCH. A tag that passes is used as a path
 * (`docs/release-notes/$TAG.md`) and as the GitHub release name.
 *
 * Secure behavior is an ASCII semantic version: no leading zeros, no
 * pre-release or other suffix, and no extra bytes. Bash `[0-9]` follows
 * LC_COLLATE, and the workflow never pins it, so unicode digits are checked
 * both as on the hosted runner (C.UTF-8) and under a language locale.
 */
import { expect, it } from 'vitest'
import { readWorkflowYaml, runWorkflowStep } from '../helpers/workflow'

const yaml = readWorkflowYaml('release.yml')

const locales = {
  'C.UTF-8': { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  'en_US.UTF-8': { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
} as const

type LocaleName = keyof typeof locales

const bothLocales: readonly LocaleName[] = ['C.UTF-8', 'en_US.UTF-8']

const unicodeDigitTags = [
  'v\uFF11.\uFF12.\uFF13',
  'v\u0661.\u0662.\u0663',
  'v\u0967.\u0968.\u0969',
  'v\u00B9.\u00B2.\u00B3',
] as const

async function tagExitCode(tag: string, localeName: LocaleName): Promise<number | null> {
  const locale = locales[localeName]
  const result = await runWorkflowStep({
    yaml,
    job: 'verify',
    step: 'Tag format',
    env: { LANG: locale.LANG, LC_ALL: locale.LC_ALL, TAG: tag },
  })
  try {
    return result.exitCode
  } finally {
    await result.cleanup()
  }
}

async function tagExits(
  tags: readonly string[],
  localeNames: readonly LocaleName[],
): Promise<ReadonlyArray<{ where: string; exitCode: number | null }>> {
  const rows: Array<{ where: string; exitCode: number | null }> = []
  for (const localeName of localeNames) {
    for (const tag of tags) {
      rows.push({
        where: `${localeName} ${JSON.stringify(tag)}`,
        exitCode: await tagExitCode(tag, localeName),
      })
    }
  }
  return rows
}

it('accepts a semver tag', async () => {
  for (const row of await tagExits(['v1.2.3', 'v0.0.1', 'v10.20.30'], bothLocales)) {
    expect(row.exitCode, row.where).toBe(0)
  }
})

it('rejects a trailing newline', async () => {
  for (const row of await tagExits(['v1.2.3\n'], bothLocales)) {
    expect(row.exitCode, row.where).toBe(1)
  }
})

it.fails('ADV-G06 rejects a leading zero', async () => {
  for (const row of await tagExits(['v01.2.3', 'v1.02.3', 'v1.2.03'], bothLocales)) {
    expect(row.exitCode, row.where).toBe(1)
  }
})

it('rejects unicode digits in the C locale', async () => {
  for (const row of await tagExits(unicodeDigitTags, ['C.UTF-8'])) {
    expect(row.exitCode, row.where).toBe(1)
  }
})

it.fails('ADV-G06 rejects unicode digits', async () => {
  for (const row of await tagExits(unicodeDigitTags, ['en_US.UTF-8'])) {
    expect(row.exitCode, row.where).toBe(1)
  }
})

it('rejects a pre-release suffix', async () => {
  for (const row of await tagExits(['v1.2.3-rc'], bothLocales)) {
    expect(row.exitCode, row.where).toBe(1)
  }
})

it('rejects a path traversal tag', async () => {
  for (const row of await tagExits(['v1.2.3/../x'], bothLocales)) {
    expect(row.exitCode, row.where).toBe(1)
  }
})
