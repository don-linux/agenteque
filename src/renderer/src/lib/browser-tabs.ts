import type { BrowserReload } from '../../../shared/config'

export interface BrowserTabRef {
  id: string
}

export interface TabClosePlan {
  closeId: string
  /** Pestaña que queda activa cuando el cierre no es el de la última. */
  activeId: string | null
  /** La última pestaña no apaga el motor: hay que abrir otra antes de cerrarla. */
  replace: boolean
}

/**
 * Cerrar la activa deja la vecina de la derecha, o la de la izquierda si no hay.
 * Cerrar una inactiva no mueve la selección.
 */
export function planTabClose(
  tabs: readonly BrowserTabRef[],
  id: string,
  activeId: string | null,
): TabClosePlan | null {
  const index = tabs.findIndex((tab) => tab.id === id)
  if (index < 0) return null
  if (tabs.length === 1) return { closeId: id, activeId: null, replace: true }
  if (activeId !== id) return { closeId: id, activeId, replace: false }

  const remaining = tabs.filter((tab) => tab.id !== id)
  const next = remaining[index]?.id ?? remaining[index - 1]?.id ?? null
  return { closeId: id, activeId: next, replace: false }
}

export function tabLabel(title: string, url: string): string {
  const trimmed = title.trim()
  if (trimmed.length > 0) return trimmed

  try {
    const host = new URL(url).host
    if (host.length > 0) return host
  } catch {
    // Todavía no es una URL absoluta.
  }

  return 'Nueva pestaña'
}

export function reloadIgnoresCache(mode: BrowserReload): boolean {
  return mode === 'nocache'
}

/** El clic izquierdo detiene si hay carga; en reposo recarga con el modo guardado. */
export function toolbarReloadClick(
  loading: boolean,
  mode: BrowserReload,
): { cmd: 'stop' } | { cmd: 'reload'; ignoreCache: boolean } {
  if (loading) return { cmd: 'stop' }
  return { cmd: 'reload', ignoreCache: reloadIgnoresCache(mode) }
}
