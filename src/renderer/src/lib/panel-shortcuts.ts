import { isPrimaryModifier } from '$lib/platform'

export interface TreeToggleEvent {
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

/** Ctrl+G (Cmd+G en macOS). No llega mientras el foco está en la terminal. */
export function isGitToggleShortcut(event: Chord): boolean {
  return event.code === 'KeyG' && isPrimaryModifier(event) && !event.shiftKey && !event.altKey
}

/** Ctrl+T (Cmd+T en macOS). No llega mientras el foco está en la terminal. */
export function isTreeToggleShortcut(event: Chord): boolean {
  return event.code === 'KeyT' && isPrimaryModifier(event) && !event.shiftKey && !event.altKey
}

/** Ctrl+Shift+T: el que también funciona desde dentro de la terminal. */
export function isTreeToggleAnywhereShortcut(event: Chord): boolean {
  return event.code === 'KeyT' && isPrimaryModifier(event) && event.shiftKey && !event.altKey
}

export function handleTreeToggleShortcut(
  event: TreeToggleEvent,
  ctx: {
    hasWorkspace: boolean
    insideTerminal: boolean
    toggleTree: () => void
  },
): void {
  const anywhere = isTreeToggleAnywhereShortcut(event)
  const plain = isTreeToggleShortcut(event)

  if (!anywhere && !plain) return
  if (!ctx.hasWorkspace) return
  // Una terminal con el foco se queda con Ctrl+T. Ctrl+Shift+T es nuestro.
  if (plain && ctx.insideTerminal) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  ctx.toggleTree()
}

export function handleGitToggleShortcut(
  event: TreeToggleEvent,
  ctx: {
    hasWorkspace: boolean
    insideTerminal: boolean
    toggleGit: () => void
  },
): void {
  if (!isGitToggleShortcut(event)) return
  if (!ctx.hasWorkspace) return
  if (ctx.insideTerminal) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  ctx.toggleGit()
}

/**
 * True cuando el evento viene de dentro de una superficie de xterm. Se mira
 * `closest` en vez de `instanceof Element`, que no cubre otro documento.
 */
export function isTerminalTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => unknown } | null
  if (!candidate || typeof candidate.closest !== 'function') return false
  return candidate.closest('.xterm') != null
}
