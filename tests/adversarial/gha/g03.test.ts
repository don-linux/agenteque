/**
 * G03: no pull_request_target, workflow_run, or issue_comment.
 * A controllable value may be bound with env: and read as a shell variable.
 * ${{ }} inside run: is expanded into the shell script before bash starts, so
 * those contexts stay out of run: entirely, including comparisons and toJSON.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseAllDocuments } from 'yaml'
import { expect, it } from 'vitest'
import { extractRunScript, readWorkflowYaml, type WorkflowName } from '../helpers/workflow'

const WORKFLOWS_DIRECTORY = resolve(import.meta.dirname, '../../../.github/workflows')
const KNOWN_WORKFLOWS = ['build.yml', 'ci.yml', 'release.yml'] as const
const FORBIDDEN_TRIGGERS = new Set(['pull_request_target', 'workflow_run', 'issue_comment'])

/** Terminal github.event fields that are numbers, enums, timestamps, or URLs. */
const SAFE_EVENT_LEAVES = new Set([
  'id',
  'node_id',
  'number',
  'sha',
  'action',
  'state',
  'merged',
  'draft',
  'private',
  'public',
  'fork',
  'login',
  'type',
  'site_admin',
  'before',
  'after',
  'created_at',
  'updated_at',
  'closed_at',
  'merged_at',
  'pushed_at',
  'additions',
  'deletions',
  'changed_files',
  'comments',
  'review_comments',
  'mergeable',
  'rebaseable',
  'maintainer_can_modify',
  'locked',
  'url',
])

const CONTROLLABLE_GITHUB = new Set([
  'github',
  'github.event',
  'github.head_ref',
  'github.base_ref',
  'github.ref',
  'github.ref_name',
  'github.workflow_ref',
])

const EMPTY_NAMES: ReadonlySet<string> = new Set()

interface AnalysisScope {
  taintedEnv: ReadonlySet<string>
  matrixTainted: boolean
  taintedSteps: ReadonlySet<string>
  taintedJobs: ReadonlySet<string>
  envPoisoned: boolean
}

interface TriggerHit {
  file: string
  trigger: string
}

interface ExpressionHit {
  file: string
  job: string
  step: string
  expression: string
}

interface PreparedStep {
  index: number
  id: string | undefined
  name: string | undefined
  script: string
  env: ReadonlyMap<string, string>
  outputsTainted: boolean
  poisonsEnv: boolean
}

interface PreparedJob {
  id: string
  matrixTainted: boolean
  steps: PreparedStep[]
  outputValues: string[]
  taintedStepIds: ReadonlySet<string>
}

it('does not trigger on pull_request_target, workflow_run, or issue_comment', () => {
  expect(triggerNamesOf('on: pull_request_target')).toEqual(['pull_request_target'])
  expect(triggerNamesOf('on: [push, issue_comment]')).toEqual(['issue_comment'])
  expect(
    triggerNamesOf('on:\n  workflow_run:\n    workflows: [CI]\n    types: [completed]'),
  ).toEqual(['workflow_run'])
  expect(triggerNamesOf('on: {pull_request_target: {types: [opened]}}')).toEqual([
    'pull_request_target',
  ])
  expect(triggerNamesOf('event: &bad pull_request_target\non: *bad')).toEqual([
    'pull_request_target',
  ])
  expect(
    forbiddenTriggers(
      'name: safe\non: push\njobs: {}\n---\nname: evil\non: issue_comment\njobs: {}\n',
      'fixture',
    ).map((hit) => hit.trigger),
  ).toEqual(['issue_comment'])
  expect(triggerNamesOf('on:\n  pull_request:\n    branches: [main]')).toEqual([])
  expect(triggerNamesOf('on: workflow_call')).toEqual([])
  expect(triggerNamesOf('on:\n  push:\n    tags: ["v*"]')).toEqual([])

  const workflows = loadWorkflows()
  expect(workflows.map((workflow) => workflow.file)).toEqual(
    expect.arrayContaining([...KNOWN_WORKFLOWS]),
  )
  expect(workflows.flatMap(({ file, yaml }) => forbiddenTriggers(yaml, file))).toEqual([])
})

it('does not expand controllable context inside run scripts', () => {
  const workflows = loadWorkflows()
  expect(workflows.map((workflow) => workflow.file)).toEqual(
    expect.arrayContaining([...KNOWN_WORKFLOWS]),
  )
  expect(workflows.flatMap(({ file, yaml }) => expressionHits(yaml, file))).toEqual([])
})

