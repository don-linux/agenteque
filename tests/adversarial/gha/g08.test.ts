import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWorkflowYaml, runWorkflowStep, type WorkflowStepResult } from '../helpers/workflow'

/**
 * G08. release.yml "Tagged commit is on main" must fetch origin's main and
 * require the tagged commit to be an ancestor of that ref. An annotated tag is
 * peeled first. A merge is allowed only when the merge commit itself is on
 * origin/main; a commit that merely contains main is still off main.
 *
 * Hostile repos keep a local `main`, or a stale `origin/main`, that still
 * points at the tagged commit after the remote branch has moved on.
 */
const RELEASE = readWorkflowYaml('release.yml')
const STEP = 'Tagged commit is on main'
const TAG = 'v1.2.3'

describe('ADV-G08', () => {
  it('rejects a release tag whose commit is not on main', async () => {
    const onMain = await runRelease((repo) => {
      commit(repo, 'base')
      commit(repo, 'second')
      commit(repo, 'third')
      publishMain(repo)
      lightweight(repo, 'HEAD~1')
      expectTag(repo, {
        tagType: 'commit',
        parents: 1,
        onOriginMain: true,
        containsOriginMain: false,
      })
    })
    expect(onMain.exitCode).toBe(0)
    expectTag(onMain.dir, { onOriginMain: true, containsOriginMain: false })
    expectAccepted(onMain)
    await onMain.cleanup()

    const localOnly = await runRelease((repo) => {
      commit(repo, 'base')
      publishMain(repo)
      commit(repo, 'side')
      lightweight(repo, 'HEAD')
      expectTag(repo, {
        tagType: 'commit',
        parents: 1,
        onOriginMain: false,
        containsOriginMain: true,
        onLocalMain: true,
      })
    })
    expect(localOnly.exitCode).toBe(1)
    expectTag(localOnly.dir, { onOriginMain: false, onLocalMain: true })
    expectRejected(localOnly)
    await localOnly.cleanup()

    // Remote main was rewound. The remote-tracking ref still names the tag
    // until `git fetch origin main` repairs it.
    const stale = await runRelease((repo) => {
      commit(repo, 'base')
      commit(repo, 'tagged')
      publishMain(repo)
      lightweight(repo, 'HEAD')
      git(repo, ['push', '--force', 'origin', 'HEAD~1:main'])
      git(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
      const tagged = git(repo, ['rev-parse', `${TAG}^{commit}`])
      expect(isAncestor(repo, tagged, remoteMain(repo))).toBe(false)
      expectTag(repo, {
        tagType: 'commit',
        parents: 1,
        onOriginMain: true,
        onLocalMain: true,
      })
    })
    expect(stale.exitCode).toBe(1)
    expectTag(stale.dir, {
      onOriginMain: false,
      containsOriginMain: true,
      onLocalMain: true,
    })
    expectRejected(stale)
    await stale.cleanup()
  })

  it('peels an annotated tag and requires that commit to be on main', async () => {
    const onMain = await runRelease((repo) => {
      commit(repo, 'base')
      commit(repo, 'second')
      commit(repo, 'third')
      publishMain(repo)
      annotate(repo, 'HEAD~1')
      expectTag(repo, {
        tagType: 'tag',
        parents: 1,
        onOriginMain: true,
        containsOriginMain: false,
      })
    })
    expect(onMain.exitCode).toBe(0)
    expectTag(onMain.dir, { tagType: 'tag', onOriginMain: true })
    expectAccepted(onMain)
    await onMain.cleanup()

    const offMain = await runRelease((repo) => {
      commit(repo, 'base')
      publishMain(repo)
      commit(repo, 'side')
      annotate(repo, 'HEAD')
      expectTag(repo, {
        tagType: 'tag',
        parents: 1,
        onOriginMain: false,
        containsOriginMain: true,
        onLocalMain: true,
      })
    })
    expect(offMain.exitCode).toBe(1)
    expectTag(offMain.dir, { tagType: 'tag', onOriginMain: false, onLocalMain: true })
    expectRejected(offMain)
    await offMain.cleanup()
  })

  it('accepts a merge commit on main and rejects one that is not', async () => {
    const onMain = await runRelease((repo) => {
      commit(repo, 'base')
      git(repo, ['checkout', '-b', 'feature'])
      commit(repo, 'feature')
      git(repo, ['checkout', 'main'])
      git(repo, ['merge', '--no-ff', 'feature', '-m', 'merge feature'])
      commit(repo, 'after')
      publishMain(repo)
      annotate(repo, 'HEAD~1')
      expectTag(repo, {
        tagType: 'tag',
        parents: 2,
        onOriginMain: true,
        containsOriginMain: false,
      })
    })
    expect(onMain.exitCode).toBe(0)
    expectTag(onMain.dir, { parents: 2, onOriginMain: true, containsOriginMain: false })
    expectAccepted(onMain)
    await onMain.cleanup()

    const offMain = await runRelease((repo) => {
      commit(repo, 'base')
      publishMain(repo)
      git(repo, ['checkout', '-b', 'feature'])
      commit(repo, 'feature')
      git(repo, ['checkout', 'main'])
      git(repo, ['merge', '--no-ff', 'feature', '-m', 'merge feature'])
      annotate(repo, 'HEAD')
      expectTag(repo, {
        tagType: 'tag',
        parents: 2,
        onOriginMain: false,
        containsOriginMain: true,
        onLocalMain: true,
      })
    })
    expect(offMain.exitCode).toBe(1)
    expectTag(offMain.dir, {
      parents: 2,
      onOriginMain: false,
      containsOriginMain: true,
      onLocalMain: true,
    })
    expectRejected(offMain)
    await offMain.cleanup()
  })
})

async function runRelease(setup: (repo: string) => void): Promise<WorkflowStepResult> {
  return runWorkflowStep({
    yaml: RELEASE,
    step: STEP,
    job: 'verify',
    env: { TAG },
    prepare(dir) {
      initRepo(dir)
      setup(dir)
    },
  })
}

function expectAccepted(result: WorkflowStepResult): void {
  expect(result.stdout).not.toContain('::error::')
  expect(result.stderr).not.toContain('fatal:')
}

function expectRejected(result: WorkflowStepResult): void {
  expect(result.stdout).toContain(`::error::${TAG} points to a commit that is not on main`)
}

interface TagFacts {
  tagType: string
  parents: number
  /** Tagged commit is reachable from origin/main, including equality. */
  onOriginMain: boolean
  /** origin/main is reachable from the tagged commit. */
  containsOriginMain: boolean
  /** Tagged commit is reachable from the local main branch. */
  onLocalMain: boolean
}

function expectTag(repo: string, facts: Partial<TagFacts>): void {
  expect(tagFacts(repo)).toMatchObject(facts)
}

function tagFacts(repo: string): TagFacts {
  const tagged = git(repo, ['rev-parse', `${TAG}^{commit}`])
  const listed = git(repo, ['rev-list', '--parents', '-n', '1', tagged])
  return {
    tagType: git(repo, ['cat-file', '-t', TAG]),
    parents: listed.split(' ').length - 1,
    onOriginMain: isAncestor(repo, tagged, 'origin/main'),
    containsOriginMain: isAncestor(repo, 'origin/main', tagged),
    onLocalMain: isAncestor(repo, tagged, 'main'),
  }
}

function initRepo(repo: string): void {
  const remote = resolve(repo, 'remote.git')
  git(repo, ['init', '--bare', remote])
  git(repo, ['init', '-b', 'main'])
  git(repo, ['remote', 'add', 'origin', remote])
  expect(git(repo, ['remote', 'get-url', 'origin'])).toBe(remote)
  expect(git(repo, ['config', '--get', 'remote.origin.fetch'])).toBe(
    '+refs/heads/*:refs/remotes/origin/*',
  )
}

function publishMain(repo: string): void {
  git(repo, ['push', 'origin', 'main'])
}

function commit(repo: string, message: string): void {
  writeFileSync(resolve(repo, 'README'), `${message}\n`)
  git(repo, ['add', 'README'])
  git(repo, ['commit', '-m', message])
}

function lightweight(repo: string, rev: string): void {
  git(repo, ['tag', TAG, rev])
}

function annotate(repo: string, rev: string): void {
  git(repo, ['tag', '-a', TAG, '-m', 'agenteque 1.2.3', rev])
}

function remoteMain(repo: string): string {
  const line = git(repo, ['ls-remote', 'origin', 'refs/heads/main'])
  const sha = line.split('\t')[0]
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`unexpected ls-remote output: ${line}`)
  }
  return sha
}

function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: repo,
    encoding: 'utf8',
  })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(
    `git merge-base --is-ancestor ${ancestor} ${descendant} failed (${result.status}): ${result.stderr || result.error?.message || ''}`,
  )
}

const GIT_CONFIG = [
  '-c',
  'user.name=ADV-G08',
  '-c',
  'user.email=g08@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'tag.gpgSign=false',
  '-c',
  'core.hooksPath=/dev/null',
] as const

function git(repo: string, args: readonly string[]): string {
  const result = spawnSync('git', [...GIT_CONFIG, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (${result.status}): ${result.stderr || result.error?.message || ''}`,
    )
  }
  return result.stdout.trim()
}
