import { describe, expect, it, vi } from 'vitest'
import { isTerminalTarget } from '$lib/panel-shortcuts'
import {
  handleBrowserFocusUrlShortcut,
  handleBrowserShortcut,
  isBrowserFocusUrlShortcut,
  isBrowserToggleAnywhereShortcut,
  isBrowserToggleShortcut,
} from '$lib/browser-shortcuts'

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
    code: 'KeyB',
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

describe('isBrowserToggleShortcut', () => {
  it('matches only plain Ctrl+B', () => {
    expect(isBrowserToggleShortcut(key())).toBe(true)
    expect(isBrowserToggleShortcut(key({ code: 'KeyJ' }))).toBe(false)
    expect(isBrowserToggleShortcut(key({ code: 'KeyT' }))).toBe(false)
    expect(isBrowserToggleShortcut(key({ ctrlKey: false }))).toBe(false)
    expect(isBrowserToggleShortcut(key({ metaKey: true }))).toBe(false)
    expect(isBrowserToggleShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isBrowserToggleShortcut(key({ altKey: true }))).toBe(false)
  })

  // `code` has to match whole, not by suffix or substring: a looser comparison
  // would hand unrelated physical keys the browser toggle.
  it('compares the whole code, not part of it', () => {
    for (const code of ['IntlB', 'KeyBB', 'BracketLeftB', 'keyb', 'Key', 'B', '']) {
      expect(isBrowserToggleShortcut(key({ code }))).toBe(false)
      expect(isBrowserToggleAnywhereShortcut(key({ code, shiftKey: true }))).toBe(false)
    }
  })
})

describe('isBrowserToggleAnywhereShortcut', () => {
  it('matches only Ctrl+Shift+B', () => {
    expect(isBrowserToggleAnywhereShortcut(key({ shiftKey: true }))).toBe(true)
    expect(isBrowserToggleAnywhereShortcut(key())).toBe(false)
    expect(isBrowserToggleAnywhereShortcut(key({ shiftKey: true, altKey: true }))).toBe(false)
    expect(isBrowserToggleAnywhereShortcut(key({ shiftKey: true, metaKey: true }))).toBe(false)
    expect(isBrowserToggleAnywhereShortcut(key({ code: 'KeyT', shiftKey: true }))).toBe(false)
  })

  it('does not overlap with the plain chord', () => {
    expect(isBrowserToggleShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isBrowserToggleAnywhereShortcut(key())).toBe(false)
  })
})

describe('handleBrowserShortcut', () => {
  it('toggles the browser and swallows the chord', () => {
    const event = key()
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('is a no-op without a workspace', () => {
    const event = key()
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: false,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves Ctrl+B alone inside the terminal, so tmux keeps its prefix', () => {
    const event = key()
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: true,
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('still toggles from inside the terminal with Ctrl+Shift+B', () => {
    const event = key({ shiftKey: true })
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: true,
      toggleBrowser,
    })

    expect(toggleBrowser).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('accepts Ctrl+Shift+B outside the terminal too', () => {
    const event = key({ shiftKey: true })
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).toHaveBeenCalledTimes(1)
  })

  it('ignores other chords without touching the event', () => {
    const event = key({ altKey: true })
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not fire without a workspace, even with the anywhere chord', () => {
    const event = key({ shiftKey: true })
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: false,
      insideTerminal: true,
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('lets tmux keep Ctrl+B when the event came from an xterm surface', () => {
    const target = { closest: (selector: string) => (selector === '.xterm' ? {} : null) }
    const event = key()
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: isTerminalTarget(target as unknown as EventTarget),
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()

    const anywhere = key({ shiftKey: true })
    handleBrowserShortcut(anywhere, {
      hasWorkspace: true,
      insideTerminal: isTerminalTarget(target as unknown as EventTarget),
      toggleBrowser,
    })

    expect(toggleBrowser).toHaveBeenCalledTimes(1)
  })

  it('toggles on Ctrl+B when the event came from the editor', () => {
    const target = { closest: () => null }
    const event = key()
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: isTerminalTarget(target as unknown as EventTarget),
      toggleBrowser,
    })

    expect(toggleBrowser).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('still swallows the chord when stopImmediatePropagation is missing', () => {
    const { stopImmediatePropagation: _absent, ...event } = key()
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(event, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('does not treat a lone KeyB or the letter b as a chord', () => {
    const letter = key({ ctrlKey: false, code: 'KeyB' })
    const short = key({ code: 'b' })
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(letter, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })
    handleBrowserShortcut(short, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(letter.preventDefault).not.toHaveBeenCalled()
    expect(short.preventDefault).not.toHaveBeenCalled()
  })

  it('does not steal Ctrl+Alt+Shift+B or Ctrl+Shift+Meta+B', () => {
    const alt = key({ shiftKey: true, altKey: true })
    const meta = key({ shiftKey: true, metaKey: true })
    const toggleBrowser = vi.fn<() => void>()

    handleBrowserShortcut(alt, {
      hasWorkspace: true,
      insideTerminal: true,
      toggleBrowser,
    })
    handleBrowserShortcut(meta, {
      hasWorkspace: true,
      insideTerminal: false,
      toggleBrowser,
    })

    expect(toggleBrowser).not.toHaveBeenCalled()
    expect(isBrowserToggleAnywhereShortcut(alt)).toBe(false)
    expect(isBrowserToggleAnywhereShortcut(meta)).toBe(false)
  })
})

describe('isBrowserFocusUrlShortcut', () => {
  it('matches only plain Ctrl+L', () => {
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyL' }))).toBe(true)
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyL', shiftKey: true }))).toBe(false)
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyL', altKey: true }))).toBe(false)
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyL', metaKey: true }))).toBe(false)
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyL', ctrlKey: false }))).toBe(false)
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyB' }))).toBe(false)
    expect(isBrowserFocusUrlShortcut(key({ code: 'l' }))).toBe(false)
    expect(isBrowserFocusUrlShortcut(key({ code: 'KeyLL' }))).toBe(false)
  })
})

describe('handleBrowserFocusUrlShortcut', () => {
  it('claims the URL while the browser surface is active', () => {
    const event = key({ code: 'KeyL' })
    const focusUrl = vi.fn<() => void>()

    handleBrowserFocusUrlShortcut(event, { browserSurface: true, focusUrl })

    expect(focusUrl).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('leaves Ctrl+L alone on the editor surface', () => {
    const event = key({ code: 'KeyL' })
    const focusUrl = vi.fn<() => void>()

    handleBrowserFocusUrlShortcut(event, { browserSurface: false, focusUrl })

    expect(focusUrl).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not treat Ctrl+Shift+L as location-bar focus', () => {
    const event = key({ code: 'KeyL', shiftKey: true })
    const focusUrl = vi.fn<() => void>()

    handleBrowserFocusUrlShortcut(event, { browserSurface: true, focusUrl })

    expect(focusUrl).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('still swallows Ctrl+L when stopImmediatePropagation is missing', () => {
    const event = {
      code: 'KeyL',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn<() => void>(),
      stopPropagation: vi.fn<() => void>(),
    }
    const focusUrl = vi.fn<() => void>()

    handleBrowserFocusUrlShortcut(event, { browserSurface: true, focusUrl })

    expect(focusUrl).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })
})
