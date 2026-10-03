import { describe, expect, it } from 'vitest'
import { collectDraftWrites, surfaceSwapAfterSave } from '$lib/workspace-save'

describe('collectDraftWrites', () => {
  it('turns every draft into a write', () => {
    const drafts = new Map<string, string>([
      ['notas/a.md', '# a'],
      ['notas/b.md', '# b'],
    ])

    expect(collectDraftWrites(drafts)).toEqual([
      { path: 'notas/a.md', contents: '# a' },
      { path: 'notas/b.md', contents: '# b' },
    ])
  })

  it('is empty when there are no drafts', () => {
    expect(collectDraftWrites([])).toEqual([])
  })
})

describe('surfaceSwapAfterSave', () => {
  it('enters only when every draft was written', () => {
    expect(surfaceSwapAfterSave(true)).toBe('enter')
    expect(surfaceSwapAfterSave(false)).toBe('abort')
  })
})
