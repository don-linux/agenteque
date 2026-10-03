import { ROUTES } from '$lib/app-routes'

export const SETTINGS_ROUTE_PREFIX = `${ROUTES.settings}/`

/**
 * Normaliza lo que haya en `location.hash` a una de nuestras rutas. Todo lo que
 * no empiece por `#/` cae en la pantalla de inicio: un fragmento suelto como
 * `#seccion` es un ancla, no una ruta.
 */
export function normalizeRoute(hash: string): string {
  const trimmed = hash.trim()
  if (trimmed === '' || trimmed === '#') return ROUTES.home

  const path = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (!path.startsWith('/')) return ROUTES.home

  const cleaned = path.replace(/\/+$/, '')
  return cleaned === '' ? ROUTES.home : `#${cleaned}`
}

export function isSettingsRoute(route: string): boolean {
  return route === ROUTES.settings || route.startsWith(SETTINGS_ROUTE_PREFIX)
}
