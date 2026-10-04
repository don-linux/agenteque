import type { LayoutSettings } from '$lib/app-config.svelte'
import { demoTerminal } from '$lib/backend/demo-terminal'
import type { TerminalBackend } from '$lib/backend/types'
import { nextActiveAfterClose } from '$lib/editor-tabs'
import {
  clampPanelSize,
  DEFAULT_TERMINAL_BOTTOM,
  DEFAULT_TERMINAL_RIGHT,
  MIN_TERMINAL_BOTTOM,
  MIN_TERMINAL_RIGHT,
  terminalBottomReserve,
  terminalRightReserve,
} from '$lib/panel-resize'
import { MAX_TERMINAL_SESSIONS, workspacePtyId } from '$lib/pty'
import { nextDockToggle, type TerminalDock } from '$lib/terminal-dock'
import { phaseAfterWidgetGone, shouldSpawnTerminal, type TerminalPhase } from '$lib/terminal-phase'
import { surface, type WorkspaceSurface } from '$lib/workspace-surface.svelte'

export type { TerminalDock, TerminalPhase, WorkspaceSurface }
export { MAX_TERMINAL_SESSIONS }

export interface TerminalSession {
  id: string
  /** `idle` no ha arrancado, `running` tiene proceso, `exited` murió y no se relanza. */
  phase: TerminalPhase
  error: string | null
}

