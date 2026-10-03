import { contextBridge, ipcRenderer } from 'electron'
import { type AgentequeApi, IpcChannel } from '../shared/ipc'

const api: AgentequeApi = {
  getVersions: () => ipcRenderer.invoke(IpcChannel.versions),
  notifyRendererReady: () => ipcRenderer.send(IpcChannel.rendererReady),
}

contextBridge.exposeInMainWorld('api', api)
