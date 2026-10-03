import { describe, expect, it } from 'vitest'
import {
  THEME_PREVIEW_DIR,
  THEME_PREVIEW_FILES,
  THEME_PREVIEW_MARKDOWN,
  THEME_PREVIEW_ROOT,
  THEME_PREVIEW_STATUS,
  previewLanes,
} from '$lib/theme-preview'
import { UI_THEMES, graphSecondaryCount } from '$lib/ui-theme'

describe('theme preview sample', () => {
  it('includes a heading, list, link, and inline code', () => {
    expect(THEME_PREVIEW_MARKDOWN).toContain('# Guía rápida')
    expect(THEME_PREVIEW_MARKDOWN).toContain('- ')
    expect(THEME_PREVIEW_MARKDOWN).toContain('[enlace]')
    expect(THEME_PREVIEW_MARKDOWN).toContain('`const hola')
    expect(THEME_PREVIEW_MARKDOWN).toContain('<!-- comentario')
  })

  it('describes a small static workspace chrome', () => {
    expect(THEME_PREVIEW_ROOT).toBe('notas')
    expect(THEME_PREVIEW_DIR).toBe('diario')
    expect(THEME_PREVIEW_STATUS).toBe('guardado')
    expect(THEME_PREVIEW_FILES.some((file) => file.selected)).toBe(true)
  })
})

describe('previewLanes', () => {
  it('muestra tantos carriles como trae el tema, empezando por la rama actual', () => {
    for (const theme of UI_THEMES) {
      const lanes = previewLanes(theme.id)

      expect(lanes, theme.id).toHaveLength(graphSecondaryCount(theme.id) + 1)
      expect(lanes[0].current).toBe(true)
      expect(lanes[0].lane).toBe('var(--graph-lane-0)')
      expect(lanes.slice(1).every((entry) => !entry.current)).toBe(true)
    }
  })

  it('apunta cada carril a una variable distinta, sin repetir el acento', () => {
    const lanes = previewLanes('idioteque-night')

    expect(lanes.map((entry) => entry.lane)).toEqual([
      'var(--graph-lane-0)',
      'var(--graph-lane-1)',
      'var(--graph-lane-2)',
      'var(--graph-lane-3)',
      'var(--graph-lane-4)',
    ])
  })

  it('cae al tema por defecto con un id desconocido', () => {
    expect(previewLanes('no-such-theme')).toHaveLength(graphSecondaryCount(null) + 1)
  })
})
