import { describe, expect, it } from 'vitest'
import {
  asHomeSurface,
  nextSurfaceAfterLeave,
  type WorkspaceHomeSurface,
  type WorkspaceSurface,
} from '$lib/workspace-surface'

describe('asHomeSurface', () => {
  it('keeps editor and terminals', () => {
    expect(asHomeSurface('editor')).toBe('editor')
    expect(asHomeSurface('terminals')).toBe('terminals')
  })

  it('falls back to editor when already on the browser', () => {
    expect(asHomeSurface('browser')).toBe('editor')
  })
})

describe('nextSurfaceAfterLeave', () => {
  it('returns to the remembered non-browser surface', () => {
    expect(nextSurfaceAfterLeave('browser', 'editor')).toBe('editor')
    expect(nextSurfaceAfterLeave('browser', 'terminals')).toBe('terminals')
  })

  it('does not change editor or terminals', () => {
    const homes: WorkspaceHomeSurface[] = ['editor', 'terminals']
    const currents: WorkspaceSurface[] = ['editor', 'terminals']

    for (const current of currents) {
      for (const previous of homes) {
        expect(nextSurfaceAfterLeave(current, previous)).toBe(current)
      }
    }
  })
})
