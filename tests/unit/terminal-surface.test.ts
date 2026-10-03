import { describe, expect, it, vi } from 'vitest'
import { requestTerminalSurface } from '$lib/terminal-surface'

function ctx(
  partial: Partial<Parameters<typeof requestTerminalSurface>[0]> = {},
): Parameters<typeof requestTerminalSurface>[0] {
  return {
    surface: 'editor',
    hasUnsaved: false,
    confirmSave: vi.fn<() => Promise<boolean>>(async () => true),
    saveAll: vi.fn<() => Promise<boolean>>(async () => true),
    enter: vi.fn<() => void>(),
    leave: vi.fn<() => void>(),
    ...partial,
  }
}

describe('requestTerminalSurface', () => {
  it('leaves immediately from the terminals surface', async () => {
    const next = ctx({ surface: 'terminals' })

    await expect(requestTerminalSurface(next)).resolves.toBe('left')
    expect(next.leave).toHaveBeenCalledTimes(1)
    expect(next.enter).not.toHaveBeenCalled()
    expect(next.confirmSave).not.toHaveBeenCalled()
  })

  it('enters without a prompt when nothing is dirty', async () => {
    const next = ctx()

    await expect(requestTerminalSurface(next)).resolves.toBe('entered')
    expect(next.enter).toHaveBeenCalledTimes(1)
    expect(next.confirmSave).not.toHaveBeenCalled()
    expect(next.saveAll).not.toHaveBeenCalled()
  })

  it('cancels when the save prompt is dismissed', async () => {
    const next = ctx({
      hasUnsaved: true,
      confirmSave: vi.fn<() => Promise<boolean>>(async () => false),
    })

    await expect(requestTerminalSurface(next)).resolves.toBe('cancelled')
    expect(next.enter).not.toHaveBeenCalled()
    expect(next.saveAll).not.toHaveBeenCalled()
  })

  it('aborts when saveAll fails', async () => {
    const next = ctx({
      hasUnsaved: true,
      saveAll: vi.fn<() => Promise<boolean>>(async () => false),
    })

    await expect(requestTerminalSurface(next)).resolves.toBe('save-failed')
    expect(next.saveAll).toHaveBeenCalledTimes(1)
    expect(next.enter).not.toHaveBeenCalled()
  })

  it('saves every draft and then enters', async () => {
    const next = ctx({ hasUnsaved: true })

    await expect(requestTerminalSurface(next)).resolves.toBe('entered')
    expect(next.confirmSave).toHaveBeenCalledTimes(1)
    expect(next.saveAll).toHaveBeenCalledTimes(1)
    expect(next.enter).toHaveBeenCalledTimes(1)
  })
})
