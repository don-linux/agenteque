import { ROUTES } from '$lib/app-routes'
import { normalizeRoute } from '$lib/router'

class Router {
  route = $state<string>(ROUTES.home)

  /** Arranca la escucha del hash y devuelve el limpiador para `onMount`. */
  start(): () => void {
    const sync = (): void => {
      this.route = normalizeRoute(window.location.hash)
    }

    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }

  go(route: string): void {
    const next = normalizeRoute(route)
    if (this.route === next) return
    // La asignación dispara `hashchange`, que es quien actualiza `route`.
    window.location.hash = next
  }
}

export const router = new Router()
