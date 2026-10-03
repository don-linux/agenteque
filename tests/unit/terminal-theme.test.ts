import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_THEME_ID,
  TERMINAL_ANSI_SLOTS,
  TERMINAL_THEME,
  TERMINAL_THEMES,
  TERMINAL_THEME_IDS,
  TERMINAL_XTERM_OPTIONS,
  resolveTerminalTheme,
  resolveTerminalThemeId,
} from '$lib/terminal-theme'

const TANGO_BLUE = '#3465a4'
const TANGO_YELLOW = '#c4a000'
const HEX = /^#[0-9a-f]{6}$/

describe('TERMINAL_THEMES catalog', () => {
  it('lists the closed set of official themes', () => {
    expect(TERMINAL_THEME_IDS).toEqual([
      'idioteque-dark',
      'idioteque-night',
      'idioteque-light',
      'platzi',
      'tokyo-night',
      'catppuccin-mocha',
      'nord',
      'gruvbox-dark',
      'everforest-dark',
      'one-dark',
      'one-half-dark',
      'one-dark-pro',
      'solarized-dark',
      'dracula',
      'campbell',
    ])
    expect(TERMINAL_THEMES.map((entry) => entry.id)).toEqual([...TERMINAL_THEME_IDS])
  })

  it('gives every theme chrome plus a full 16-color ANSI palette', () => {
    for (const entry of TERMINAL_THEMES) {
      expect(entry.theme.background).toMatch(HEX)
      expect(entry.theme.foreground).toMatch(HEX)
      expect(entry.theme.cursor).toMatch(HEX)
      for (const slot of TERMINAL_ANSI_SLOTS) {
        expect(entry.theme[slot], `${entry.id}.${slot}`).toMatch(HEX)
      }
    }
  })

  it('does not use xterm Tango defaults for blue or yellow', () => {
    for (const entry of TERMINAL_THEMES) {
      expect(entry.theme.blue?.toLowerCase()).not.toBe(TANGO_BLUE)
      expect(entry.theme.yellow?.toLowerCase()).not.toBe(TANGO_YELLOW)
    }
  })
})

describe('tokyo-night', () => {
  it('is the default and uses the official Night palette, not the old chrome hybrid', () => {
    expect(DEFAULT_TERMINAL_THEME_ID).toBe('tokyo-night')
    expect(TERMINAL_THEME.background).toBe('#1a1b26')
    expect(TERMINAL_THEME.foreground).toBe('#c0caf5')
    expect(TERMINAL_THEME.cursor).toBe('#c0caf5')
    expect(TERMINAL_THEME.cursorAccent).toBe('#1a1b26')
    expect(TERMINAL_THEME.selectionBackground).toBe('#283457')
    expect(TERMINAL_THEME.background).not.toBe('#14161a')
    expect(TERMINAL_THEME.foreground).not.toBe('#e4e6ea')
  })

  it('keeps folke/Ghostty ANSI colors', () => {
    expect(TERMINAL_THEME.black).toBe('#15161e')
    expect(TERMINAL_THEME.red).toBe('#f7768e')
    expect(TERMINAL_THEME.green).toBe('#9ece6a')
    expect(TERMINAL_THEME.yellow).toBe('#e0af68')
    expect(TERMINAL_THEME.blue).toBe('#7aa2f7')
    expect(TERMINAL_THEME.magenta).toBe('#bb9af7')
    expect(TERMINAL_THEME.cyan).toBe('#7dcfff')
    expect(TERMINAL_THEME.white).toBe('#a9b1d6')
    expect(TERMINAL_THEME.brightBlack).toBe('#414868')
    expect(TERMINAL_THEME.brightRed).toBe('#ff899d')
    expect(TERMINAL_THEME.brightGreen).toBe('#9fe044')
    expect(TERMINAL_THEME.brightWhite).toBe('#c0caf5')
  })
})

describe('resolveTerminalThemeId / resolveTerminalTheme', () => {
  it('returns the matching theme', () => {
    expect(resolveTerminalThemeId('dracula')).toBe('dracula')
    expect(resolveTerminalTheme('nord').background).toBe('#2e3440')
    expect(resolveTerminalTheme('campbell').background).toBe('#0c0c0c')
    expect(resolveTerminalTheme('one-dark').background).toBe('#282c34')
    expect(resolveTerminalTheme('one-dark-pro').red).toBe('#e05561')
    expect(resolveTerminalTheme('idioteque-dark').background).toBe('#1c1e22')
    expect(resolveTerminalTheme('everforest-dark').background).toBe('#2d353b')
  })

  it('falls back to tokyo-night for empty or unknown ids', () => {
    expect(resolveTerminalThemeId(null)).toBe('tokyo-night')
    expect(resolveTerminalThemeId('')).toBe('tokyo-night')
    expect(resolveTerminalThemeId('   ')).toBe('tokyo-night')
    expect(resolveTerminalThemeId('not-a-theme')).toBe('tokyo-night')
    expect(resolveTerminalTheme('ghost')).toBe(TERMINAL_THEME)
  })
})

describe('TERMINAL_XTERM_OPTIONS', () => {
  it('keeps color fidelity and custom Powerline glyphs without a fixed theme', () => {
    expect(TERMINAL_XTERM_OPTIONS).not.toHaveProperty('theme')
    expect(TERMINAL_XTERM_OPTIONS.customGlyphs).toBe(true)
    expect(TERMINAL_XTERM_OPTIONS.drawBoldTextInBrightColors).toBe(true)
    expect(TERMINAL_XTERM_OPTIONS.minimumContrastRatio).toBe(1)
    expect(TERMINAL_XTERM_OPTIONS.cursorBlink).toBe(true)
  })
})
