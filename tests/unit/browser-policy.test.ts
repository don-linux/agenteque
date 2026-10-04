import { describe, expect, it } from 'vitest'
import {
  browserShortcutFromInput,
  guestNavigationAllowed,
  guestTabUrlAllowed,
  keepsGuestAlive,
  placementFromBounds,
  shouldKillGuest,
} from '../../src/shared/browser'

describe('guest navigation', () => {
  it('allows http, https and about:blank, and rejects other schemes', () => {
    expect(guestNavigationAllowed('https://www.google.com')).toBe(true)
    expect(guestNavigationAllowed('http://127.0.0.1:9/hit')).toBe(true)
    expect(guestNavigationAllowed('about:blank')).toBe(true)
    expect(guestNavigationAllowed('file:///etc/passwd')).toBe(false)
    expect(guestNavigationAllowed('javascript:alert(1)')).toBe(false)
    expect(guestNavigationAllowed('https://user:pass@example.com')).toBe(false)
    expect(guestNavigationAllowed('ftp://example.com')).toBe(false)
    expect(guestNavigationAllowed('')).toBe(false)
  })

  it('opens a tab only for http and https', () => {
    expect(guestTabUrlAllowed('https://www.google.com')).toBe(true)
    expect(guestTabUrlAllowed('about:blank')).toBe(false)
    expect(guestTabUrlAllowed('file:///tmp/x')).toBe(false)
  })
})

describe('placementFromBounds', () => {
  it('detaches a hidden, empty or parked rectangle', () => {
    expect(placementFromBounds({ x: 10, y: 10, width: 20, height: 20, visible: false })).toEqual({
      attached: false,
    })
    expect(
      placementFromBounds({ x: -12000, y: 0, width: 800, height: 600, visible: true }),
    ).toEqual({ attached: false })
    expect(placementFromBounds({ x: 0, y: 0, width: 0, height: 40, visible: true })).toEqual({
      attached: false,
    })
  })

  it('attaches a rectangle inside the window', () => {
    expect(placementFromBounds({ x: 12, y: 40, width: 640, height: 480, visible: true })).toEqual({
      attached: true,
      x: 12,
      y: 40,
      width: 640,
      height: 480,
    })
  })
})

describe('shouldKillGuest', () => {
  it('keeps the guest when hiding and kills it only after the close is confirmed', () => {
    expect(keepsGuestAlive('hide')).toBe(true)
    expect(keepsGuestAlive('cancel-close')).toBe(true)
    expect(keepsGuestAlive('confirm-close')).toBe(false)
    expect(shouldKillGuest('hide')).toBe(false)
    expect(shouldKillGuest('cancel-close')).toBe(false)
    expect(shouldKillGuest('confirm-close')).toBe(true)
  })
})

describe('browserShortcutFromInput', () => {
  it('maps the chords that must escape a focused page', () => {
    expect(
      browserShortcutFromInput({ type: 'keyDown', code: 'KeyB', modifiers: ['control'] }, 'linux'),
    ).toBe('toggle')
    expect(
      browserShortcutFromInput(
        { type: 'keyDown', code: 'KeyB', key: 'B', modifiers: ['control', 'shift'] },
        'linux',
      ),
    ).toBe('toggle-anywhere')
    expect(
      browserShortcutFromInput({ type: 'keyDown', code: 'KeyL', modifiers: ['ctrl'] }, 'win32'),
    ).toBe('focus-url')
    expect(browserShortcutFromInput({ type: 'keyDown', key: 'F12', modifiers: [] }, 'linux')).toBe(
      'devtools',
    )
    expect(
      browserShortcutFromInput({ type: 'keyDown', keyCode: 'B', modifiers: ['control'] }, 'linux'),
    ).toBe('toggle')
    expect(
      browserShortcutFromInput(
        { type: 'keyDown', key: 'b', control: true, modifiers: [] },
        'linux',
      ),
    ).toBe('toggle')
  })

  it('uses the command key on macOS and ignores repeats, keyup and extra modifiers', () => {
    expect(
      browserShortcutFromInput({ type: 'keyDown', code: 'KeyB', modifiers: ['meta'] }, 'darwin'),
    ).toBe('toggle')
    expect(
      browserShortcutFromInput({ type: 'keyDown', code: 'KeyB', modifiers: ['meta'] }, 'linux'),
    ).toBeNull()
    expect(
      browserShortcutFromInput({ type: 'keyDown', code: 'KeyB', modifiers: ['control'] }, 'darwin'),
    ).toBeNull()
    expect(
      browserShortcutFromInput(
        { type: 'keyDown', code: 'KeyB', modifiers: ['control', 'alt'] },
        'linux',
      ),
    ).toBeNull()
    expect(
      browserShortcutFromInput({ type: 'keyDown', key: 'F12', modifiers: ['shift'] }, 'linux'),
    ).toBeNull()
    expect(
      browserShortcutFromInput(
        { type: 'keyDown', code: 'KeyB', isAutoRepeat: true, modifiers: ['control'] },
        'linux',
      ),
    ).toBeNull()
    expect(
      browserShortcutFromInput({ type: 'keyUp', code: 'KeyB', modifiers: ['control'] }, 'linux'),
    ).toBeNull()
  })
})