function messageFrom(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

class TerminalPanelState {
  get surface(): WorkspaceSurface {
    return surface.current
  }

  set surface(value: WorkspaceSurface) {
    surface.set(value)
  }

  open = $state(false)
  started = $state(false)
  dock = $state<TerminalDock>('bottom')
  bottomSize = $state(DEFAULT_TERMINAL_BOTTOM)
  rightSize = $state(DEFAULT_TERMINAL_RIGHT)
  parkWidth = $state(640)
  parkHeight = $state(DEFAULT_TERMINAL_BOTTOM)
  sessions = $state<TerminalSession[]>([])
  activeId = $state<string | null>(null)

  #backend: TerminalBackend = demoTerminal

  use(backend: TerminalBackend): void {
    this.#backend = backend
  }
  #nextSerial = 1
  #spawning = new Set<string>()
  #writers = new Map<string, (chunk: string) => void>()
  #mounted = new Set<string>()
  /** Sube al desmontar el widget para que un `spawn` o un `onExit` viejos no pisen el estado. */
  #epoch = new Map<string, number>()

  get size(): number {
    return this.dock === 'bottom' ? this.bottomSize : this.rightSize
  }

  get canAdd(): boolean {
    return this.sessions.length < MAX_TERMINAL_SESSIONS
  }

  get error(): string | null {
    return this.sessions.find((session) => session.error)?.error ?? null
  }

  get peeking(): boolean {
    return this.surface === 'editor' && this.open
  }

  get minSize(): number {
    return this.dock === 'bottom' ? MIN_TERMINAL_BOTTOM : MIN_TERMINAL_RIGHT
  }

  /** Restaura la geometría guardada. El panel en sí sigue cerrado. */
  hydrate(layout: LayoutSettings, treeWidth: number): void {
    this.dock = layout.terminalDock === 'right' ? 'right' : 'bottom'
    this.fit(window.innerWidth, window.innerHeight, treeWidth, {
      bottom: layout.terminalBottom,
      right: layout.terminalRight,
    })
  }

  /** Vuelve a acotar los dos lados: una ventana menor no puede dejar sin editor. */
  fit(
    width: number,
    height: number,
    treeWidth: number,
    sizes = { bottom: this.bottomSize, right: this.rightSize },
  ): void {
    this.bottomSize = clampPanelSize(
      sizes.bottom,
      MIN_TERMINAL_BOTTOM,
      height,
      terminalBottomReserve(),
    )
    this.rightSize = clampPanelSize(
      sizes.right,
      MIN_TERMINAL_RIGHT,
      width,
      terminalRightReserve(treeWidth),
    )
  }

  session(id: string): TerminalSession | undefined {
    return this.sessions.find((session) => session.id === id)
  }

  isVisible(id: string): boolean {
    if (this.surface === 'terminals') return true
    if (!this.open) return false
    return this.activeId === id
  }

  toggle(dock: TerminalDock): void {
    if (this.surface === 'terminals') return

    const next = nextDockToggle(this.open, this.dock, dock)
    this.open = next.open
    this.dock = next.dock

    if (next.open) {
      this.started = true
      this.ensureSession()
    }
  }

  rememberPark(width: number, height: number): void {
    if (width >= 2) this.parkWidth = width
    if (height >= 2) this.parkHeight = height
  }

  setSize(pixels: number, viewport: number, treeWidth = 0): void {
    if (this.dock === 'bottom') {
      this.bottomSize = clampPanelSize(
        pixels,
        MIN_TERMINAL_BOTTOM,
        viewport,
        terminalBottomReserve(),
      )
      return
    }

    this.rightSize = clampPanelSize(
      pixels,
      MIN_TERMINAL_RIGHT,
      viewport,
      terminalRightReserve(treeWidth),
    )
  }

  ensureSession(): string | null {
    if (this.activeId && this.session(this.activeId)) return this.activeId
    const first = this.sessions[0]
    if (first !== undefined) {
      this.activeId = first.id
      return this.activeId
    }
    return this.addSession()
  }

  addSession(): string | null {
    if (!this.canAdd) return null

    const id = workspacePtyId(this.#nextSerial)
    this.#nextSerial += 1
    this.sessions = [...this.sessions, { id, phase: 'idle', error: null }]
    this.activeId = id
    this.started = true
    return id
  }

  focus(id: string): void {
    if (this.session(id)) this.activeId = id
  }

  enterTerminals(): void {
    this.surface = 'terminals'
    this.started = true
    this.ensureSession()
  }

  leaveTerminals(): void {
    this.surface = 'editor'
    this.open = false
  }

  attachWidget(id: string): void {
    this.#mounted.add(id)
  }

  /**
   * El xterm ya no existe. Si la sesión seguía viva, el proceso se mata y el
   * siguiente montaje arranca otro. Un `exit` no vuelve a `idle`: el panel
   * nuevo solo pinta que la sesión terminó.
   */
  detachWidget(id: string): void {
    this.#mounted.delete(id)
    this.#writers.delete(id)

    const session = this.session(id)
    if (!session || phaseAfterWidgetGone(session.phase) === 'exited') return

    this.#epoch.set(id, (this.#epoch.get(id) ?? 0) + 1)
    this.#spawning.delete(id)
    this.#patch(id, { phase: 'idle', error: null })
    void this.#backend.kill(id).catch(() => {
      // La sesión puede haberse ido ya.
    })
  }

  attachWriter(id: string, write: (chunk: string) => void): void {
    this.#writers.set(id, write)
  }

  detachWriter(id: string): void {
    this.#writers.delete(id)
  }

  async spawn(id: string, cwd: string, cols: number, rows: number): Promise<void> {
    const session = this.session(id)
    if (!session || !this.#mounted.has(id) || this.#spawning.has(id)) return
    if (!shouldSpawnTerminal(session.phase, session.error)) return

    const epoch = this.#epoch.get(id) ?? 0
    this.#spawning.add(id)
    this.#patch(id, { error: null })

    try {
      await this.#backend.spawn({
        id,
        cwd,
        cols,
        rows,
        onData: (chunk) => {
          if ((this.#epoch.get(id) ?? 0) !== epoch) return
          this.#writers.get(id)?.(chunk)
        },
        onExit: () => {
          if ((this.#epoch.get(id) ?? 0) !== epoch) return
          const current = this.session(id)
          if (!current || current.phase === 'exited') return
          this.#patch(id, { phase: 'exited' })
        },
      })

      if ((this.#epoch.get(id) ?? 0) !== epoch || !this.session(id)) {
        try {
          await this.#backend.kill(id)
        } catch {
          // La sesión puede haberse ido ya.
        }
        return
      }

      if (this.session(id)?.phase === 'exited') return
      this.#patch(id, { phase: 'running' })
    } catch (error) {
      if ((this.#epoch.get(id) ?? 0) !== epoch) return
      this.#patch(id, { phase: 'idle', error: messageFrom(error) })
    } finally {
      this.#spawning.delete(id)
    }
  }

  async write(id: string, data: string): Promise<void> {
    if (this.session(id)?.phase !== 'running') return

    try {
      await this.#backend.write(id, data)
    } catch (error) {
      this.#patch(id, { error: messageFrom(error) })
    }
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    if (this.session(id)?.phase !== 'running') return

    try {
      await this.#backend.resize(id, cols, rows)
    } catch (error) {
      this.#patch(id, { error: messageFrom(error) })
    }
  }

  async closeSession(id: string): Promise<void> {
    if (!this.session(id)) return

    const next = nextActiveAfterClose(
      this.sessions.map((session) => session.id),
      id,
      this.activeId,
    )

    this.#spawning.delete(id)
    this.#writers.delete(id)
    this.#mounted.delete(id)
    this.#epoch.delete(id)
    this.sessions = this.sessions.filter((session) => session.id !== id)
    this.activeId = next

    try {
      await this.#backend.kill(id)
    } catch {
      // La sesión puede haberse ido ya.
    }

    if (this.sessions.length > 0) return

    this.activeId = null
    if (this.surface === 'editor') {
      this.open = false
      this.started = false
    }
  }

  async teardown(): Promise<void> {
    // El tamaño y el anclaje sobreviven: son preferencia, no estado de sesión.
    this.surface = 'editor'
    this.open = false
    this.started = false
    this.sessions = []
    this.activeId = null
    this.#nextSerial = 1
    this.#spawning.clear()
    this.#writers.clear()
    this.#mounted.clear()
    this.#epoch.clear()

    try {
      await this.#backend.killAll()
    } catch {
      // Las sesiones pueden haberse ido ya.
    }
  }

  #patch(id: string, patch: Partial<TerminalSession>): void {
    this.sessions = this.sessions.map((session) =>
      session.id === id ? { ...session, ...patch } : session,
    )
  }
}

export const terminal = new TerminalPanelState()
