export const IpcChannel = {
  versions: 'app:versions',
  rendererReady: 'app:renderer-ready',
} as const

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

export interface AgentequeApi {
  getVersions(): Promise<AppVersions>
  notifyRendererReady(): void
}
