import { describe, expect, it } from 'vitest'
import { ROUTES } from '$lib/app-routes'
import { isSettingsRoute, normalizeRoute } from '$lib/router'

describe('normalizeRoute', () => {
  it('keeps the known routes untouched', () => {
    expect(normalizeRoute('#/')).toBe(ROUTES.home)
    expect(normalizeRoute('#/workspace')).toBe(ROUTES.workspace)
    expect(normalizeRoute('#/configuracion')).toBe(ROUTES.settings)
    expect(normalizeRoute('#/configuracion/temas')).toBe('#/configuracion/temas')
  })

  it('treats an empty or bare hash as home', () => {
    expect(normalizeRoute('')).toBe(ROUTES.home)
    expect(normalizeRoute('#')).toBe(ROUTES.home)
    expect(normalizeRoute('   ')).toBe(ROUTES.home)
    expect(normalizeRoute('#/')).toBe(ROUTES.home)
  })

  it('accepts a path without the fragment marker', () => {
    expect(normalizeRoute('/workspace')).toBe(ROUTES.workspace)
  })

  it('drops trailing slashes so a route has one spelling', () => {
    expect(normalizeRoute('#/workspace/')).toBe(ROUTES.workspace)
    expect(normalizeRoute('#/configuracion///')).toBe(ROUTES.settings)
  })

  it('sends a plain anchor home instead of treating it as a route', () => {
    expect(normalizeRoute('#seccion')).toBe(ROUTES.home)
    expect(normalizeRoute('#workspace')).toBe(ROUTES.home)
  })
})

describe('isSettingsRoute', () => {
  it('covers the settings shell and every section', () => {
    expect(isSettingsRoute(ROUTES.settings)).toBe(true)
    expect(isSettingsRoute('#/configuracion/terminal')).toBe(true)
    expect(isSettingsRoute('#/configuracion/temas')).toBe(true)
    expect(isSettingsRoute('#/configuracion/navegador')).toBe(true)
  })

  it('does not match the other screens', () => {
    expect(isSettingsRoute(ROUTES.home)).toBe(false)
    expect(isSettingsRoute(ROUTES.workspace)).toBe(false)
    // Un prefijo que sólo comparte las letras no es la pantalla.
    expect(isSettingsRoute('#/configuraciones')).toBe(false)
  })
})
