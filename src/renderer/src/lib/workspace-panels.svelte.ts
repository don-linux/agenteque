import { appConfig, type LayoutSettings } from '$lib/app-config.svelte'
import { gitGraph } from '$lib/git-graph.svelte'
import { clampPanelSize, DEFAULT_TREE_WIDTH, MIN_TREE_WIDTH, treeReserve } from '$lib/panel-resize'
import {
  applyGitToggle,
  applyShowTree,
  applyTreeToggle,
  gitOpensFromTree,
  type SidebarState,
  type SidebarView,
} from '$lib/sidebar-view'
import type { TerminalDock } from '$lib/terminal-dock'
import { terminal } from '$lib/terminal.svelte'

/**
 * Geometría de las dos regiones opcionales de la vista de IDE. El editor y el
 * pie están siempre; el árbol y la terminal son los que el usuario mueve.
 */
class WorkspacePanels {
  treeVisible = $state(true)
  treeWidth = $state(DEFAULT_TREE_WIDTH)
  sidebarView = $state<SidebarView>('tree')

  #hydrated = false

  /** Lee el layout guardado una sola vez, cuando aterriza la configuración. */
  hydrate(layout: LayoutSettings): void {
    if (this.#hydrated) return
    this.#hydrated = true

    this.treeVisible = layout.treeVisible
    terminal.hydrate(layout, this.treeSpace)
    this.setTreeWidth(layout.treeWidth, window.innerWidth)
  }

  /** Ancho con el que la terminal tiene que contar: cero si el árbol está oculto. */
  get treeSpace(): number {
    return this.treeVisible ? this.treeWidth : 0
  }

  get gitVisible(): boolean {
    return this.treeVisible && this.sidebarView === 'git'
  }

  #sidebar(): SidebarState {
    return { visible: this.treeVisible, view: this.sidebarView }
  }

  setTreeWidth(pixels: number, viewport: number): void {
    const rightDock = terminal.peeking && terminal.dock === 'right' ? terminal.rightSize : 0
    this.treeWidth = clampPanelSize(pixels, MIN_TREE_WIDTH, viewport, treeReserve(rightDock))
  }

  /**
   * Mantiene los dos paneles dentro de la ventana. El árbol cede primero:
   * cuando falta sitio suele ser porque acaban de pedir la terminal.
   */
  fit(width: number, height: number): void {
    this.setTreeWidth(this.treeWidth, width)
    terminal.fit(width, height, this.treeSpace)
  }

  #applySidebar(next: SidebarState): void {
    const becameVisible = next.visible && !this.treeVisible
    const visibilityChanged = next.visible !== this.treeVisible

    this.treeVisible = next.visible
    this.sidebarView = next.view

    if (becameVisible) this.fit(window.innerWidth, window.innerHeight)
    if (visibilityChanged) this.persist()
  }

  toggleTree(): void {
    this.#applySidebar(applyTreeToggle(this.#sidebar()))
  }

  toggleGit(): void {
    const current = this.#sidebar()
    if (gitOpensFromTree(current)) gitGraph.resetSelection()
    this.#applySidebar(applyGitToggle(current))
  }

  showTree(): void {
    this.#applySidebar(applyShowTree())
  }

  /** Alternar la terminal puede cambiar su anclaje, así que el par se guarda junto. */
  toggleTerminal(dock: TerminalDock): void {
    terminal.toggle(dock)
    // Una terminal recién abierta a la derecha puede necesitar sitio del árbol.
    this.fit(window.innerWidth, window.innerHeight)
    this.persist()
  }

  /** Se llama al soltar un redimensionado, para escribir la configuración una vez. */
  commitResize(): void {
    this.persist()
  }

  persist(): void {
    void appConfig.saveLayout(this.snapshot())
  }

  snapshot(): LayoutSettings {
    return {
      treeWidth: this.treeWidth,
      treeVisible: this.treeVisible,
      terminalBottom: terminal.bottomSize,
      terminalRight: terminal.rightSize,
      terminalDock: terminal.dock,
    }
  }
}

export const panels = new WorkspacePanels()
