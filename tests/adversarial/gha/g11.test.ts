/**
 * G11: concurrency groups, workflow_call inputs, and artifact retention.
 *
 * A release must keep a single in-progress publish for that tag. Cancelling it
 * kills action-gh-release mid-upload and can leave a GitHub Release whose
 * assets do not match checksums.txt. Pull-request CI is the opposite: a new
 * push has to cancel that pull request's run so a force-push cannot leave a
 * stale package build uploading artifacts.
 *
 * retention-days is a number input defaulting to 7. upload-artifact treats 0
 * and an empty value as "repository default" (often 90 days), so the upload
 * step has to receive this input rather than omit it.
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { readWorkflowYaml, type WorkflowName } from '../helpers/workflow'

const WORKFLOWS: readonly WorkflowName[] = ['build.yml', 'ci.yml', 'release.yml']
const WORKFLOW_DIRECTORY = resolve(import.meta.dirname, '../../../.github/workflows')

/** Per-tag group. Different tags do not queue behind each other. */
const RELEASE_GROUP = 'release-${{ github.ref_name }}'
/** Per pull request. Forks that reuse a branch name do not share a group. */
const CI_GROUP = 'ci-${{ github.event.pull_request.number }}'

const RETENTION_DAYS = 7
const RETENTION_EXPRESSIONS = new Set(['inputs.retention-days', "inputs['retention-days']"])

const PULL_NUMBERS = ['1', '12', '0', '123456'] as const
const TAGS = ['v0.0.1', 'v1.2.3', 'vci-1', 'vCI-12', 'vrelease-1', 'V0.0.1'] as const

interface WorkflowDocument {
  name: WorkflowName
  yaml: string
  doc: Record<string, unknown>
}

interface ConcurrencyBlock {
  where: string
  present: boolean
  group: string | undefined
  cancelInProgress: unknown
}

interface BuildCaller {
  workflow: WorkflowName
  job: string
  with: Record<string, unknown>
}

