import { describe, expect, it } from 'vitest'
import { applyShowTree, applyTreeToggle, isTreeSidebar, type SidebarState } from '$lib/sidebar-view'

function state(partial: Partial<SidebarState> = {}): SidebarState {
  return { visible: true, ...partial }
}

describe('applyTreeToggle', () => {
  it('hides the panel when the file tree is showing', () => {
    expect(applyTreeToggle(state({ visible: true }))).toEqual({ visible: false })
  })

  it('opens the file tree when the panel is hidden', () => {
    expect(applyTreeToggle(state({ visible: false }))).toEqual({ visible: true })
  })
})

describe('applyShowTree', () => {
  it('always reveals the file tree', () => {
    expect(applyShowTree()).toEqual({ visible: true })
  })
})

describe('sidebar predicates', () => {
  it('only reports the tree while the panel is visible', () => {
    expect(isTreeSidebar(state({ visible: true }))).toBe(true)
    expect(isTreeSidebar(state({ visible: false }))).toBe(false)
  })
})
