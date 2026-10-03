/**
 * Public exports:
 * - extractRunScript
 * - readWorkflowYaml
 * - runWorkflowStep
 *
 * Types: RunWorkflowStepOptions, WorkflowStepResult, WorkflowName.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { onTestFinished } from 'vitest'
import { root } from './paths'

const WORKFLOW_FILES = ['build.yml', 'ci.yml', 'release.yml'] as const
const DEFAULT_TIMEOUT_MS = 30_000
const INHERITED_ENV = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'SHELL'] as const

export type WorkflowName = (typeof WORKFLOW_FILES)[number]

export interface RunWorkflowStepOptions {
  /** Workflow YAML text. Use `readWorkflowYaml` for a file in `.github/workflows`. */
  yaml: string
  /** Exact step `name`. */
  step: string
  /** Job id under `jobs`. Required when the same step name appears twice. */
  job?: string
  /**
   * Hostile environment. Wins over workflow, job, and step `env`.
   * Only PATH, HOME, TMPDIR, LANG, LC_ALL, USER, and SHELL are inherited.
   * Copy anything else into this object.
   */
  env?: Readonly<Record<string, string>>
  /** Files written under `dist/` before the script runs. An empty string is an empty file. */
  distFiles?: Readonly<Record<string, string | Uint8Array>>
  /** Other files written relative to the temp repo root. */
  files?: Readonly<Record<string, string | Uint8Array>>
  /** Runs after the files exist and before bash. Use it for symlinks or a git repo. */
  prepare?: (dir: string) => void | Promise<void>
  /** Kills the script after this many milliseconds. Defaults to 30s. */
  timeoutMs?: number
}

export interface WorkflowStepResult {
  exitCode: number | null
  stdout: string
  stderr: string
  /** Temp repo root. Removed by `cleanup`. */
  dir: string
  distDir: string
  /** The `run:` text that was executed. */
  script: string
  cleanup(): Promise<void>
}

/** Read one of the repo workflows. The name is not a path. */
export function readWorkflowYaml(name: WorkflowName): string {
  if (!WORKFLOW_FILES.includes(name)) {
    throw new Error(`Unknown workflow ${name}`)
  }
  return readFileSync(resolve(root, '.github/workflows', name), 'utf8')
}

/** Return the `run:` script for a named step. Throws if it is missing or ambiguous. */
export function extractRunScript(workflowYaml: string, stepName: string, jobName?: string): string {
  return resolveStep(workflowYaml, stepName, jobName).script
}

/**
 * Run a step's `run:` with `/bin/bash --noprofile --norc -eo pipefail` in a temp directory.
 * A step `shell:` other than bash is ignored. `${{ }}` expressions are not interpolated.
 * Cleaned up when the calling test finishes.
 */
export async function runWorkflowStep(
  options: RunWorkflowStepOptions,
): Promise<WorkflowStepResult> {
  const step = resolveStep(options.yaml, options.step, options.job)
  const dir = mkdtempSync(resolve(tmpdir(), 'agenteque-workflow-'))
  try {
    return await executeStep(dir, step, options)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}

async function executeStep(
  dir: string,
  step: ResolvedStep,
  options: RunWorkflowStepOptions,
): Promise<WorkflowStepResult> {
  const dist = resolve(dir, 'dist')
  mkdirSync(dist, { recursive: true })
  writeTree(dir, options.files ?? {})
  writeTree(dist, options.distFiles ?? {})
  if (options.prepare) await options.prepare(dir)

  const scriptPath = resolve(dir, '.harness-step.sh')
  writeFileSync(scriptPath, step.script, 'utf8')
  const cwd = resolveWorkingDirectory(dir, step.workingDirectory)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-eo', 'pipefail', scriptPath], {
    cwd,
    env: { ...baseEnv(), ...step.env, ...options.env },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  })

  let stderr = result.stderr ?? ''
  if (result.error) {
    const timedOut = (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
    stderr += `\n${timedOut ? `timed out after ${timeoutMs}ms` : result.error.message}`
  }

  let removed = false
  const cleanup = async (): Promise<void> => {
    if (removed) return
    removed = true
    rmSync(dir, { recursive: true, force: true })
  }
  registerCleanup(cleanup)

  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr,
    dir,
    distDir: dist,
    script: step.script,
    cleanup,
  }
}