describe('ADV-G11', () => {
  it('does not cancel an in-progress release', () => {
    loadWorkflows()
    const release = loadWorkflow('release.yml')
    const blocks = concurrencyBlocks(release)
    const workflow = blocks.find((block) => block.where === 'release.yml workflow')
    const violations: string[] = []

    if (!workflow?.present || workflow.group === undefined) {
      violations.push('release.yml has no concurrency group, so two publishes of one tag can race')
    } else if (normalizeExpressions(workflow.group) !== RELEASE_GROUP) {
      violations.push(
        `release group ${JSON.stringify(workflow.group)} is not per tag (${RELEASE_GROUP})`,
      )
    }
    if (workflow && cancelsRunningWork(workflow.cancelInProgress)) {
      violations.push(
        `release.yml workflow cancel-in-progress=${JSON.stringify(workflow.cancelInProgress)}`,
      )
    }

    for (const block of blocks) {
      if (!block.where.includes(' job ')) continue
      if (!block.present) continue
      if (cancelsRunningWork(block.cancelInProgress)) {
        violations.push(
          `${block.where} cancel-in-progress=${JSON.stringify(block.cancelInProgress)}`,
        )
      }
      if (block.group !== undefined && normalizeExpressions(block.group) !== RELEASE_GROUP) {
        violations.push(
          `${block.where} group ${JSON.stringify(block.group)} is not the release group`,
        )
      }
    }

    for (const block of concurrencyBlocks(loadWorkflow('build.yml'))) {
      if (block.present && cancelsRunningWork(block.cancelInProgress)) {
        violations.push(
          `${block.where} would cancel an in-progress package job, including a release build`,
        )
      }
    }

    expect(violations).toEqual([])
  })

  it('cancels superseded pull requests without sharing a release group', () => {
    const ci = loadWorkflow('ci.yml')
    const workflow = concurrencyBlocks(ci).find((block) => block.where === 'ci.yml workflow')
    const violations: string[] = []

    if (!workflow?.present || workflow.group === undefined) {
      violations.push('ci.yml has no concurrency group')
    } else {
      const group = normalizeExpressions(workflow.group)
      if (group !== CI_GROUP)
        violations.push(`ci group ${JSON.stringify(workflow.group)} is not ${CI_GROUP}`)
      if (workflow.cancelInProgress !== true) {
        violations.push(
          `ci.yml cancel-in-progress=${JSON.stringify(workflow.cancelInProgress)}; a force-push would leave the previous package build running`,
        )
      }
      const first = expandGroup(group, { 'github.event.pull_request.number': PULL_NUMBERS[0] })
      const second = expandGroup(group, { 'github.event.pull_request.number': PULL_NUMBERS[1] })
      if (first.toLowerCase() === second.toLowerCase()) {
        violations.push(`pull requests share a concurrency group (${first})`)
      }
    }

    const releaseGroup = normalizeExpressions(
      concurrencyBlocks(loadWorkflow('release.yml')).find(
        (block) => block.where === 'release.yml workflow',
      )?.group ?? '',
    )
    for (const pull of PULL_NUMBERS) {
      for (const tag of TAGS) {
        const pullGroup = expandGroup(CI_GROUP, { 'github.event.pull_request.number': pull })
        const tagGroup = expandGroup(releaseGroup || RELEASE_GROUP, { 'github.ref_name': tag })
        if (pullGroup.toLowerCase() === tagGroup.toLowerCase()) {
          violations.push(`ci group ${pullGroup} collides with release group ${tagGroup}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('types workflow_call inputs and defaults retention-days to 7', () => {
    const build = loadWorkflow('build.yml')
    const on = build.doc.on
    const violations: string[] = []

    if (!isRecord(on) || Object.keys(on).toSorted().join(',') !== 'workflow_call') {
      violations.push(`build.yml triggers ${JSON.stringify(isRecord(on) ? Object.keys(on) : on)}`)
    }

    const inputs = workflowCallInputs(build)
    const label = inputs?.label
    const retention = inputs?.['retention-days']
    if (!isRecord(label)) violations.push('build.yml is missing the label input')
    else {
      if (label.type !== 'string') violations.push(`label type=${JSON.stringify(label.type)}`)
      if (label.required !== true)
        violations.push(`label required=${JSON.stringify(label.required)}`)
      if ('default' in label) violations.push(`label default=${JSON.stringify(label.default)}`)
    }
    if (!isRecord(retention)) violations.push('build.yml is missing the retention-days input')
    else {
      if (retention.type !== 'number') {
        violations.push(`retention-days type=${JSON.stringify(retention.type)}`)
      }
      if (retention.required !== false) {
        violations.push(`retention-days required=${JSON.stringify(retention.required)}`)
      }
      if (retention.default !== RETENTION_DAYS) {
        violations.push(
          `retention-days default=${JSON.stringify(retention.default)}; 0 or an omitted number input becomes the repository retention`,
        )
      }
    }

    const inputNames = inputs === undefined ? [] : Object.keys(inputs).toSorted()
    if (inputNames.join(',') !== 'label,retention-days') {
      violations.push(`workflow_call inputs are ${inputNames.join(', ') || '(none)'}`)
    }

    const callers = buildCallers()
    const callerNames = callers.map((caller) => `${caller.workflow}:${caller.job}`).toSorted()
    for (const caller of callers) {
      const keys = Object.keys(caller.with).toSorted()
      const extras = keys.filter((key) => key !== 'label' && key !== 'retention-days')
      if (extras.length > 0)
        violations.push(`${caller.workflow} passes unknown inputs ${extras.join(', ')}`)
      if (
        !keys.includes('label') ||
        typeof caller.with.label !== 'string' ||
        caller.with.label.length === 0
      ) {
        violations.push(`${caller.workflow} job ${caller.job} does not pass a label`)
      }
      const override = caller.with['retention-days']
      if (override !== undefined && override !== RETENTION_DAYS) {
        violations.push(
          `${caller.workflow} retention-days=${JSON.stringify(override)} overrides the 7-day default`,
        )
      }
    }

    if (callerNames.join(',') !== 'ci.yml:build,release.yml:build') {
      violations.push(`build.yml callers are ${callerNames.join(', ') || '(none)'}`)
    }

    const labels = Object.fromEntries(callers.map((caller) => [caller.workflow, caller.with.label]))
    if (labels['ci.yml'] !== 'pr-${{ github.event.pull_request.number }}') {
      violations.push(`ci.yml label=${JSON.stringify(labels['ci.yml'])}`)
    }
    if (labels['release.yml'] !== '${{ github.ref_name }}') {
      violations.push(`release.yml label=${JSON.stringify(labels['release.yml'])}`)
    }

    expect(violations).toEqual([])
  })

  it('uploads artifacts with the retention-days input', () => {
    const build = loadWorkflow('build.yml')
    const uploads = uploadArtifactSteps(build)
    const mentions = [...build.yaml.matchAll(/uses:\s*['"]?actions\/upload-artifact@/gi)].length
    const violations: string[] = []

    if (uploads.length === 0) violations.push('build.yml does not upload artifacts')
    if (uploads.length !== mentions) {
      violations.push(`parsed ${uploads.length} upload-artifact steps but found ${mentions} uses`)
    }

    for (const step of uploads) {
      const retention = step.retentionDays
      const body = typeof retention === 'string' ? expressionBody(retention) : undefined
      if (body === undefined || !RETENTION_EXPRESSIONS.has(body)) {
        violations.push(
          `${step.where} retention-days=${JSON.stringify(retention)}; an empty value keeps artifacts for the repository default`,
        )
      }
    }

    expect(violations).toEqual([])
  })
})

function loadWorkflows(): WorkflowDocument[] {
  const onDisk = readdirSync(WORKFLOW_DIRECTORY)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .toSorted()
  expect(onDisk).toEqual([...WORKFLOWS])

  return WORKFLOWS.map((name) => loadWorkflow(name))
}

function loadWorkflow(name: WorkflowName): WorkflowDocument {
  const yaml = readWorkflowYaml(name)
  const parsed: unknown = parse(yaml)
  if (!isRecord(parsed)) throw new Error(`${name} did not parse as a mapping`)
  return { name, yaml, doc: parsed }
}

function jobEntries(workflow: WorkflowDocument): Array<[string, Record<string, unknown>]> {
  const jobs = workflow.doc.jobs
  if (!isRecord(jobs)) throw new Error(`${workflow.name} has no jobs mapping`)
  const entries: Array<[string, Record<string, unknown>]> = []
  for (const [jobId, job] of Object.entries(jobs)) {
    if (!isRecord(job)) throw new Error(`${workflow.name} job ${jobId} is not a mapping`)
    entries.push([jobId, job])
  }
  return entries
}

function concurrencyBlocks(workflow: WorkflowDocument): ConcurrencyBlock[] {
  const blocks = [readConcurrency(`${workflow.name} workflow`, workflow.doc.concurrency)]
  for (const [jobId, job] of jobEntries(workflow)) {
    if (!('concurrency' in job)) continue
    blocks.push(readConcurrency(`${workflow.name} job ${jobId}`, job.concurrency))
  }
  return blocks
}

function readConcurrency(where: string, value: unknown): ConcurrencyBlock {
  if (value === undefined)
    return { where, present: false, group: undefined, cancelInProgress: undefined }
  if (typeof value === 'string') {
    return { where, present: true, group: value, cancelInProgress: undefined }
  }
  if (!isRecord(value) || typeof value.group !== 'string') {
    throw new Error(`${where} concurrency is not a group: ${JSON.stringify(value)}`)
  }
  return {
    where,
    present: true,
    group: value.group,
    cancelInProgress: value['cancel-in-progress'],
  }
}

/**
 * Only a boolean true cancels the run that is already publishing.
 * Omitted and false leave that run alone. Any expression might still be true.
 */
function cancelsRunningWork(value: unknown): boolean {
  return value !== undefined && value !== false
}

function normalizeExpressions(value: string): string {
  return value
    .replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, body: string) => `\${{ ${body.trim()} }}`)
    .trim()
}

function expandGroup(template: string, values: Readonly<Record<string, string>>): string {
  return normalizeExpressions(template).replace(
    /\$\{\{\s*([\s\S]*?)\s*\}\}/g,
    (_, body: string) => {
      const key = body.trim()
      const value = values[key]
      if (value === undefined) throw new Error(`No sample value for ${key} in ${template}`)
      return value
    },
  )
}

function workflowCallInputs(workflow: WorkflowDocument): Record<string, unknown> | undefined {
  const on = workflow.doc.on
  if (!isRecord(on) || !isRecord(on.workflow_call)) return undefined
  const inputs = on.workflow_call.inputs
  if (!isRecord(inputs)) return undefined
  return inputs
}

function buildCallers(): BuildCaller[] {
  const callers: BuildCaller[] = []
  for (const workflow of loadWorkflows()) {
    for (const [jobId, job] of jobEntries(workflow)) {
      if (typeof job.uses !== 'string' || !job.uses.endsWith('/.github/workflows/build.yml'))
        continue
      if (!isRecord(job.with))
        throw new Error(`${workflow.name} job ${jobId} calls build.yml without with:`)
      callers.push({ workflow: workflow.name, job: jobId, with: job.with })
    }
  }
  if (callers.length === 0) throw new Error('no workflow calls build.yml')
  return callers
}

function uploadArtifactSteps(
  workflow: WorkflowDocument,
): Array<{ where: string; retentionDays: unknown }> {
  const found: Array<{ where: string; retentionDays: unknown }> = []
  for (const [jobId, job] of jobEntries(workflow)) {
    if (!Array.isArray(job.steps)) continue
    for (const step of job.steps) {
      if (!isRecord(step) || typeof step.uses !== 'string' || !isUploadArtifact(step.uses)) continue
      const withBlock = step.with
      found.push({
        where: `${workflow.name} job ${jobId}`,
        retentionDays: isRecord(withBlock) ? withBlock['retention-days'] : undefined,
      })
    }
  }
  return found
}

function isUploadArtifact(uses: string): boolean {
  return uses.split('@')[0]?.trim().toLowerCase() === 'actions/upload-artifact'
}

function expressionBody(value: string): string | undefined {
  const match = normalizeExpressions(value).match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/)
  return match?.[1]?.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
