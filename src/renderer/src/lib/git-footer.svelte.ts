import {
  gitFooterStateFromError,
  gitFooterStateFromSummary,
  type GitFooterState,
} from './git-footer'

class GitFooterView {
  state = $state.raw<GitFooterState>({ kind: 'loading' })
  #root: string | null = null
  #gen = 0

  async setRoot(root: string | null): Promise<void> {
    if (root === this.#root) return
    this.#root = root
    this.state = { kind: 'loading' }
    await this.#load()
  }

  refresh(): Promise<void> {
    return this.#load()
  }

  async #load(): Promise<void> {
    const root = this.#root
    const gen = ++this.#gen
    if (!root || typeof window === 'undefined' || typeof window.api?.gitSummary !== 'function') {
      if (gen === this.#gen) this.state = { kind: 'empty' }
      return
    }

    try {
      const summary = await window.api.gitSummary(root)
      if (gen !== this.#gen) return
      this.state = gitFooterStateFromSummary(summary)
    } catch {
      if (gen !== this.#gen) return
      this.state = gitFooterStateFromError()
    }
  }
}

export const gitFooter = new GitFooterView()
