import { isPrimaryModifier } from '$lib/platform'

export type TerminalDock = 'bottom' | 'right'

export function nextDockToggle(
  open: boolean,
  dock: TerminalDock,
  next: TerminalDock,
): { open: boolean; dock: TerminalDock } {
  if (!open) return { open: true, dock: next }
  if (dock === next) return { open: false, dock }
  return { open: true, dock: next }
}

export function dockFromAlt(altKey: boolean): TerminalDock {
  return altKey ? 'right' : 'bottom'
}

export function isTerminalDockShortcut(event: {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): boolean {
  return event.code === 'KeyJ' && isPrimaryModifier(event) && !event.shiftKey
}

export function isTerminalSurfaceShortcut(event: {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey?: boolean
}): boolean {
  return (
    event.code === 'KeyJ' && isPrimaryModifier(event) && event.shiftKey && event.altKey !== true
  )
}

export interface TerminalShortcutEvent {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation?: () => void
}

export function handleTerminalShortcut(
  event: TerminalShortcutEvent,
  ctx: {
    hasWorkspace: boolean
    surface?: 'editor' | 'terminals' | 'browser'
    toggle: (dock: TerminalDock) => void
  },
): void {
  if (!isTerminalDockShortcut(event)) return
  if (!ctx.hasWorkspace) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  if (ctx.surface === 'terminals') return
  ctx.toggle(dockFromAlt(event.altKey))
}

export function handleTerminalSurfaceShortcut(
  event: TerminalShortcutEvent,
  ctx: { hasWorkspace: boolean; toggleSurface: () => void },
): void {
  if (!isTerminalSurfaceShortcut(event)) return
  if (!ctx.hasWorkspace) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  ctx.toggleSurface()
}
