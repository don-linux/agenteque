import type { TerminalBackend, TerminalSpawn } from '$lib/backend/types'

const listeners = new Map<string, Pick<TerminalSpawn, 'onData' | 'onExit'>>()
let bridged = false

function ensureBridge(): void {
  if (bridged) return
  bridged = true
  window.api.onPtyData((chunk) => listeners.get(chunk.id)?.onData(chunk.data))
  window.api.onPtyExit((exit) => listeners.get(exit.id)?.onExit(exit.code))
}

export const terminalIpc: TerminalBackend = {
  async spawn(options) {
    ensureBridge()
    listeners.set(options.id, { onData: options.onData, onExit: options.onExit })
    await window.api.ptySpawn({
      id: options.id,
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
    })
  },

  async write(id, data) {
    await window.api.ptyWrite(id, data)
  },

  async resize(id, cols, rows) {
    await window.api.ptyResize(id, cols, rows)
  },

  async kill(id) {
    listeners.delete(id)
    await window.api.ptyKill(id)
  },

  async killAll() {
    const ids = Array.from(listeners.keys())
    for (const id of ids) {
      if (id === 'workspace' || id.startsWith('workspace-')) listeners.delete(id)
    }
    await window.api.ptyKillAll()
  },
}
