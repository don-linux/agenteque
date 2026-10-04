import type { AppVersions } from '../../../shared/ipc'

export type { AppVersions }

export const VERSIONS_UNAVAILABLE = 'No se pudieron leer las versiones del runtime'

export const COPY = {
  heading: 'Navegador',
  lead: 'Motor del navegador integrado. Aquí no hay nada que guardar: es información.',
  loading: 'Cargando…',
} as const

export interface RuntimeLines {
  chromium: string
  electron: string
  node: string
  app: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Una respuesta incompleta de `app:versions` no debe llegar a la plantilla:
 * media fila en blanco se lee peor que el aviso de que no hay datos.
 */
export function acceptVersions(value: unknown): AppVersions | null {
  if (value === null || typeof value !== 'object') return null

  try {
    const raw = value as Partial<AppVersions>
    const app = text(raw.app)
    const electron = text(raw.electron)
    const chrome = text(raw.chrome)
    const node = text(raw.node)
    if (!app || !electron || !chrome || !node) return null

    return { app, electron, chrome, node }
  } catch {
    // Un getter hostil no debe tumbar la pantalla de configuración.
    return null
  }
}

export function runtimeLines(versions: AppVersions): RuntimeLines {
  return {
    chromium: `Chromium: ${versions.chrome}`,
    electron: `Electron: ${versions.electron}`,
    node: `Node: ${versions.node}`,
    app: `agenteque: ${versions.app}`,
  }
}
