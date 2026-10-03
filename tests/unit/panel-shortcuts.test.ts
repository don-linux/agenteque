import { describe, expect, it, vi } from 'vitest'
import {
  handleTreeToggleShortcut,
  isTerminalTarget,
  isTreeToggleAnywhereShortcut,
  isTreeToggleShortcut,
} from '$lib/panel-shortcuts'

function key(
  partial: Partial<{
    code: string
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
    altKey: boolean
  }> = {},
) {
  return {
    code: 'KeyT',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn<() => void>(),
    stopPropagation: vi.fn<() => void>(),
    stopImmediatePropagation: vi.fn<() => void>(),
    ...partial,
  }
}

describe('isTreeToggleShortcut', () => {
  it('matches only plain Ctrl+T', () => {
    expect(isTreeToggleShortcut(key())).toBe(true)
    expect(isTreeToggleShortcut(key({ code: 'KeyJ' }))).toBe(false)
    expect(isTreeToggleShortcut(key({ code: 'KeyB' }))).toBe(false)
    expect(isTreeToggleShortcut(key({ ctrlKey: false }))).toBe(false)
    expect(isTreeToggleShortcut(key({ metaKey: true }))).toBe(false)
    expect(isTreeToggleShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isTreeToggleShortcut(key({ altKey: true }))).toBe(false)
  })

  // `code` has to match whole, not by suffix or substring: a looser comparison
  // would hand unrelated physical keys the tree toggle.
  it('compares the whole code, not part of it', () => {
    for (const code of ['IntlT', 'KeyTT', 'BracketLeftT', 'keyt', 'Key', 'T', '']) {
      expect(isTreeToggleShortcut(key({ code }))).toBe(false)
      expect(isTreeToggleAnywhereShortcut(key({ code, shiftKey: true }))).toBe(false)
    }
  })
})

describe('isTreeToggleAnywhereShortcut', () => {
  it('matches only Ctrl+Shift+T', () => {
    expect(isTreeToggleAnywhereShortcut(key({ shiftKey: true }))).toBe(true)
    expect(isTreeToggleAnywhereShortcut(key())).toBe(false)
    expect(isTreeToggleAnywhereShortcut(key({ shiftKey: true, altKey: true }))).toBe(false)
    expect(isTreeToggleAnywhereShortcut(key({ shiftKey: true, metaKey: true }))).toBe(false)
    expect(isTreeToggleAnywhereShortcut(key({ code: 'KeyJ', shiftKey: true }))).toBe(false)
    expect(isTreeToggleAnywhereShortcut(key({ code: 'KeyB', shiftKey: true }))).toBe(false)
  })

  it('does not overlap with the plain chord', () => {
    expect(isTreeToggleShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isTreeToggleAnywhereShortcut(key())).toBe(false)
  })
})

describe('handleTreeToggleShortcut', () => {
  it('toggles the tree and swallows the chord', () => {
    const event = key()
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: true, insideTerminal: false, toggleTree })

    expect(toggleTree).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('is a no-op without a workspace', () => {
    const event = key()
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: false, insideTerminal: false, toggleTree })

    expect(toggleTree).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves Ctrl+T alone inside the terminal', () => {
    const event = key()
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: true, insideTerminal: true, toggleTree })

    expect(toggleTree).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('still toggles from inside the terminal with Ctrl+Shift+T', () => {
    const event = key({ shiftKey: true })
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: true, insideTerminal: true, toggleTree })

    expect(toggleTree).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('accepts Ctrl+Shift+T outside the terminal too', () => {
    const event = key({ shiftKey: true })
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: true, insideTerminal: false, toggleTree })

    expect(toggleTree).toHaveBeenCalledTimes(1)
  })

  it('ignores other chords without touching the event', () => {
    const event = key({ altKey: true })
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: true, insideTerminal: false, toggleTree })

    expect(toggleTree).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not fire without a workspace, even with the anywhere chord', () => {
    const event = key({ shiftKey: true })
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, { hasWorkspace: false, insideTerminal: true, toggleTree })

    expect(toggleTree).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  // How the layout wires it: the target of the keydown decides `insideTerminal`.
  it('lets the terminal keep Ctrl+T when the event came from an xterm surface', () => {
    const target = { closest: (selector: string) => (selector === '.xterm' ? {} : null) }
    const event = key()
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, {
      hasWorkspace: true,
      insideTerminal: isTerminalTarget(target as unknown as EventTarget),
      toggleTree,
    })

    expect(toggleTree).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()

    const anywhere = key({ shiftKey: true })
    handleTreeToggleShortcut(anywhere, {
      hasWorkspace: true,
      insideTerminal: isTerminalTarget(target as unknown as EventTarget),
      toggleTree,
    })

    expect(toggleTree).toHaveBeenCalledTimes(1)
  })

  it('toggles on Ctrl+T when the event came from the editor', () => {
    const target = { closest: () => null }
    const event = key()
    const toggleTree = vi.fn<() => void>()

    handleTreeToggleShortcut(event, {
      hasWorkspace: true,
      insideTerminal: isTerminalTarget(target as unknown as EventTarget),
      toggleTree,
    })

    expect(toggleTree).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})

describe('isTerminalTarget', () => {
  it('is false without an element', () => {
    expect(isTerminalTarget(null)).toBe(false)
    expect(isTerminalTarget({} as EventTarget)).toBe(false)
  })

  it('walks up to an xterm ancestor', () => {
    const closest = vi.fn<(selector: string) => object | null>((selector) =>
      selector === '.xterm' ? {} : null,
    )

    expect(isTerminalTarget({ closest } as unknown as EventTarget)).toBe(true)
    expect(closest).toHaveBeenCalledWith('.xterm')
  })

  it('is false for an element outside the terminal', () => {
    const target = { closest: () => null } as unknown as EventTarget

    expect(isTerminalTarget(target)).toBe(false)
  })

  it('treats an undefined match as outside', () => {
    const target = { closest: () => undefined } as unknown as EventTarget

    expect(isTerminalTarget(target)).toBe(false)
  })
})
