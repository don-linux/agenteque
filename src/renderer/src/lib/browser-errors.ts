import type { BrowserTabError } from '../../../shared/ipc'

/** Mensajes del banner de error del navegador que dependen de eventos del host. */

export const RENDER_CRASHED = 'La página se cerró inesperadamente'
export const PAGE_LOAD_FAILED = 'No se pudo abrir la página'

/** `status` viene del host (`crashed`, `killed`, `oom`, `launch-failed`…). */
export function renderCrashedMessage(status: string): string {
  const detail = status.replace(/\s+/g, ' ').trim()
  return detail.length > 0 ? `${RENDER_CRASHED} (${detail})` : RENDER_CRASHED
}

/** Un renderer crasheado no debe seguir en el banner cuando una carga posterior sí terminó. */
export function clearsRenderCrash(error: string | null): boolean {
  return error !== null && error.startsWith(RENDER_CRASHED)
}

export function formatTabError(error: BrowserTabError | null): string | null {
  if (!error) return null
  if (error.kind === 'crash') return renderCrashedMessage(error.status)
  const detail = error.description.replace(/\s+/g, ' ').trim()
  return detail.length > 0 ? `${PAGE_LOAD_FAILED} (${detail})` : PAGE_LOAD_FAILED
}
