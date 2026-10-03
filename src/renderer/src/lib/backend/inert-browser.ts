import type { BrowserBackend, BrowserBoot, BrowserCommand } from '$lib/backend/types'

export const BROWSER_UNAVAILABLE = 'El motor del navegador llega en una etapa posterior'

/**
 * No arranca ningún motor: `spawn` falla siempre, así que el cromo se queda en
 * su estado apagado, que es exactamente la superficie que se quiere mostrar.
 */
class InertBrowser implements BrowserBackend {
  async spawn(_url: string): Promise<BrowserBoot> {
    throw new Error(BROWSER_UNAVAILABLE)
  }

  async navigate(_url: string): Promise<void> {
    throw new Error(BROWSER_UNAVAILABLE)
  }

  async command(_command: BrowserCommand): Promise<void> {
    throw new Error(BROWSER_UNAVAILABLE)
  }

  async kill(): Promise<void> {
    // No hay proceso que matar.
  }
}

export const inertBrowser = new InertBrowser()
