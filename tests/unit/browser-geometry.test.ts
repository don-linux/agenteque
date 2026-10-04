import { describe, expect, it } from 'vitest'
import { rectContains, rectsIntersect, viewFitsHost, type Rect } from '../../src/shared/browser-geometry'

const host: Rect = { x: 100, y: 80, width: 400, height: 300 }
const toolbar: Rect = { x: 100, y: 48, width: 400, height: 32 }
const tabs: Rect = { x: 100, y: 20, width: 400, height: 28 }
const footer: Rect = { x: 0, y: 380, width: 800, height: 28 }

describe('viewFitsHost', () => {
  it('accepts a view that fills the host and only shares an edge with the chrome', () => {
    const view: Rect = { x: 100, y: 80, width: 400, height: 300 }
    expect(viewFitsHost(view, host, [tabs, toolbar, footer])).toBe(true)
    expect(rectsIntersect(view, toolbar)).toBe(false)
  })

  it('allows a single pixel of rounding and rejects a real overlap', () => {
    const sliver: Rect = { x: 99, y: 79, width: 402, height: 302 }
    expect(rectContains(host, sliver)).toBe(true)
    expect(viewFitsHost(sliver, host, [toolbar])).toBe(true)

    const overToolbar: Rect = { x: 100, y: 78, width: 400, height: 302 }
    expect(rectsIntersect(overToolbar, toolbar)).toBe(true)
    expect(viewFitsHost(overToolbar, host, [toolbar])).toBe(false)

    const pastHost: Rect = { x: 100, y: 80, width: 410, height: 300 }
    expect(rectContains(host, pastHost)).toBe(false)
    expect(viewFitsHost(pastHost, host, [])).toBe(false)
  })

  it('rejects a view parked over the footer', () => {
    const parked: Rect = { x: 0, y: 360, width: 400, height: 40 }
    expect(viewFitsHost(parked, host, [footer])).toBe(false)
  })
})