it('flags controllable run expressions and accepts env indirection', () => {
  const flagged = [
    'echo "${{ github.event.pull_request.title }}"',
    'echo "${{ github.event.issue.body }}"',
    'echo "${{ github.event.comment.body }}"',
    'echo "${{ github.event.pull_request.head.ref }}"',
    'echo "${{ github.head_ref }}"',
    'echo "${{ github[\'head_ref\'] }}"',
    "echo \"${{ github.event['pull_request']['title'] }}\"",
    'echo "${{ toJSON(github) }}"',
    'echo "${{ toJSON(github.event) }}"',
    'echo "${{ github.ref_name }}"',
    'echo "${{ github.ref }}"',
    'echo "${{ github.base_ref }}"',
    'echo "${{ github.workflow_ref }}"',
    'echo "${{ inputs.label }}"',
    'echo "${{ github[format(\'head_ref\')] }}"',
    'echo "${{ github.ref_name == \'v0.0.1\' }}"',
  ]
  for (const script of flagged) {
    expect(expressionHits(singleRun(script), script), script).not.toEqual([])
  }

  expect(
    expressionHits(
      singleRun('echo "${{ env.LABEL }}"', 'env:\n  LABEL: ${{ inputs.label }}'),
      'env label',
    ),
  ).not.toEqual([])
  expect(
    expressionHits(
      singleRun('echo "${{ env.TAG }}"', 'env:\n  TAG: ${{ github.ref_name }}'),
      'env tag',
    ),
  ).not.toEqual([])
  expect(
    expressionHits(
      singleRun(
        'echo "${{ matrix.platform }}"',
        'strategy:\n  matrix:\n    platform: ${{ github.head_ref }}',
      ),
      'dynamic matrix',
    ),
  ).not.toEqual([])

  const laundered = `name: fixture
on: push
jobs:
  demo:
    steps:
      - name: leak
        id: leak
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "value=$TITLE" >> "$GITHUB_OUTPUT"
      - name: sink
        run: echo "\${{ steps.leak.outputs.value }}"
`
  expect(expressionHits(laundered, 'step output')).not.toEqual([])

  const poisoned = `name: fixture
on: push
jobs:
  demo:
    steps:
      - name: poison
        env:
          TITLE: \${{ github.head_ref }}
        run: echo "EVIL=$TITLE" >> "$GITHUB_ENV"
      - name: sink
        run: echo "\${{ env.EVIL }}"
`
  expect(expressionHits(poisoned, 'github env')).not.toEqual([])

  const forwarded = `name: fixture
on: push
jobs:
  first:
    outputs:
      title: \${{ github.event.issue.title }}
    steps:
      - name: produce
        run: echo ok
  second:
    needs: first
    steps:
      - name: sink
        run: echo "\${{ needs.first.outputs.title }}"
`
  expect(expressionHits(forwarded, 'needs output')).not.toEqual([])

  const allowed = [
    'echo "${{ github.sha }}"',
    'echo "${{ github.event_name }}"',
    'echo "${{ github.event.pull_request.number }}"',
    'echo "${{ github.repository }}"',
    'echo "${{ github.ref_type }}"',
    'echo "${{ runner.os }}"',
    'echo "${{ matrix.platform }}"',
    'echo "$LABEL"',
    'echo ok',
  ]
  for (const script of allowed) {
    const prelude = script.includes('matrix')
      ? 'strategy:\n  matrix:\n    platform: [linux, windows, macos]'
      : 'env:\n  LABEL: ${{ inputs.label }}'
    expect(expressionHits(singleRun(script, prelude), script), script).toEqual([])
  }

  expect(
    expressionHits(
      singleRun(
        'echo "${{ env.PLATFORM }}"',
        'env:\n  PLATFORM: ${{ matrix.platform }}\nstrategy:\n  matrix:\n    platform: [linux]',
      ),
      'static platform env',
    ),
  ).toEqual([])

  const outsideRun = `name: fixture
on: push
concurrency:
  group: release-\${{ github.ref_name }}
jobs:
  demo:
    env:
      TAG: \${{ github.ref_name }}
      LABEL: \${{ inputs.label }}
    steps:
      - name: probe
        env:
          PLATFORM: \${{ matrix.platform }}
        run: echo "$TAG $LABEL $PLATFORM"
      - uses: example/action@v1
        with:
          title: \${{ github.event.pull_request.title }}
`
  expect(expressionHits(outsideRun, 'outside run')).toEqual([])

  const constantOutput = `name: fixture
on: push
env:
  LABEL: \${{ inputs.label }}
jobs:
  demo:
    steps:
      - name: version
        id: version
        run: echo "value=1.2.3" >> "$GITHUB_OUTPUT"
      - name: sink
        run: echo "\${{ steps.version.outputs.value }}"
`
  expect(expressionHits(constantOutput, 'constant output')).toEqual([])
})

