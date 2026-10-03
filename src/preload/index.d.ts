import type { AgentequeApi } from '../shared/ipc'

declare global {
  interface Window {
    api: AgentequeApi
  }
}
