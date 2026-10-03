/** Mensajes del banner de error del navegador que dependen de eventos del host. */

export const RENDER_CRASHED = 'La página se cerró inesperadamente'

/** `status` viene del host (`crashed`, `killed`, `oom`, `launch-failed`…). */
export function renderCrashedMessage(status: string): string {
  const detail = status.replace(/\s+/g, ' ').trim()
  return detail.length > 0 ? `${RENDER_CRASHED} (${detail})` : RENDER_CRASHED
}

/** Un renderer crasheado no debe seguir en el banner cuando una carga posterior sí terminó. */
export function clearsRenderCrash(error: string | null): boolean {
  return error !== null && error.startsWith(RENDER_CRASHED)
}