function loadWorkflows(): { file: string; yaml: string }[] {
  return readdirSync(WORKFLOWS_DIRECTORY)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .toSorted()
    .map((file) => ({
      file,
      yaml: isKnownWorkflow(file)
        ? readWorkflowYaml(file)
        : readFileSync(resolve(WORKFLOWS_DIRECTORY, file), 'utf8'),
    }))
}

function isKnownWorkflow(file: string): file is WorkflowName {
  return (KNOWN_WORKFLOWS as readonly string[]).includes(file)
}

function triggerNamesOf(onYaml: string): string[] {
  return forbiddenTriggers(`name: fixture\n${onYaml}\njobs: {}\n`, 'fixture').map(
    (hit) => hit.trigger,
  )
}

function forbiddenTriggers(yaml: string, file: string): TriggerHit[] {
  const hits: TriggerHit[] = []
  for (const workflow of workflowMappings(yaml)) {
    for (const trigger of triggerNames(onClause(workflow))) {
      if (FORBIDDEN_TRIGGERS.has(trigger)) hits.push({ file, trigger })
    }
  }
  return hits
}

function expressionHits(yaml: string, file: string): ExpressionHit[] {
  const hits: ExpressionHit[] = []
  for (const workflow of workflowMappings(yaml)) {
    if (!isRecord(workflow.jobs)) continue
    const jobs = prepareJobs(workflow)
    const taintedJobs = taintedJobIds(jobs)
    for (const job of jobs) {
      let envPoisoned = false
      for (const step of job.steps) {
        if (step.script.length > 0) {
          const script =
            step.name === undefined ? step.script : extractRunScript(yaml, step.name, job.id)
          if (step.name !== undefined && script !== step.script) {
            throw new Error(`run script mismatch for ${file} job ${job.id} step ${step.name}`)
          }
          const scope = scopeFor(step.env, job, taintedJobs, envPoisoned)
          for (const entry of expressionBodies(script)) {
            if (entry.closed && !expressionControllable(entry.body, scope)) continue
            hits.push({
              file,
              job: job.id,
              step: step.name ?? `steps[${step.index}]`,
              expression: entry.closed ? entry.body.trim() : `${entry.body.trim()} (unclosed)`,
            })
          }
        }
        if (step.poisonsEnv) envPoisoned = true
      }
    }
  }
  return hits
}

function prepareJobs(workflow: Record<string, unknown>): PreparedJob[] {
  const jobs = workflow.jobs
  if (!isRecord(jobs)) return []
  const workflowEnv = readEnv(workflow.env)
  const prepared: PreparedJob[] = []
  for (const [id, jobValue] of Object.entries(jobs)) {
    if (!isRecord(jobValue)) continue
    const jobEnv = mergeEnv(workflowEnv, readEnv(jobValue.env))
    const matrixTainted = stringsOf(jobValue.strategy).some((value) =>
      textControllable(
        value,
        bareScope(taintedKeys(jobEnv, false, EMPTY_NAMES, EMPTY_NAMES, false), false),
      ),
    )
    const steps = prepareSteps(jobValue.steps, jobEnv, matrixTainted)
    const outputValues = isRecord(jobValue.outputs)
      ? Object.values(jobValue.outputs).filter(
          (value): value is string => typeof value === 'string',
        )
      : []
    const taintedStepIds = new Set(
      steps.flatMap((step) => (step.outputsTainted && step.id ? [step.id] : [])),
    )
    prepared.push({ id, matrixTainted, steps, outputValues, taintedStepIds })
  }
  return prepared
}

