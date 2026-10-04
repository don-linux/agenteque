import { describe, expect, it } from 'vitest'
import { gitCandidatePaths, overrideCandidate } from '../../src/shared/git-search'
import {
  isSupportedGitVersion,
  parseDecorate,
  parseForEachRef,
  parseGitLog,
  parseGitVersion,
  parseLeftRight,
} from '../../src/shared/git-text'
import { escapesRoot, relativeParts } from '../../src/shared/workspace-path'

describe('parseGitVersion', () => {
  it('accepts a release and vendor suffixes', () => {
    expect(parseGitVersion('git version 2.43.0\n')).toMatchObject({ major: 2, minor: 43, patch: 0 })
    const windows = parseGitVersion('git version 2.43.0.windows.1')
    expect(windows && isSupportedGitVersion(windows)).toBe(true)
    const apple = parseGitVersion('git version 2.39.5 (Apple Git-154)\n')
    expect(apple && isSupportedGitVersion(apple)).toBe(true)
  })

  it('rejects a prerelease and anything older than 2.15', () => {
    const rc = parseGitVersion('git version 2.15.0-rc0')
    expect(rc && isSupportedGitVersion(rc)).toBe(false)
    const old = parseGitVersion('git version 2.14.3')
    expect(old && isSupportedGitVersion(old)).toBe(false)
    expect(parseGitVersion('git version ')).toBeNull()
    expect(parseGitVersion('git version 2..1')).toBeNull()
  })
})

describe('git candidates', () => {
  it('skips relative PATH entries and git.cmd', () => {
    const paths = gitCandidatePaths({
      platform: 'win32',
      overridePath: undefined,
      pathVar: '.;"C:\\Program Files\\Git\\cmd"',
      env: { ProgramFiles: 'C:\\Program Files' },
    })
    expect(paths.some((file) => file.endsWith('git.cmd') || file.endsWith('git.bat'))).toBe(false)
    expect(paths).toContain('C:\\Program Files\\Git\\cmd\\git.exe')
    expect(paths.some((file) => file.startsWith('.'))).toBe(false)
  })

  it('launches a bare override as a relative file, not a PATH lookup', () => {
    expect(overrideCandidate('git', 'linux')).toEqual({ spawnPath: './git', reportedPath: 'git' })
  })
})

describe('git log text', () => {
  it('parses null-separated commits, decorations and ahead/behind', () => {
    const stdout =
      [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaa',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'HEAD -> refs/heads/main, refs/remotes/origin/main',
        'Rise',
      ].join('\0') + '\0'
    const [commit] = parseGitLog(stdout)
    expect(commit?.short).toBe('aaaaaaaaaaaa')
    expect(commit?.parents).toEqual(['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'])
    expect(commit?.refs).toEqual(['main', 'origin/main'])
    expect(parseDecorate('tag: v1, HEAD')).toEqual(['HEAD'])
    expect(parseLeftRight('2\t3\n')).toEqual({ ahead: 2, behind: 3 })
    expect(parseForEachRef('abc\0main\0*\n')).toEqual([
      { name: 'main', hash: 'abc', current: true },
    ])
  })
})

describe('relative workspace paths', () => {
  it('rejects absolute paths, parents and backslashes', () => {
    expect(relativeParts('notas/ideas.md')).toEqual(['notas', 'ideas.md'])
    expect(relativeParts('../secrets.md')).toBeNull()
    expect(relativeParts('/etc/passwd')).toBeNull()
    expect(relativeParts('a\\b.md')).toBeNull()
    expect(escapesRoot('docs/a.md')).toBe(false)
    expect(escapesRoot('..')).toBe(true)
    expect(escapesRoot('../outside')).toBe(true)
    expect(escapesRoot('D:/other')).toBe(true)
  })
})
