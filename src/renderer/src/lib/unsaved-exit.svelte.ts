export type UnsavedExitMode = 'leave' | 'tab' | 'save'

class UnsavedExit {
  open = $state(false)
  mode = $state<UnsavedExitMode>('leave')
  #pending: Promise<boolean> | null = null
  #resolve: ((ok: boolean) => void) | null = null

  request(mode: UnsavedExitMode = 'leave'): Promise<boolean> {
    if (this.#pending) return this.#pending

    this.mode = mode
    this.open = true
    this.#pending = new Promise((resolve) => {
      this.#resolve = resolve
    })

    return this.#pending
  }

  confirm = (): void => {
    this.#settle(true)
  }

  cancel = (): void => {
    this.#settle(false)
  }

  #settle(ok: boolean): void {
    const resolve = this.#resolve
    this.open = false
    this.#pending = null
    this.#resolve = null
    resolve?.(ok)
  }
}

export const unsavedExit = new UnsavedExit()
