import { describe, expect, it } from 'vitest'
import { addTab, nextActiveAfterClose, removeTab, tabBasename } from '$lib/editor-tabs'

describe('addTab', () => {
  it('appends a path that is not open yet', () => {
    expect(addTab(['a.md'], 'b.md')).toEqual(['a.md', 'b.md'])
  })

  it('does not duplicate an already open path', () => {
    expect(addTab(['a.md', 'b.md'], 'a.md')).toEqual(['a.md', 'b.md'])
  })
})

describe('removeTab', () => {
  it('removes the matching path', () => {
    expect(removeTab(['a.md', 'b.md', 'c.md'], 'b.md')).toEqual(['a.md', 'c.md'])
  })

  it('leaves the list alone when the path is not open', () => {
    expect(removeTab(['a.md'], 'b.md')).toEqual(['a.md'])
  })
})

describe('nextActiveAfterClose', () => {
  it('prefers the tab to the right of the closed active tab', () => {
    expect(nextActiveAfterClose(['a.md', 'b.md', 'c.md'], 'b.md', 'b.md')).toBe('c.md')
  })

  it('falls back to the left tab when closing the last one', () => {
    expect(nextActiveAfterClose(['a.md', 'b.md'], 'b.md', 'b.md')).toBe('a.md')
  })

  it('keeps the current tab when closing another one', () => {
    expect(nextActiveAfterClose(['a.md', 'b.md', 'c.md'], 'a.md', 'c.md')).toBe('c.md')
  })

  it('returns null when the last tab closes', () => {
    expect(nextActiveAfterClose(['only.md'], 'only.md', 'only.md')).toBeNull()
  })

  it('returns the current path when the closed path was not open', () => {
    expect(nextActiveAfterClose(['a.md'], 'ghost.md', 'a.md')).toBe('a.md')
  })
})

describe('tabBasename', () => {
  it('returns the file name from a posix path', () => {
    expect(tabBasename('agents/feature-documentator.md')).toBe('feature-documentator.md')
  })

  it('keeps a backslash in the basename because it is not a separator', () => {
    expect(tabBasename('docs\\notes.md')).toBe('docs\\notes.md')
    expect(tabBasename('folder/foo\\bar.md')).toBe('foo\\bar.md')
  })

  it('returns the path when there is no separator', () => {
    expect(tabBasename('README.md')).toBe('README.md')
  })
})
