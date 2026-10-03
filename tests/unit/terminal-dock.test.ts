import { describe, expect, it, vi } from 'vitest'
import {
  dockFromAlt,
  handleTerminalShortcut,
  handleTerminalSurfaceShortcut,
  isTerminalDockShortcut,
  isTerminalSurfaceShortcut,
  nextDockToggle,
  type TerminalDock,
} from '$lib/terminal-dock'

describe('nextDockToggle', () => {
  it('opens a closed panel at the requested dock', () => {
    expect(nextDockToggle(false, 'right', 'bottom')).toEqual({ open: true, dock: 'bottom' })
    expect(nextDockToggle(false, 'bottom', 'right')).toEqual({ open: true, dock: 'right' })
  })

  it('closes when the panel is already at that dock', () => {
    expect(nextDockToggle(true, 'bottom', 'bottom')).toEqual({ open: false, dock: 'bottom' })
    expect(nextDockToggle(true, 'right', 'right')).toEqual({ open: false, dock: 'right' })
  })

  it('moves an open panel to the other dock without closing', () => {
    expect(nextDockToggle(true, 'bottom', 'right')).toEqual({ open: true, dock: 'right' })
    expect(nextDockToggle(true, 'right', 'bottom')).toEqual({ open: true, dock: 'bottom' })
  })
})

describe('dockFromAlt / isTerminalDockShortcut', () => {
  it('maps alt to the right dock', () => {
    expect(dockFromAlt(false)).toBe('bottom')
    expect(dockFromAlt(true)).toBe('right')
  })

  it('matches only Ctrl+J and Ctrl+Alt+J', () => {
    expect(
      isTerminalDockShortcut({ code: 'KeyJ', ctrlKey: true, metaKey: false, shiftKey: false }),
    ).toBe(true)
    expect(
      isTerminalDockShortcut({ code: 'KeyL', ctrlKey: true, metaKey: false, shiftKey: false }),
    ).toBe(false)
    expect(
      isTerminalDockShortcut({ code: 'KeyJ', ctrlKey: true, metaKey: true, shiftKey: false }),
    ).toBe(false)
    expect(
      isTerminalDockShortcut({ code: 'KeyJ', ctrlKey: true, metaKey: false, shiftKey: true }),
    ).toBe(false)
    expect(
      isTerminalDockShortcut({ code: 'KeyJ', ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toBe(false)
  })

  it('treats Ctrl+Shift+J as the surface shortcut, not the peek', () => {
    expect(
      isTerminalSurfaceShortcut({
        code: 'KeyJ',
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toBe(true)
    expect(
      isTerminalSurfaceShortcut({
        code: 'KeyJ',
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: true,
      }),
    ).toBe(false)
    expect(
      isTerminalDockShortcut({ code: 'KeyJ', ctrlKey: true, metaKey: false, shiftKey: true }),
    ).toBe(false)
  })
})

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
    code: 'KeyJ',
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

describe('handleTerminalShortcut', () => {
  it('is a no-op without a workspace', () => {
    const event = key()
    const toggle = vi.fn<(dock: TerminalDock) => void>()

    handleTerminalShortcut(event, { hasWorkspace: false, toggle })

    expect(toggle).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('toggles bottom on Ctrl+J and stops the event from reaching xterm', () => {
    const event = key({ altKey: false })
    const toggle = vi.fn<(dock: TerminalDock) => void>()

    handleTerminalShortcut(event, { hasWorkspace: true, toggle })

    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledWith('bottom')
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('toggles right on Ctrl+Alt+J', () => {
    const event = key({ altKey: true })
    const toggle = vi.fn<(dock: TerminalDock) => void>()

    handleTerminalShortcut(event, { hasWorkspace: true, toggle })

    expect(toggle).toHaveBeenCalledWith('right')
    expect(toggle).not.toHaveBeenCalledWith('bottom')
  })

  it('swallows Ctrl+J on the terminals surface without moving the dock', () => {
    const event = key()
    const toggle = vi.fn<(dock: TerminalDock) => void>()

    handleTerminalShortcut(event, { hasWorkspace: true, surface: 'terminals', toggle })

    expect(toggle).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})

describe('handleTerminalSurfaceShortcut', () => {
  it('toggles the surface on Ctrl+Shift+J', () => {
    const event = key({ shiftKey: true })
    const toggleSurface = vi.fn<() => void>()

    handleTerminalSurfaceShortcut(event, { hasWorkspace: true, toggleSurface })

    expect(toggleSurface).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('ignores the peek chord', () => {
    const event = key()
    const toggleSurface = vi.fn<() => void>()

    handleTerminalSurfaceShortcut(event, { hasWorkspace: true, toggleSurface })

    expect(toggleSurface).not.toHaveBeenCalled()
  })
})
