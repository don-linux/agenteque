import { afterEach, describe, expect, it } from 'vitest'
import { isBrowserFocusUrlShortcut, isBrowserToggleShortcut } from '$lib/browser-shortcuts'
import { DEFAULT_PLATFORM, setPlatform } from '$lib/platform'
import { isTreeToggleAnywhereShortcut, isTreeToggleShortcut } from '$lib/panel-shortcuts'
import { isSaveShortcut } from '$lib/save-shortcut'
import { isTerminalDockShortcut, isTerminalSurfaceShortcut } from '$lib/terminal-dock'

interface Chord {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

function ctrl(code: string, extra: Partial<Chord> = {}): Chord {
  return { code, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...extra }
}

function cmd(code: string, extra: Partial<Chord> = {}): Chord {
  return { code, ctrlKey: false, metaKey: true, shiftKey: false, altKey: false, ...extra }
}

afterEach(() => setPlatform(DEFAULT_PLATFORM))

/**
 * La versión de la que se porta exigía literalmente `ctrlKey && !metaKey`, así
 * que en macOS no respondía ni un solo atajo de la aplicación.
 */
describe('every app chord follows the platform modifier', () => {
  it('answers to Ctrl outside macOS and ignores Cmd', () => {
    setPlatform('linux')

    expect(isSaveShortcut(ctrl('KeyS'))).toBe(true)
    expect(isTerminalDockShortcut(ctrl('KeyJ'))).toBe(true)
    expect(isTerminalSurfaceShortcut(ctrl('KeyJ', { shiftKey: true }))).toBe(true)
    expect(isTreeToggleShortcut(ctrl('KeyT'))).toBe(true)
    expect(isTreeToggleAnywhereShortcut(ctrl('KeyT', { shiftKey: true }))).toBe(true)
    expect(isBrowserToggleShortcut(ctrl('KeyB'))).toBe(true)
    expect(isBrowserFocusUrlShortcut(ctrl('KeyL'))).toBe(true)

    expect(isSaveShortcut(cmd('KeyS'))).toBe(false)
    expect(isTerminalDockShortcut(cmd('KeyJ'))).toBe(false)
    expect(isTerminalSurfaceShortcut(cmd('KeyJ', { shiftKey: true }))).toBe(false)
    expect(isTreeToggleShortcut(cmd('KeyT'))).toBe(false)
    expect(isTreeToggleAnywhereShortcut(cmd('KeyT', { shiftKey: true }))).toBe(false)
    expect(isBrowserToggleShortcut(cmd('KeyB'))).toBe(false)
    expect(isBrowserFocusUrlShortcut(cmd('KeyL'))).toBe(false)
  })

  it('answers to Cmd on macOS and ignores Ctrl', () => {
    setPlatform('darwin')

    expect(isSaveShortcut(cmd('KeyS'))).toBe(true)
    expect(isTerminalDockShortcut(cmd('KeyJ'))).toBe(true)
    expect(isTerminalSurfaceShortcut(cmd('KeyJ', { shiftKey: true }))).toBe(true)
    expect(isTreeToggleShortcut(cmd('KeyT'))).toBe(true)
    expect(isTreeToggleAnywhereShortcut(cmd('KeyT', { shiftKey: true }))).toBe(true)
    expect(isBrowserToggleShortcut(cmd('KeyB'))).toBe(true)
    expect(isBrowserFocusUrlShortcut(cmd('KeyL'))).toBe(true)

    expect(isSaveShortcut(ctrl('KeyS'))).toBe(false)
    expect(isTerminalDockShortcut(ctrl('KeyJ'))).toBe(false)
    expect(isTerminalSurfaceShortcut(ctrl('KeyJ', { shiftKey: true }))).toBe(false)
    expect(isTreeToggleShortcut(ctrl('KeyT'))).toBe(false)
    expect(isTreeToggleAnywhereShortcut(ctrl('KeyT', { shiftKey: true }))).toBe(false)
    expect(isBrowserToggleShortcut(ctrl('KeyB'))).toBe(false)
    expect(isBrowserFocusUrlShortcut(ctrl('KeyL'))).toBe(false)
  })

  it('keeps Alt and Shift meaning the same on macOS', () => {
    setPlatform('darwin')

    expect(isTerminalDockShortcut(cmd('KeyJ', { altKey: true }))).toBe(true)
    expect(isTerminalSurfaceShortcut(cmd('KeyJ', { shiftKey: true, altKey: true }))).toBe(false)
    expect(isTreeToggleShortcut(cmd('KeyT', { shiftKey: true }))).toBe(false)
    expect(isBrowserToggleShortcut(cmd('KeyB', { shiftKey: true }))).toBe(false)
  })
})
