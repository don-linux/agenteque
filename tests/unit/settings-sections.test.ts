import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS, settingsSectionFromPath } from '$lib/settings-sections'

describe('SETTINGS_SECTIONS', () => {
  it('lists each section with a unique id and matching href', () => {
    const ids = SETTINGS_SECTIONS.map((section) => section.id)

    expect(new Set(ids).size).toBe(ids.length)

    for (const section of SETTINGS_SECTIONS) {
      expect(section.href).toBe(`#/configuracion/${section.id}`)
    }
  })

  it('includes Terminal, Temas and Navegador in order', () => {
    expect(SETTINGS_SECTIONS[0]).toEqual({
      id: 'terminal',
      label: 'Terminal',
      href: '#/configuracion/terminal',
    })
    expect(SETTINGS_SECTIONS[1]).toEqual({
      id: 'temas',
      label: 'Temas',
      href: '#/configuracion/temas',
    })
    expect(SETTINGS_SECTIONS[2]).toEqual({
      id: 'navegador',
      label: 'Navegador',
      href: '#/configuracion/navegador',
    })
  })
})

describe('settingsSectionFromPath', () => {
  it('resolves a known section href', () => {
    expect(settingsSectionFromPath('#/configuracion/terminal')?.id).toBe('terminal')
    expect(settingsSectionFromPath('#/configuracion/temas')?.id).toBe('temas')
    expect(settingsSectionFromPath('#/configuracion/navegador')?.id).toBe('navegador')
  })

  it('also accepts the path without the fragment marker', () => {
    expect(settingsSectionFromPath('/configuracion/terminal')?.id).toBe('terminal')
  })

  it('returns null when no section is selected', () => {
    expect(settingsSectionFromPath('#/configuracion')).toBeNull()
    expect(settingsSectionFromPath('#/')).toBeNull()
  })
})
