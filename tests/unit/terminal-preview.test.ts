import { describe, expect, it } from 'vitest'
import {
  TERMINAL_PREVIEW_PADDING_Y,
  TERMINAL_PREVIEW_ROWS,
  TERMINAL_PREVIEW_UNAVAILABLE,
  fitTerminalPreview,
  terminalPreviewHostHeight,
} from '$lib/terminal-preview'
import { PREVIEW_PTY_ID, WORKSPACE_PTY_ID, isWorkspacePtyId, workspacePtyId } from '$lib/pty'

describe('live preview sizing', () => {
  it('uses enough rows for a real shell prompt', () => {
    expect(TERMINAL_PREVIEW_ROWS).toBe(8)
  })

  it('grows with font size and fits the preview rows', () => {
    const small = terminalPreviewHostHeight(10)
    const large = terminalPreviewHostHeight(24)

    expect(large).toBeGreaterThan(small)
    expect(small).toBeGreaterThanOrEqual(10 * TERMINAL_PREVIEW_ROWS + TERMINAL_PREVIEW_PADDING_Y)
    expect(large).toBeGreaterThanOrEqual(24 * TERMINAL_PREVIEW_ROWS + TERMINAL_PREVIEW_PADDING_Y)
  })
})

describe('preview fallback', () => {
  it('keeps a short message when the live shell cannot start', () => {
    expect(TERMINAL_PREVIEW_UNAVAILABLE.length).toBeGreaterThan(0)
    expect(TERMINAL_PREVIEW_UNAVAILABLE.toLowerCase()).not.toContain('notas')
    expect(TERMINAL_PREVIEW_UNAVAILABLE).not.toContain('❯')
  })
})

describe('pty session ids', () => {
  it('keeps workspace and preview on separate sessions', () => {
    expect(WORKSPACE_PTY_ID).toBe('workspace')
    expect(PREVIEW_PTY_ID).toBe('preview')
    expect(WORKSPACE_PTY_ID).not.toBe(PREVIEW_PTY_ID)
    expect(workspacePtyId(1)).toBe('workspace-1')
    expect(isWorkspacePtyId('workspace-2')).toBe(true)
    expect(isWorkspacePtyId(PREVIEW_PTY_ID)).toBe(false)
  })
})

const resize = (): never => {
  throw new Error('should not resize')
}

const fit = (): never => {
  throw new Error('should not fit')
}

describe('fitTerminalPreview', () => {
  it('does nothing when the host is not laid out', () => {
    expect(() =>
      fitTerminalPreview(
        { rows: 2, cols: 40, resize },
        { fit },
        { clientWidth: 0, clientHeight: 0 },
      ),
    ).not.toThrow()
  })

  it('fits and clamps rows to the preview size', () => {
    let fitted = false
    let next = { cols: 80, rows: 24 }

    fitTerminalPreview(
      {
        get cols() {
          return next.cols
        },
        get rows() {
          return next.rows
        },
        resize(cols, rows) {
          next = { cols, rows }
        },
      },
      {
        fit() {
          fitted = true
          next = { cols: 72, rows: 24 }
        },
      },
      { clientWidth: 480, clientHeight: 160 },
    )

    expect(fitted).toBe(true)
    expect(next).toEqual({ cols: 72, rows: TERMINAL_PREVIEW_ROWS })
  })
})
