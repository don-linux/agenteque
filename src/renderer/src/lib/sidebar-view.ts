export type SidebarView = 'tree' | 'git'

export interface SidebarState {
  visible: boolean
  view: SidebarView
}

/** Ctrl+T / PanelLeft: siempre aterriza en el árbol. Lo oculta solo si ya se está viendo. */
export function applyTreeToggle(state: SidebarState): SidebarState {
  if (!state.visible || state.view === 'git') {
    return { visible: true, view: 'tree' }
  }
  return { visible: false, view: 'tree' }
}

/** Ctrl+G / el botón de Git: siempre aterriza en el grafo. Lo oculta solo si ya se está viendo. */
export function applyGitToggle(state: SidebarState): SidebarState {
  if (!state.visible || state.view === 'tree') {
    return { visible: true, view: 'git' }
  }
  return { visible: false, view: 'git' }
}

export function applyShowTree(): SidebarState {
  return { visible: true, view: 'tree' }
}

export function applyShowGit(): SidebarState {
  return { visible: true, view: 'git' }
}

export function isGitSidebar(state: SidebarState): boolean {
  return state.visible && state.view === 'git'
}

export function isTreeSidebar(state: SidebarState): boolean {
  return state.visible && state.view === 'tree'
}

/** Abrir Git desde el árbol debe volver a comparar solo la rama actual. */
export function gitOpensFromTree(state: SidebarState): boolean {
  return state.view === 'tree'
}
