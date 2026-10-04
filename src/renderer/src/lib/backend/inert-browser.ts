import type {
  BrowserBackend,
  BrowserBoot,
  BrowserCommand,
  BrowserTabState,
} from '$lib/backend/types'

export const BROWSER_UNAVAILABLE = 'El motor del navegador llega en una etapa posterior'

/**
 * No arranca ningún motor: `spawn` falla siempre, así que el cromo se queda en
 * su estado apagado cuando el proceso principal todavía no está conectado.
 */
class InertBrowser implements BrowserBackend {
  async spawn(_url: string): Promise<BrowserBoot> {
    throw new Error(BROWSER_UNAVAILABLE)
  }

  async newTab(_url: string): Promise<BrowserTabState> {
    throw new Error(BROWSER_UNAVAILABLE)
  }

  async command(_command: BrowserCommand): Promise<void> {
    throw new Error(BROWSER_UNAVAILABLE)
  }

  bounds(): void {
    // No hay vista que mover.
  }

  async focusApp(): Promise<void> {
    // No hay ventana invitada.
  }

  async focusPage(): Promise<void> {
    // No hay ventana invitada.
  }

  async kill(): Promise<void> {
    // No hay proceso que matar.
  }

  subscribe(): () => void {
    return () => {}
  }
}

export const inertBrowser = new InertBrowser()
