import { describe, expect, it } from 'vitest'
import {
  applyGitToggle,
  applyShowGit,
  applyShowTree,
  applyTreeToggle,
  gitOpensFromTree,
  isGitSidebar,
  isTreeSidebar,
  type SidebarState,
} from '$lib/sidebar-view'

function state(partial: Partial<SidebarState> = {}): SidebarState {
  return { visible: true, view: 'tree', ...partial }
}

describe('applyTreeToggle', () => {
  it('hides the panel when the file tree is showing', () => {
    expect(applyTreeToggle(state({ visible: true, view: 'tree' }))).toEqual({
      visible: false,
      view: 'tree',
    })
  })

  it('opens the file tree when the panel is hidden', () => {
    expect(applyTreeToggle(state({ visible: false, view: 'tree' }))).toEqual({
      visible: true,
      view: 'tree',
    })
    expect(applyTreeToggle(state({ visible: false, view: 'git' }))).toEqual({
      visible: true,
      view: 'tree',
    })
  })

  it('switches from git to the file tree without hiding the panel', () => {
    expect(applyTreeToggle(state({ visible: true, view: 'git' }))).toEqual({
      visible: true,
      view: 'tree',
    })
  })
})

describe('applyGitToggle', () => {
  it('hides the panel when the git graph is showing', () => {
    expect(applyGitToggle(state({ visible: true, view: 'git' }))).toEqual({
      visible: false,
      view: 'git',
    })
  })

  it('opens git when the panel is hidden', () => {
    expect(applyGitToggle(state({ visible: false, view: 'git' }))).toEqual({
      visible: true,
      view: 'git',
    })
    expect(applyGitToggle(state({ visible: false, view: 'tree' }))).toEqual({
      visible: true,
      view: 'git',
    })
  })

  it('switches from the file tree to git without hiding the panel', () => {
    expect(applyGitToggle(state({ visible: true, view: 'tree' }))).toEqual({
      visible: true,
      view: 'git',
    })
  })
})

describe('applyShowTree / applyShowGit', () => {
  it('always reveals the requested view', () => {
    expect(applyShowTree()).toEqual({ visible: true, view: 'tree' })
    expect(applyShowGit()).toEqual({ visible: true, view: 'git' })
  })
})

describe('sidebar predicates', () => {
  it('treats the two views as mutually exclusive', () => {
    const tree = state({ visible: true, view: 'tree' })
    const git = state({ visible: true, view: 'git' })
    expect(isTreeSidebar(tree)).toBe(true)
    expect(isGitSidebar(tree)).toBe(false)
    expect(isGitSidebar(git)).toBe(true)
    expect(isTreeSidebar(git)).toBe(false)
    expect(isTreeSidebar(state({ visible: false, view: 'tree' }))).toBe(false)
    expect(gitOpensFromTree(tree)).toBe(true)
    expect(gitOpensFromTree(git)).toBe(false)
  })
})
