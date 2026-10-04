import { SHELL_MISSING_MESSAGE } from '../../../shared/messages'

export { SHELL_MISSING_MESSAGE }

class ShellStatus {
  /** `null` hasta que el proceso principal responde. Los tests no preguntan. */
  available = $state<boolean | null>(null)

  async load(): Promise<void> {
    if (typeof window.api.shellStatus !== 'function') return
    const status = await window.api.shellStatus()
    this.available = status.available
  }
}

export const shellStatus = new ShellStatus()
