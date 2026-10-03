import { describe, expect, it } from 'vitest'
import { isSettingsDirty, normalizeFontFamily } from '$lib/settings-draft'

describe('normalizeFontFamily', () => {
  it('treats empty names as the default family', () => {
    expect(normalizeFontFamily(null)).toBeNull()
    expect(normalizeFontFamily(undefined)).toBeNull()
    expect(normalizeFontFamily('   ')).toBeNull()
  })

  it('trims a custom family', () => {
    expect(normalizeFontFamily('  MesloLGS NF  ')).toBe('MesloLGS NF')
  })
})

describe('isSettingsDirty', () => {
  const saved = {
    fontFamily: 'MesloLGS NF',
    fontSize: 15,
    theme: 'tokyo-night',
    uiTheme: 'idioteque-dark',
  }

  it('is clean when draft matches the saved config', () => {
    expect(isSettingsDirty(saved, saved)).toBe(false)
  })

  it('is dirty when the family, size, terminal theme, or UI theme changes', () => {
    expect(isSettingsDirty({ ...saved, fontFamily: null }, saved)).toBe(true)
    expect(isSettingsDirty({ ...saved, fontSize: 16 }, saved)).toBe(true)
    expect(isSettingsDirty({ ...saved, theme: 'dracula' }, saved)).toBe(true)
    expect(isSettingsDirty({ ...saved, uiTheme: 'idioteque-night' }, saved)).toBe(true)
  })

  it('is clean again when the user reverts all fields', () => {
    expect(
      isSettingsDirty(
        {
          fontFamily: 'MesloLGS NF',
          fontSize: 15,
          theme: 'tokyo-night',
          uiTheme: 'idioteque-dark',
        },
        saved,
      ),
    ).toBe(false)
  })
})
