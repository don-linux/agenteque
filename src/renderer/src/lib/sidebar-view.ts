/**
 * El panel lateral solo tiene un cuerpo, el árbol de archivos: el grafo de Git
 * se queda fuera de esta etapa junto con el resto de la integración.
 */
export interface SidebarState {
  visible: boolean
}

/** Ctrl+T / PanelLeft: alterna el árbol. */
export function applyTreeToggle(state: SidebarState): SidebarState {
  return { visible: !state.visible }
}

export function applyShowTree(): SidebarState {
  return { visible: true }
}

export function isTreeSidebar(state: SidebarState): boolean {
  return state.visible
}
