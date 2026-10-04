import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readGitGraph, readGitRefs } from '../../src/main/git-host'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'agenteque-git-'))
  roots.push(root)
  return root
}

function git(root: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'agenteque',
      GIT_AUTHOR_EMAIL: 'test@agenteque.local',
      GIT_COMMITTER_NAME: 'agenteque',
      GIT_COMMITTER_EMAIL: 'test@agenteque.local',
    },
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('git host', () => {
  it('reads the current branch, parents and a comparison', async () => {
    const root = tempRoot()
    git(root, ['init', '-b', 'main'])
    writeFileSync(join(root, 'README.md'), 'a\n')
    git(root, ['add', 'README.md'])
    git(root, ['commit', '-m', 'first'])
    git(root, ['checkout', '-b', 'idea'])
    writeFileSync(join(root, 'README.md'), 'b\n')
    git(root, ['commit', '-am', 'second'])

    const refs = await readGitRefs(root)
    expect(refs.probe.available).toBe(true)
    expect(refs.repository?.current).toBe('idea')
    expect(refs.repository?.branches.map((branch) => branch.name).toSorted()).toEqual([
      'idea',
      'main',
    ])

    const graph = await readGitGraph(root, ['main'])
    expect(graph.repository?.commits[0]?.subject).toBe('second')
    expect(graph.repository?.commits[0]?.parents).toHaveLength(1)
    expect(graph.repository?.comparisons[0]?.name).toBe('main')
    expect(graph.repository?.comparisons[0]?.mergeBase).toBeTruthy()
  })

  it('can cross an IPC boundary for this repository', async () => {
    const refs = await readGitRefs('/workspace')
    expect(() => structuredClone(refs)).not.toThrow()
    const graph = await readGitGraph('/workspace', ['main'])
    expect(() => structuredClone(graph)).not.toThrow()
    expect(graph.repository?.commits.length).toBeGreaterThan(0)
  })
  it('does not treat a plain folder as a missing git client', async () => {
    const root = tempRoot()
    const refs = await readGitRefs(root)
    expect(refs.probe.available).toBe(true)
    expect(refs.repository).toBeUndefined()
  })
})
