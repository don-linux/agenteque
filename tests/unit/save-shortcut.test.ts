import { describe, expect, it, vi } from 'vitest'
import { handleSaveShortcut, isSaveShortcut } from '$lib/save-shortcut'

describe('isSaveShortcut', () => {
  it('matches only Ctrl+S', () => {
    expect(isSaveShortcut({ code: 'KeyS', ctrlKey: true, metaKey: false, shiftKey: false })).toBe(
      true,
    )
    expect(isSaveShortcut({ code: 'KeyJ', ctrlKey: true, metaKey: false, shiftKey: false })).toBe(
      false,
    )
    expect(isSaveShortcut({ code: 'KeyS', ctrlKey: true, metaKey: true, shiftKey: false })).toBe(
      false,
    )
    expect(isSaveShortcut({ code: 'KeyS', ctrlKey: true, metaKey: false, shiftKey: true })).toBe(
      false,
    )
    expect(isSaveShortcut({ code: 'KeyS', ctrlKey: false, metaKey: false, shiftKey: false })).toBe(
      false,
    )
  })
})

function key(
  partial: Partial<{
    code: string
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
  }> = {},
) {
  return {
    code: 'KeyS',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn<() => void>(),
    stopPropagation: vi.fn<() => void>(),
    stopImmediatePropagation: vi.fn<() => void>(),
    ...partial,
  }
}

describe('handleSaveShortcut', () => {
  it('is a no-op when the chord is not Ctrl+S', () => {
    const event = key({ code: 'KeyJ' })
    const save = vi.fn<() => void>()

    handleSaveShortcut(event, { save })

    expect(save).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('saves and stops the event from reaching the editor or xterm', () => {
    const event = key()
    const save = vi.fn<() => void>()

    handleSaveShortcut(event, { save })

    expect(save).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })
})
