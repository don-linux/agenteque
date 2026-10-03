export const MIN_TREE_WIDTH = 140
export const DEFAULT_TREE_WIDTH = 260
export const MIN_TERMINAL_BOTTOM = 120
export const MIN_TERMINAL_RIGHT = 200
export const DEFAULT_TERMINAL_BOTTOM = 280
export const DEFAULT_TERMINAL_RIGHT = 380

/** The editor is never optional, so the movable panels stop before starving it. */
export const MIN_EDITOR_WIDTH = 320
export const MIN_EDITOR_HEIGHT = 160
export const FOOTER_HEIGHT = 44
export const SASH_SIZE = 4

/** No panel may eat more than this share of the window either. */
export const MAX_PANEL_RATIO = 0.8

export const TREE_WIDTH_STEP = 16

/**
 * Biggest a panel may get: the smaller of its share of the window and whatever is
 * left once the other regions get their minimum. Its own minimum always wins, so a
 * tiny window shrinks the editor instead of collapsing the panel to nothing.
 */
export function panelMaximum(minimum: number, viewport: number, reserved = 0): number {
  if (!Number.isFinite(viewport) || viewport <= 0) return minimum

  const share = Math.floor(viewport * MAX_PANEL_RATIO)
  const room = Math.floor(viewport - Math.max(0, reserved))
  return Math.max(minimum, Math.min(share, room))
}

/** Rounds and keeps a panel size inside [minimum, panelMaximum]. */
export function clampPanelSize(
  pixels: number,
  minimum: number,
  viewport: number,
  reserved = 0,
): number {
  if (!Number.isFinite(pixels)) return minimum

  const maximum = panelMaximum(minimum, viewport, reserved)
  return Math.min(maximum, Math.max(minimum, Math.round(pixels)))
}

/** Horizontal room the tree may not take: the editor plus a terminal docked right. */
export function treeReserve(terminalRightWidth: number): number {
  return MIN_EDITOR_WIDTH + SASH_SIZE + Math.max(0, terminalRightWidth)
}

/** Horizontal room a right docked terminal may not take: the editor plus the tree. */
export function terminalRightReserve(treeWidth: number): number {
  return MIN_EDITOR_WIDTH + (treeWidth > 0 ? treeWidth + SASH_SIZE : 0)
}

/** Vertical room a bottom docked terminal may not take: the editor and the footer. */
export function terminalBottomReserve(): number {
  return MIN_EDITOR_HEIGHT + FOOTER_HEIGHT
}

export interface DragOrigin {
  /** Pointer coordinate when the drag started, on the axis being resized. */
  start: number
  startSize: number
  /**
   * Which way the panel grows. The tree sits before its handle, so moving the
   * pointer forward makes it wider ("forward"). The terminal sits after its
   * handle, so it grows when the pointer moves back ("backward").
   */
  grow: 'forward' | 'backward'
}

/** Raw size for a pointer position, before clamping. */
export function dragSize(origin: DragOrigin, current: number): number {
  const delta = origin.grow === 'forward' ? current - origin.start : origin.start - current
  return origin.startSize + delta
}
