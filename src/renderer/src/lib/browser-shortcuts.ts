import { isPrimaryModifier } from '$lib/platform'

export interface BrowserShortcutEvent {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation?: () => void
}

interface Chord {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Ctrl+B. No llega mientras el foco está en la terminal (prefijo de tmux). */
export function isBrowserToggleShortcut(event: Chord): boolean {
  return event.code === 'KeyB' && isPrimaryModifier(event) && !event.shiftKey && !event.altKey
}

/** Ctrl+Shift+B: el que también funciona desde dentro de la terminal. */
export function isBrowserToggleAnywhereShortcut(event: Chord): boolean {
  return event.code === 'KeyB' && isPrimaryModifier(event) && event.shiftKey && !event.altKey
}

/** Ctrl+L: enfoca la URL. */
export function isBrowserFocusUrlShortcut(event: Chord): boolean {
  return event.code === 'KeyL' && isPrimaryModifier(event) && !event.shiftKey && !event.altKey
}

export function handleBrowserFocusUrlShortcut(
  event: BrowserShortcutEvent,
  ctx: {
    browserSurface: boolean
    focusUrl: () => void
  },
): void {
  if (!isBrowserFocusUrlShortcut(event)) return
  if (!ctx.browserSurface) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  ctx.focusUrl()
}

export function handleBrowserShortcut(
  event: BrowserShortcutEvent,
  ctx: {
    hasWorkspace: boolean
    insideTerminal: boolean
    toggleBrowser: () => void
  },
): void {
  const anywhere = isBrowserToggleAnywhereShortcut(event)
  const plain = isBrowserToggleShortcut(event)

  if (!anywhere && !plain) return
  if (!ctx.hasWorkspace) return
  // Ctrl+B es el prefijo de tmux, así que una terminal con el foco se lo queda.
  if (plain && ctx.insideTerminal) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  ctx.toggleBrowser()
}