interface ResolvedStep {
  script: string
  workingDirectory: string | undefined
  env: Record<string, string>
}

function resolveStep(
  workflowYaml: string,
  stepName: string,
  jobName: string | undefined,
): ResolvedStep {
  const workflow = parseWorkflow(workflowYaml)
  const jobs = record(workflow.jobs, 'jobs')
  const workflowEnv = envMap(workflow.env)
  const workflowDir = defaultsDirectory(workflow.defaults)

  const matches: ResolvedStep[] = []
  const jobEntries =
    jobName === undefined ? Object.entries(jobs) : [[jobName, jobs[jobName]] as const]

  for (const [id, jobValue] of jobEntries) {
    if (jobValue === undefined) throw new Error(`Workflow has no job ${JSON.stringify(jobName)}`)
    const job = record(jobValue, `jobs.${id}`)
    const steps = job.steps
    if (!Array.isArray(steps)) continue
    const jobEnv = { ...workflowEnv, ...envMap(job.env) }
    const jobDir = defaultsDirectory(job.defaults) ?? workflowDir

    for (const stepValue of steps) {
      if (!isRecord(stepValue)) continue
      if (stepValue.name !== stepName) continue
      if (typeof stepValue.run !== 'string' || stepValue.run.length === 0) {
        throw new Error(`Step ${JSON.stringify(stepName)} in job ${id} has no run: script`)
      }
      const directory =
        typeof stepValue['working-directory'] === 'string' ? stepValue['working-directory'] : jobDir
      matches.push({
        script: stepValue.run,
        workingDirectory: directory,
        env: { ...jobEnv, ...envMap(stepValue.env) },
      })
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `No step named ${JSON.stringify(stepName)}${jobName ? ` in job ${jobName}` : ''}`,
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `Step ${JSON.stringify(stepName)} matched ${matches.length} steps. Pass the job id.`,
    )
  }
  const match = matches[0]
  if (!match) throw new Error(`No step named ${JSON.stringify(stepName)}`)
  return match
}

function parseWorkflow(workflowYaml: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = parse(workflowYaml)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not parse workflow YAML: ${message}`, { cause: error })
  }
  return record(parsed, 'workflow')
}

function defaultsDirectory(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.run)) return undefined
  const directory = value.run['working-directory']
  return typeof directory === 'string' ? directory : undefined
}

function envMap(value: unknown): Record<string, string> {
  if (value === undefined) return {}
  const source = record(value, 'env')
  const env: Record<string, string> = {}
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'string') env[key] = entry
    else if (typeof entry === 'number' || typeof entry === 'boolean') env[key] = String(entry)
  }
  return env
}

function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_ENV) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.LANG ??= 'C.UTF-8'
  return env
}

function writeTree(directory: string, files: Readonly<Record<string, string | Uint8Array>>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = resolve(directory, relativePath)
    assertInside(directory, target)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, contents)
  }
}

function resolveWorkingDirectory(dir: string, directory: string | undefined): string {
  if (directory === undefined) return dir
  const target = resolve(dir, directory)
  assertInside(dir, target)
  mkdirSync(target, { recursive: true })
  return target
}

function assertInside(rootDir: string, target: string): void {
  const fromRoot = relative(rootDir, target)
  if (
    fromRoot === '' ||
    fromRoot.startsWith(`..${sep}`) ||
    fromRoot === '..' ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`Refusing to write outside the temp directory: ${target}`)
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected ${label} to be a mapping`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function registerCleanup(cleanup: () => Promise<void>): void {
  try {
    onTestFinished(cleanup)
  } catch {
    // Called outside a test. The caller runs cleanup().
  }
}
