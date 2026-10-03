import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { isScalar, LineCounter, parseDocument, visit } from 'yaml'
import { readWorkflowYaml, type WorkflowName } from '../helpers/workflow'

/**
 * G01. Every remote `uses:` is a full 40-character commit SHA, and the version
 * comment resolves to that SHA (`gh api`). A same-repo `./` path is already the
 * calling commit, so it stays relative instead of naming some other commit.
 */
const WORKFLOWS = ['build.yml', 'ci.yml', 'release.yml'] as const

const FULL_SHA = /^[0-9a-f]{40}$/i
const VERSION_TAG = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const REMOTE_USE =
  /^(?<owner>[A-Za-z0-9][A-Za-z0-9.-]*)\/(?<repo>[A-Za-z0-9._-]+)(?<subpath>\/[^@\s]+)?@(?<ref>\S+)$/

interface RemotePin {
  at: string
  owner: string
  repo: string
  ref: string
  tag: string
}

function collect(workflow: WorkflowName): { pins: RemotePin[]; problems: string[] } {
  const yaml = readWorkflowYaml(workflow)
  const lineCounter = new LineCounter()
  const doc = parseDocument(yaml, { lineCounter })
  const pins: RemotePin[] = []
  const problems: string[] = []

  if (doc.errors.length > 0) {
    problems.push(`${workflow}: ${doc.errors.map((error) => error.message).join('; ')}`)
  }

  visit(doc, {
    Pair(_key, pair) {
      if (!isScalar(pair.key) || pair.key.value !== 'uses') return
      const found = readUse(workflow, lineCounter, pair.value)
      if (found.problem) problems.push(found.problem)
      if (found.pin) pins.push(found.pin)
    },
  })

  return { pins, problems }
}

function readUse(
  workflow: WorkflowName,
  lineCounter: LineCounter,
  value: unknown,
): { pin?: RemotePin; problem?: string } {
  if (!isScalar(value) || typeof value.value !== 'string') {
    return { problem: `${workflow}: a uses: value is not a string` }
  }

  const line = value.range ? lineCounter.linePos(value.range[0]).line : 0
  const at = `${workflow}:${line}`
  const raw = value.value
  if (isSameRepoUse(raw)) return {}

  const groups = REMOTE_USE.exec(raw)?.groups
  const owner = groups?.owner
  const repo = groups?.repo
  const ref = groups?.ref
  if (!owner || !repo || !ref || !FULL_SHA.test(ref)) {
    return { problem: `${at}: ${raw} is not a 40-character SHA pin` }
  }

  const tag = value.comment?.trim() ?? ''
  if (!VERSION_TAG.test(tag)) {
    return { problem: `${at}: ${raw} is missing a # vX.Y.Z comment for the pinned SHA` }
  }

  return { pin: { at, owner, repo, ref, tag } }
}

/** `./` paths have no ref. `..`, `@ref`, and backslashes are not that form. */
function isSameRepoUse(value: string): boolean {
  if (
    !value.startsWith('./') ||
    value.includes('..') ||
    value.includes('@') ||
    value.includes('\\')
  ) {
    return false
  }
  return /^\.\/[A-Za-z0-9._/-]+$/.test(value)
}

function commitForTag(owner: string, repo: string, tag: string): string {
  const result = spawnSync('gh', ['api', `repos/${owner}/${repo}/commits/${tag}`, '--jq', '.sha'], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr ?? '').trim()
    throw new Error(`gh api repos/${owner}/${repo}/commits/${tag} failed: ${detail}`)
  }

  const sha = (result.stdout ?? '').trim()
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`gh api returned ${JSON.stringify(sha)} for ${owner}/${repo}@${tag}`)
  }
  return sha
}

it('pins every uses to a 40-character SHA or a same-repo relative path', () => {
  const workflowsDir = resolve(import.meta.dirname, '../../../.github/workflows')
  expect(readdirSync(workflowsDir).toSorted()).toEqual([...WORKFLOWS])

  const problems: string[] = []
  let pins = 0
  for (const workflow of WORKFLOWS) {
    const found = collect(workflow)
    problems.push(...found.problems)
    pins += found.pins.length
  }

  expect(problems, problems.join('\n')).toEqual([])
  expect(pins).toBeGreaterThan(0)
})

it('matches each version comment to that SHA via gh api', () => {
  const problems: string[] = []
  const resolved = new Map<string, string>()
  let pins = 0

  for (const workflow of WORKFLOWS) {
    for (const pin of collect(workflow).pins) {
      pins += 1
      const key = `${pin.owner}/${pin.repo}@${pin.tag}`
      let sha = resolved.get(key)
      if (sha === undefined) {
        sha = commitForTag(pin.owner, pin.repo, pin.tag)
        resolved.set(key, sha)
      }
      if (sha !== pin.ref.toLowerCase()) {
        problems.push(`${pin.at}: comment ${pin.tag} on ${key} resolves to ${sha}, not ${pin.ref}`)
      }
    }
  }

  expect(pins).toBeGreaterThan(0)
  expect(problems, problems.join('\n')).toEqual([])
})