function prepareSteps(
  value: unknown,
  jobEnv: ReadonlyMap<string, string>,
  matrixTainted: boolean,
): PreparedStep[] {
  if (!Array.isArray(value)) return []
  const steps: PreparedStep[] = []
  for (const [index, stepValue] of value.entries()) {
    if (!isRecord(stepValue)) continue
    const script = typeof stepValue.run === 'string' ? stepValue.run : ''
    steps.push({
      index,
      id: typeof stepValue.id === 'string' ? stepValue.id : undefined,
      name: typeof stepValue.name === 'string' ? stepValue.name : undefined,
      script,
      env: mergeEnv(jobEnv, readEnv(stepValue.env)),
      outputsTainted: false,
      poisonsEnv: false,
    })
  }

  const tainted = new Set<number>()
  let changed = true
  while (changed) {
    changed = false
    const taintedIds = new Set(
      steps.flatMap((step, index) => (tainted.has(index) && step.id ? [step.id] : [])),
    )
    for (const [index, step] of steps.entries()) {
      if (tainted.has(index)) continue
      if (!step.script.includes('GITHUB_OUTPUT') && !step.script.includes('GITHUB_ENV')) continue
      const taintedEnv = taintedKeys(step.env, matrixTainted, taintedIds, EMPTY_NAMES, false)
      const scope = bareScope(taintedEnv, matrixTainted, taintedIds)
      const carries =
        textControllable(step.script, scope) || shellUsesTainted(step.script, taintedEnv)
      if (!carries) continue
      tainted.add(index)
      changed = true
    }
  }

  return steps.map((step, index) => ({
    ...step,
    outputsTainted: tainted.has(index) && step.script.includes('GITHUB_OUTPUT'),
    poisonsEnv: tainted.has(index) && step.script.includes('GITHUB_ENV'),
  }))
}

function taintedJobIds(jobs: readonly PreparedJob[]): Set<string> {
  const tainted = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const job of jobs) {
      if (tainted.has(job.id)) continue
      const scope = bareScope(
        taintedKeys(new Map(), job.matrixTainted, job.taintedStepIds, tainted, false),
        job.matrixTainted,
        job.taintedStepIds,
        tainted,
      )
      if (!job.outputValues.some((value) => textControllable(value, scope))) continue
      tainted.add(job.id)
      changed = true
    }
  }
  return tainted
}

function scopeFor(
  env: ReadonlyMap<string, string>,
  job: PreparedJob,
  taintedJobs: ReadonlySet<string>,
  envPoisoned: boolean,
): AnalysisScope {
  const taintedEnv = taintedKeys(
    env,
    job.matrixTainted,
    job.taintedStepIds,
    taintedJobs,
    envPoisoned,
  )
  return {
    taintedEnv,
    matrixTainted: job.matrixTainted,
    taintedSteps: job.taintedStepIds,
    taintedJobs,
    envPoisoned,
  }
}

function bareScope(
  taintedEnv: ReadonlySet<string>,
  matrixTainted: boolean,
  taintedSteps: ReadonlySet<string> = EMPTY_NAMES,
  taintedJobs: ReadonlySet<string> = EMPTY_NAMES,
  envPoisoned = false,
): AnalysisScope {
  return { taintedEnv, matrixTainted, taintedSteps, taintedJobs, envPoisoned }
}

function taintedKeys(
  env: ReadonlyMap<string, string>,
  matrixTainted: boolean,
  taintedSteps: ReadonlySet<string>,
  taintedJobs: ReadonlySet<string>,
  envPoisoned: boolean,
): Set<string> {
  const tainted = envPoisoned ? new Set(env.keys()) : new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    const scope = bareScope(tainted, matrixTainted, taintedSteps, taintedJobs, envPoisoned)
    for (const [key, value] of env) {
      if (tainted.has(key) || !textControllable(value, scope)) continue
      tainted.add(key)
      changed = true
    }
  }
  return tainted
}

function textControllable(text: string, scope: AnalysisScope): boolean {
  return expressionBodies(text).some(
    (entry) => !entry.closed || expressionControllable(entry.body, scope),
  )
}

function expressionControllable(expression: string, scope: AnalysisScope): boolean {
  if (hasDynamicIndex(expression) && /\b(?:github|inputs|env|needs|steps)\b/.test(expression)) {
    return true
  }
  return pathsIn(expression).some((path) => pathControllable(path, scope))
}

function pathControllable(path: string, scope: AnalysisScope): boolean {
  if (CONTROLLABLE_GITHUB.has(path)) return true
  if (path === 'inputs' || path.startsWith('inputs.')) return true
  if (path === 'env' || path.startsWith('env.')) {
    if (scope.envPoisoned) return true
    if (path === 'env') return scope.taintedEnv.size > 0
    const name = path.slice('env.'.length).split('.')[0] ?? ''
    return scope.taintedEnv.has(name)
  }
  if (path.startsWith('github.event.')) {
    const leaf = path.slice(path.lastIndexOf('.') + 1)
    if (leaf === '*') return true
    if (SAFE_EVENT_LEAVES.has(leaf) || leaf.endsWith('_url')) return false
    return true
  }
  if (path.startsWith('steps.')) {
    const id = path.split('.')[1] ?? ''
    return scope.taintedSteps.has(id)
  }
  if (path.startsWith('needs.')) {
    const [, jobId, field] = path.split('.')
    return field === 'outputs' && jobId !== undefined && scope.taintedJobs.has(jobId)
  }
  if (scope.matrixTainted && (path === 'matrix' || path.startsWith('matrix.'))) return true
  return false
}

