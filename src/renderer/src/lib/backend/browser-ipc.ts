import type { BrowserShortcutName } from '../../../../shared/browser'
import type { BrowserTabState } from '../../../../shared/ipc'
import type { BrowserBackend, BrowserListener } from '$lib/backend/types'

let listener: BrowserListener | null = null
let bridged = false

function ensureBridge(): void {
  if (bridged) return
  bridged = true
  window.api.onBrowserState((tab) => listener?.state(tab))
  window.api.onBrowserShortcut((name) => listener?.shortcut(name))
  window.api.onBrowserFocus(() => listener?.focus())
  window.api.onBrowserTabOpened((tab) => listener?.tabOpened(tab))
}

export const browserIpc: BrowserBackend = {
  spawn(url) {
    ensureBridge()
    return window.api.browserSpawn(url)
  },

  newTab(url) {
    ensureBridge()
    return window.api.browserNewTab(url)
  },

  command(command) {
    return window.api.browserCommand(command)
  },

  bounds(bounds) {
    window.api.browserSetBounds(bounds)
  },

  focusApp() {
    return window.api.browserFocusApp()
  },

  focusPage() {
    return window.api.browserFocusPage()
  },

  kill() {
    return window.api.browserKill()
  },

  subscribe(next) {
    ensureBridge()
    listener = next
    return () => {
      if (listener === next) listener = null
    }
  },
}

export type { BrowserShortcutName, BrowserTabState }
