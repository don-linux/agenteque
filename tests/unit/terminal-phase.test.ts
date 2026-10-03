import { describe, expect, it } from 'vitest'
import { phaseAfterWidgetGone, shouldSpawnTerminal } from '$lib/terminal-phase'

describe('terminal phase', () => {
  it('does not spawn again after a clean exit', () => {
    expect(shouldSpawnTerminal('idle', null)).toBe(true)
    expect(shouldSpawnTerminal('running', null)).toBe(false)
    expect(shouldSpawnTerminal('exited', null)).toBe(false)
    expect(shouldSpawnTerminal('idle', 'falló')).toBe(false)
  })

  it('disconnects a live widget and leaves an exited session dead', () => {
    expect(phaseAfterWidgetGone('running')).toBe('idle')
    expect(phaseAfterWidgetGone('idle')).toBe('idle')
    expect(phaseAfterWidgetGone('exited')).toBe('exited')
  })
})
