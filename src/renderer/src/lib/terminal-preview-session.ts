import { demoTerminal } from '$lib/backend/demo-terminal'
import type { TerminalBackend } from '$lib/backend/types'
import { PREVIEW_PTY_ID } from '$lib/pty'

export { PREVIEW_PTY_ID }

function messageFrom(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * La vista previa de la configuración no tiene PTY propio: usa el mismo puerto
 * de terminal que el workspace, así que muestra contenido de ejemplo con la
 * fuente y el tema del borrador.
 */
export class TerminalPreviewSession {
  alive = false
  error: string | null = null

  #backend: TerminalBackend = demoTerminal
  #spawning = false
  #gen = 0
  #onData: ((chunk: string) => void) | null = null

  attachWriter(write: (chunk: string) => void): void {
    this.#onData = write
  }

  detachWriter(): void {
    this.#onData = null
  }

  async spawn(cols: number, rows: number): Promise<void> {
    if (this.alive || this.#spawning) return

    this.#spawning = true
    this.error = null
    const gen = ++this.#gen

    try {
      await this.#backend.spawn({
        id: PREVIEW_PTY_ID,
        cwd: '~',
        cols,
        rows,
        onData: (chunk) => this.#onData?.(chunk),
        onExit: () => {
          this.alive = false
        },
      })

      if (gen !== this.#gen) {
        try {
          await this.#backend.kill(PREVIEW_PTY_ID)
        } catch {
          // La sesión puede haberse ido ya.
        }
        return
      }

      this.alive = true
    } catch (error) {
      this.alive = false
      this.error = messageFrom(error)
    } finally {
      this.#spawning = false
    }
  }

  async resize(cols: number, rows: number): Promise<void> {
    if (!this.alive) return

    try {
      await this.#backend.resize(PREVIEW_PTY_ID, cols, rows)
    } catch (error) {
      this.error = messageFrom(error)
    }
  }

  async kill(): Promise<void> {
    this.#gen += 1
    this.alive = false
    this.#spawning = false

    try {
      await this.#backend.kill(PREVIEW_PTY_ID)
    } catch {
      // La sesión puede haberse ido ya.
    }
  }
}
