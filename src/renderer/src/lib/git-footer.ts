import { GIT_CLIENT_MISSING_MESSAGE, GIT_NOT_REPOSITORY_MESSAGE } from '../../../shared/messages'
import type { GitSummaryResult } from '../../../shared/ipc'

export type GitFooterState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'empty' }
  | { kind: 'error' }
  | { kind: 'repo'; name: string; branch?: string; detached: boolean }

/** Último segmento del toplevel, con separadores de POSIX y de Windows. */
export function repoDisplayName(toplevel: string): string {
  const trimmed = toplevel.trim().replace(/[/\\]+$/, '')
  const parts = trimmed.split(/[/\\]/).filter((part) => part.length > 0 && part !== '.')
  return parts.at(-1) ?? ''
}

export function gitFooterStateFromSummary(summary: GitSummaryResult): GitFooterState {
  if (!summary.probe.available) return { kind: 'unavailable' }

  const repository = summary.repository
  if (!repository) return summary.error ? { kind: 'error' } : { kind: 'empty' }

  const name = repoDisplayName(repository.toplevel)
  if (name === '') return { kind: 'empty' }
  if (repository.detached || !repository.branch?.trim()) {
    return { kind: 'repo', name, detached: true }
  }
  return { kind: 'repo', name, branch: repository.branch.trim(), detached: false }
}

export function gitFooterStateFromError(): GitFooterState {
  return { kind: 'error' }
}

export function gitFooterTitle(state: GitFooterState): string {
  switch (state.kind) {
    case 'loading':
      return 'Git'
    case 'unavailable':
      return GIT_CLIENT_MISSING_MESSAGE
    case 'empty':
      return GIT_NOT_REPOSITORY_MESSAGE
    case 'error':
      return 'Git no responde'
    case 'repo':
      if (state.detached) return `${state.name} · HEAD separado`
      if (state.branch) return `${state.name} · ${state.branch}`
      return state.name
  }
}

export function gitFooterButtonTitle(state: GitFooterState, shortcut = 'Ctrl+G'): string {
  return `${gitFooterTitle(state)} (${shortcut})`
}
