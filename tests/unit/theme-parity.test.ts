import { describe, expect, it } from 'vitest'
import { TERMINAL_THEMES } from '$lib/terminal-theme'
import { UI_THEMES } from '$lib/ui-theme'
import {
  DEFAULT_TERMINAL_THEME,
  DEFAULT_UI_THEME,
  TERMINAL_THEME_IDS,
  UI_THEME_IDS,
} from '../../src/shared/config'

describe('theme catalog parity', () => {
  it('offers the same ids in UI and terminal, independently selectable', () => {
    expect(UI_THEMES.map((theme) => theme.id)).toEqual(TERMINAL_THEMES.map((theme) => theme.id))
  })

  it('keeps the same labels for those ids', () => {
    expect(UI_THEMES.map((theme) => theme.label)).toEqual(
      TERMINAL_THEMES.map((theme) => theme.label),
    )
  })
})

/**
 * El proceso principal valida los ids antes de escribir `config.json` y no
 * puede importar `$lib`, así que repite las listas. Esta es la guarda de que
 * las tres copias no se separen.
 */
describe('shared config catalog', () => {
  it('repeats the UI theme ids the renderer knows', () => {
    expect([...UI_THEME_IDS]).toEqual(UI_THEMES.map((theme) => theme.id))
  })

  it('repeats the terminal theme ids the renderer knows', () => {
    expect([...TERMINAL_THEME_IDS]).toEqual(TERMINAL_THEMES.map((theme) => theme.id))
  })

  it('defaults to ids that exist in both catalogs', () => {
    expect(UI_THEMES.some((theme) => theme.id === DEFAULT_UI_THEME)).toBe(true)
    expect(TERMINAL_THEMES.some((theme) => theme.id === DEFAULT_TERMINAL_THEME)).toBe(true)
  })
})
