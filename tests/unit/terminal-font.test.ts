import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FONT_LABEL,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_XTERM_FONT_FAMILY,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  MONO_FALLBACK_STACK,
  clampFontSize,
  filterFonts,
  fontLabel,
  xtermFontFamily,
  type SystemFont,
} from '$lib/terminal-font'

const fonts: SystemFont[] = [
  { family: 'Hack Nerd Font', monospace: true },
  { family: 'JetBrainsMono Nerd Font', monospace: true },
  { family: 'Inter', monospace: false },
]

describe('xtermFontFamily', () => {
  it('uses the built-in stack when no family is set', () => {
    expect(xtermFontFamily(null)).toBe(DEFAULT_XTERM_FONT_FAMILY)
    expect(xtermFontFamily('   ')).toBe(DEFAULT_XTERM_FONT_FAMILY)
    expect(xtermFontFamily(undefined)).toBe(DEFAULT_XTERM_FONT_FAMILY)
    expect(DEFAULT_XTERM_FONT_FAMILY).toBe(
      `"JetBrains Mono Variable", "JetBrains Mono", ${MONO_FALLBACK_STACK}`,
    )
  })

  // `ui-monospace` no resuelve en todas las instalaciones de Windows.
  it('keeps the Windows monospaced faces behind ui-monospace', () => {
    expect(MONO_FALLBACK_STACK).toBe('ui-monospace, "Cascadia Mono", Consolas, monospace')
    expect(DEFAULT_XTERM_FONT_FAMILY.endsWith(MONO_FALLBACK_STACK)).toBe(true)
  })

  it('quotes a custom family and keeps a monospace fallback', () => {
    expect(xtermFontFamily('JetBrainsMono Nerd Font')).toBe(
      `"JetBrainsMono Nerd Font", ${MONO_FALLBACK_STACK}`,
    )
  })

  it('escapes quotes inside a family name', () => {
    expect(xtermFontFamily('Foo "Bar"')).toBe(`"Foo \\"Bar\\"", ${MONO_FALLBACK_STACK}`)
  })
})

describe('clampFontSize', () => {
  it('keeps values inside the terminal range', () => {
    expect(clampFontSize(13)).toBe(13)
    expect(clampFontSize(10)).toBe(MIN_TERMINAL_FONT_SIZE)
    expect(clampFontSize(24)).toBe(MAX_TERMINAL_FONT_SIZE)
  })

  it('rounds and clamps outliers', () => {
    expect(clampFontSize(12.6)).toBe(13)
    expect(clampFontSize(3)).toBe(MIN_TERMINAL_FONT_SIZE)
    expect(clampFontSize(99)).toBe(MAX_TERMINAL_FONT_SIZE)
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_TERMINAL_FONT_SIZE)
  })
})

describe('filterFonts', () => {
  it('returns the full list when the query is empty', () => {
    expect(filterFonts(fonts, '  ')).toEqual(fonts)
  })

  it('matches a case-insensitive substring', () => {
    expect(filterFonts(fonts, 'nerd')).toEqual([
      { family: 'Hack Nerd Font', monospace: true },
      { family: 'JetBrainsMono Nerd Font', monospace: true },
    ])
    expect(filterFonts(fonts, 'INTER')).toEqual([{ family: 'Inter', monospace: false }])
    expect(filterFonts(fonts, 'zzz')).toEqual([])
  })
})

describe('fontLabel', () => {
  it('uses Predeterminada for the built-in stack', () => {
    expect(fontLabel(null)).toBe(DEFAULT_FONT_LABEL)
    expect(fontLabel('')).toBe(DEFAULT_FONT_LABEL)
  })

  it('keeps a custom family name', () => {
    expect(fontLabel('Hack Nerd Font')).toBe('Hack Nerd Font')
  })
})