function pathsIn(expression: string): string[] {
  const pattern =
    /\b(?:github|inputs|env|matrix|needs|steps|vars|secrets|runner)(?:\.[A-Za-z_*][\w-]*)*/g
  return [...normalizeExpression(expression).matchAll(pattern)].map((match) => match[0])
}

function literalIndexPattern(): RegExp {
  return /\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*\]/g
}

function normalizeExpression(expression: string): string {
  return expression
    .replaceAll(
      literalIndexPattern(),
      (_match, _quote: string, key: string) => `.${unescapeKey(key)}`,
    )
    .replaceAll(/\[\s*(?:\d+|\*)\s*\]/g, '.*')
    .replaceAll(/'(?:\\'|[^'])*'|"(?:\\"|[^"])*"/g, '""')
    .replaceAll(/\s*\.\s*/g, '.')
}

function unescapeKey(key: string): string {
  return key.replaceAll(/\\(['"\\])/g, '$1')
}

function hasDynamicIndex(expression: string): boolean {
  const withoutLiterals = expression
    .replaceAll(literalIndexPattern(), '')
    .replaceAll(/\[\s*(?:\d+|\*)\s*\]/g, '')
    .replaceAll(/'(?:\\'|[^'])*'|"(?:\\"|[^"])*"/g, '')
  return withoutLiterals.includes('[') || withoutLiterals.includes(']')
}

function expressionBodies(script: string): { body: string; closed: boolean }[] {
  const bodies: { body: string; closed: boolean }[] = []
  let cursor = 0
  while (cursor < script.length) {
    const start = script.indexOf('${{', cursor)
    if (start === -1) break
    const end = script.indexOf('}}', start + 3)
    if (end === -1) {
      bodies.push({ body: script.slice(start + 3), closed: false })
      break
    }
    bodies.push({ body: script.slice(start + 3, end), closed: true })
    cursor = end + 2
  }
  return bodies
}

function shellUsesTainted(script: string, tainted: ReadonlySet<string>): boolean {
  for (const name of tainted) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue
    const pattern = new RegExp(
      String.raw`(?:^|[^A-Za-z0-9_])\$(?:\{${name}(?![A-Za-z0-9_])|${name}(?![A-Za-z0-9_]))`,
    )
    if (pattern.test(script)) return true
  }
  return false
}

function onClause(workflow: Record<string, unknown>): unknown {
  if ('on' in workflow) return workflow.on
  if ('true' in workflow) return workflow.true
  return undefined
}

function triggerNames(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim().toLowerCase()]
  if (Array.isArray(value)) return value.flatMap((entry) => triggerNames(entry))
  if (isRecord(value)) return Object.keys(value).map((name) => name.trim().toLowerCase())
  return []
}

function workflowMappings(yaml: string): Record<string, unknown>[] {
  const mappings: Record<string, unknown>[] = []
  for (const doc of parseAllDocuments(yaml)) {
    if (doc.errors.length > 0) {
      throw new Error(doc.errors.map((error) => error.message).join('\n'))
    }
    const value: unknown = doc.toJS()
    if (value === null || value === undefined) continue
    if (!isRecord(value)) throw new Error('Workflow document is not a mapping')
    mappings.push(value)
  }
  return mappings
}

function readEnv(value: unknown): Map<string, string> {
  const env = new Map<string, string>()
  if (!isRecord(value)) return env
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') env.set(key, entry)
    else if (typeof entry === 'number' || typeof entry === 'boolean') env.set(key, String(entry))
  }
  return env
}

function mergeEnv(
  base: ReadonlyMap<string, string>,
  overlay: ReadonlyMap<string, string>,
): Map<string, string> {
  return new Map([...base, ...overlay])
}

function stringsOf(value: unknown): string[] {
  const strings: string[] = []
  collectStrings(value, strings)
  return strings
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out)
    return
  }
  if (!isRecord(value)) return
  for (const entry of Object.values(value)) collectStrings(entry, out)
}

function singleRun(script: string, prelude = ''): string {
  const head = prelude.length === 0 ? '' : `${indent(prelude, 4)}\n`
  return `name: fixture
on: push
jobs:
  demo:
${head}    steps:
      - name: probe
        run: |
${indent(script, 10)}
`
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '' : `${pad}${line}`))
    .join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
