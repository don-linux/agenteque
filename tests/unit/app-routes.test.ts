import { describe, expect, it } from 'vitest'
import { ROUTES, settingsBackHref } from '$lib/app-routes'

describe('ROUTES', () => {
  it('keeps home, workspace, and settings on distinct paths', () => {
    expect(ROUTES.home).toBe('#/')
    expect(ROUTES.workspace).toBe('#/workspace')
    expect(ROUTES.settings).toBe('#/configuracion')

    const paths = Object.values(ROUTES)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('writes every route as a fragment, because production loads file://', () => {
    for (const path of Object.values(ROUTES)) expect(path.startsWith('#/')).toBe(true)
  })
})

describe('settingsBackHref', () => {
  it('returns the IDE when a folder is still open', () => {
    expect(settingsBackHref(true)).toBe(ROUTES.workspace)
  })

  it('returns home when there is no workspace', () => {
    expect(settingsBackHref(false)).toBe(ROUTES.home)
  })
})
