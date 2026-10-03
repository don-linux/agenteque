import { afterEach, describe, expect, it } from 'vitest'
import {
  currentPlatform,
  DEFAULT_PLATFORM,
  isMacPlatform,
  isPrimaryModifier,
  setPlatform,
  shortcutLabel,
} from '$lib/platform'

afterEach(() => setPlatform(DEFAULT_PLATFORM))

describe('setPlatform', () => {
  it('takes what the preload reports', () => {
    setPlatform('darwin')
    expect(currentPlatform()).toBe('darwin')
    expect(isMacPlatform()).toBe(true)
  })

  it('falls back when the bridge is missing or empty', () => {
    setPlatform(undefined)
    expect(currentPlatform()).toBe(DEFAULT_PLATFORM)
    setPlatform('')
    expect(currentPlatform()).toBe(DEFAULT_PLATFORM)
    setPlatform(null)
    expect(currentPlatform()).toBe(DEFAULT_PLATFORM)
  })
})

describe('isPrimaryModifier', () => {
  it('is Ctrl everywhere but macOS', () => {
    for (const platform of ['linux', 'win32', 'freebsd']) {
      expect(isPrimaryModifier({ ctrlKey: true, metaKey: false }, platform)).toBe(true)
      expect(isPrimaryModifier({ ctrlKey: false, metaKey: true }, platform)).toBe(false)
      // Ctrl+Cmd no es el acorde: el usuario está pulsando otra cosa.
      expect(isPrimaryModifier({ ctrlKey: true, metaKey: true }, platform)).toBe(false)
      expect(isPrimaryModifier({ ctrlKey: false, metaKey: false }, platform)).toBe(false)
    }
  })

  it('is Cmd on macOS', () => {
    expect(isPrimaryModifier({ ctrlKey: false, metaKey: true }, 'darwin')).toBe(true)
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: false }, 'darwin')).toBe(false)
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: true }, 'darwin')).toBe(false)
    expect(isPrimaryModifier({ ctrlKey: false, metaKey: false }, 'darwin')).toBe(false)
  })

  it('reads the platform set at startup when none is given', () => {
    setPlatform('darwin')
    expect(isPrimaryModifier({ ctrlKey: false, metaKey: true })).toBe(true)
    setPlatform('win32')
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: false })).toBe(true)
  })
})

describe('shortcutLabel', () => {
  it('leaves the chord alone outside macOS', () => {
    expect(shortcutLabel('Ctrl+S', 'linux')).toBe('Ctrl+S')
    expect(shortcutLabel('Ctrl+Shift+T', 'win32')).toBe('Ctrl+Shift+T')
    expect(shortcutLabel('Ctrl+Alt+J', 'linux')).toBe('Ctrl+Alt+J')
  })

  it('writes macOS symbols without separators', () => {
    expect(shortcutLabel('Ctrl+S', 'darwin')).toBe('⌘S')
    expect(shortcutLabel('Ctrl+Shift+T', 'darwin')).toBe('⌘⇧T')
    expect(shortcutLabel('Ctrl+Alt+J', 'darwin')).toBe('⌘⌥J')
  })

  it('keeps keys it does not know', () => {
    expect(shortcutLabel('F12', 'darwin')).toBe('F12')
    expect(shortcutLabel('Ctrl+F12', 'darwin')).toBe('⌘F12')
  })
})
