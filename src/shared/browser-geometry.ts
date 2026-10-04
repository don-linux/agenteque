export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** `inner` cabe en `outer` con una tolerancia de un píxel para el redondeo DIP. */
export function rectContains(outer: Rect, inner: Rect, tolerance = 1): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

/** Solape real, más allá de un borde compartido o de un píxel de redondeo. */
export function rectsIntersect(a: Rect, b: Rect, tolerance = 1): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return overlapX > tolerance && overlapY > tolerance
}

export function rectsClear(view: Rect, others: readonly Rect[], tolerance = 1): boolean {
  return others.every((other) => !rectsIntersect(view, other, tolerance))
}

export function viewFitsHost(
  view: Rect,
  host: Rect,
  chrome: readonly Rect[],
  tolerance = 1,
): boolean {
  return rectContains(host, view, tolerance) && rectsClear(view, chrome, tolerance)
}
