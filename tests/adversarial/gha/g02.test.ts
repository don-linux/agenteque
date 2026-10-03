import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { readWorkflowYaml, type WorkflowName } from '../helpers/workflow'

const WORKFLOWS: readonly WorkflowName[] = ['build.yml', 'ci.yml', 'release.yml']

/**
 * GitHub Release creation needs contents: write.
 * Every other job keeps the workflow default.
 */
const PUBLISH = { workflow: 'release.yml', job: 'publish' } as const

const workflowDirectory = resolve(import.meta.dirname, '../../../.github/workflows')

interface WorkflowDocument {
  name: WorkflowName
  yaml: string
  doc: Record<string, unknown>
}

interface CheckoutStep {
  workflow: WorkflowName
  job: string
  uses: string
  /** Absent when the step omits it. actions/checkout then defaults to true. */
  persistCredentials: unknown
}

describe('ADV-G02', () => {
  it('sets persist-credentials: false on every checkout', () => {
    const workflows = loadWorkflows()
    const checkouts = workflows.flatMap(checkoutSteps)
    let mentions = 0
    for (const workflow of workflows) mentions += checkoutMentions(workflow.yaml)

    expect(checkouts.length).toBeGreaterThan(0)
    expect(checkouts.length).toBe(mentions)

    const persisted = checkouts
      .filter((step) => !persistCredentialsIsOff(step.persistCredentials))
      .map(
        (step) =>
          `${step.workflow} job ${step.job} (${step.uses}) persist-credentials=${JSON.stringify(step.persistCredentials)}`,
      )
    expect(persisted).toEqual([])
  })

  it('defaults every workflow to contents: read', () => {
    const violations: string[] = []
    for (const workflow of loadWorkflows()) {
      if (!isContentsReadDefault(workflow.doc.permissions)) {
        violations.push(`${workflow.name} permissions=${JSON.stringify(workflow.doc.permissions)}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('grants contents: write only on publish', () => {
    let publishPermissions: unknown
    const writers: string[] = []

    for (const workflow of loadWorkflows()) {
      for (const [jobId, job] of jobEntries(workflow)) {
        if (workflow.name === PUBLISH.workflow && jobId === PUBLISH.job) {
          publishPermissions = job.permissions
          continue
        }
        if (jobGrantsContentsWrite(workflow.doc.permissions, job.permissions)) {
          const effective = job.permissions ?? workflow.doc.permissions
          writers.push(`${workflow.name} job ${jobId} permissions=${JSON.stringify(effective)}`)
        }
      }
    }

    expect(writers).toEqual([])
    expect(publishPermissions).toEqual({ contents: 'write' })
  })
})

function loadWorkflows(): WorkflowDocument[] {
  const onDisk = readdirSync(workflowDirectory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .toSorted()
  expect(onDisk).toEqual([...WORKFLOWS])

  return WORKFLOWS.map((name) => {
    const yaml = readWorkflowYaml(name)
    const parsed: unknown = parse(yaml)
    if (!isRecord(parsed)) throw new Error(`${name} did not parse as a mapping`)
    return { name, yaml, doc: parsed }
  })
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

function checkoutSteps(workflow: WorkflowDocument): CheckoutStep[] {
  const found: CheckoutStep[] = []
  for (const [jobId, job] of jobEntries(workflow)) {
    const steps = job.steps
    if (steps === undefined) continue
    if (!Array.isArray(steps)) throw new Error(`${workflow.name} job ${jobId} steps is not a list`)
    for (const step of steps) {
      if (!isRecord(step) || typeof step.uses !== 'string' || !isCheckoutAction(step.uses)) continue
      const withBlock = step.with
      found.push({
        workflow: workflow.name,
        job: jobId,
        uses: step.uses,
        persistCredentials: isRecord(withBlock) ? withBlock['persist-credentials'] : undefined,
      })
    }
  }
  return found
}

/** `actions/checkout` with or without a ref. The org/repo name is case-insensitive. */
function isCheckoutAction(uses: string): boolean {
  const action = uses.split('@')[0]?.trim().toLowerCase()
  return action === 'actions/checkout'
}

/**
 * `getBooleanInput` treats only these as false. Omitting the input leaves the
 * action default, which stores the job token in the git credential helper.
 */
function persistCredentialsIsOff(value: unknown): boolean {
  return value === false || value === 'false' || value === 'False' || value === 'FALSE'
}

function isContentsReadDefault(permissions: unknown): boolean {
  if (!isRecord(permissions) || permissions.contents !== 'read') return false
  return Object.values(permissions).every((value) => value !== 'write')
}

/**
 * A job `permissions` block replaces the workflow default.
 * `write-all` includes contents: write. An unrecognized block is treated as write.
 */
function jobGrantsContentsWrite(workflowPermissions: unknown, jobPermissions: unknown): boolean {
  const effective = jobPermissions === undefined ? workflowPermissions : jobPermissions
  return grantsContentsWrite(effective)
}

function grantsContentsWrite(permissions: unknown): boolean {
  if (permissions === 'write-all') return true
  if (permissions === 'read-all') return false
  if (!isRecord(permissions)) return permissions !== undefined
  if (permissions.contents === 'write') return true
  return (
    permissions.contents !== undefined &&
    permissions.contents !== 'read' &&
    permissions.contents !== 'none'
  )
}

/** Count checkout uses in the raw file so a step the parser skips cannot hide. */
function checkoutMentions(yaml: string): number {
  return [...yaml.matchAll(/uses:\s*['"]?actions\/checkout@/gi)].length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
