import { describe, expect, it } from 'vitest'
import { GIT_CLIENT_MISSING_MESSAGE, GIT_NOT_REPOSITORY_MESSAGE } from '../../src/shared/messages'
import {
  gitFooterButtonTitle,
  gitFooterStateFromError,
  gitFooterStateFromSummary,
  gitFooterTitle,
  repoDisplayName,
} from '../../src/renderer/src/lib/git-footer'

describe('repoDisplayName', () => {
  it('uses the repository root, including a nested folder and Windows separators', () => {
    expect(repoDisplayName('/home/ana/proyecto')).toBe('proyecto')
    expect(repoDisplayName('/home/ana/proyecto/')).toBe('proyecto')
    expect(repoDisplayName('C:\\repos\\demo\\')).toBe('demo')
    expect(repoDisplayName('')).toBe('')
  })
})

describe('git footer title', () => {
  it('uses the fixed messages when git or the repository is missing', () => {
    const unavailable = gitFooterStateFromSummary({
      probe: { available: false },
      error: GIT_CLIENT_MISSING_MESSAGE,
    })
    const empty = gitFooterStateFromSummary({ probe: { available: true } })
    expect(gitFooterTitle(unavailable)).toBe(GIT_CLIENT_MISSING_MESSAGE)
    expect(gitFooterTitle(empty)).toBe(GIT_NOT_REPOSITORY_MESSAGE)
    expect(gitFooterTitle(gitFooterStateFromError())).toBe('Git no responde')
  })

  it('names the repo and the branch, or a detached HEAD', () => {
    const branch = gitFooterStateFromSummary({
      probe: { available: true },
      repository: { toplevel: '/work/agenteque', branch: 'main', detached: false },
    })
    const detached = gitFooterStateFromSummary({
      probe: { available: true },
      repository: { toplevel: '/work/agenteque', detached: true },
    })
    expect(gitFooterTitle(branch)).toBe('agenteque · main')
    expect(gitFooterTitle(detached)).toBe('agenteque · HEAD separado')
    expect(gitFooterButtonTitle(branch, 'Ctrl+G')).toBe('agenteque · main (Ctrl+G)')
    expect(gitFooterTitle({ kind: 'loading' })).toBe('Git')
  })

  it('treats a failed query as an error, not as a missing repository', () => {
    const failed = gitFooterStateFromSummary({
      probe: { available: true },
      error: 'Git no responde',
    })
    expect(failed).toEqual({ kind: 'error' })
  })
})
