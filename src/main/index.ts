import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { type AppVersions, IpcChannel } from '../shared/ipc'

const isSmokeTest = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 20_000
const SMOKE_HOLD_MS = 2_000

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.versions, (): AppVersions => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))
}

function failSmokeTest(reason: string): void {
  console.error(`[smoke] FAIL: ${reason}`)
  app.exit(1)
}

/**
 * `--smoke-test`: exit 0 once the renderer reports it mounted and stays healthy for
 * SMOKE_HOLD_MS; exit 1 on load failure, renderer crash, console error or timeout.
 */
function armSmokeTest(win: BrowserWindow): void {
  const timeout = setTimeout(
    () => failSmokeTest(`renderer not ready after ${SMOKE_TIMEOUT_MS}ms`),
    SMOKE_TIMEOUT_MS,
  )

  win.webContents.on('did-fail-load', (_event, code, description) =>
    failSmokeTest(`did-fail-load ${code} ${description}`),
  )
  win.webContents.on('render-process-gone', (_event, details) =>
    failSmokeTest(`render-process-gone ${details.reason}`),
  )
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') failSmokeTest(`renderer console error: ${event.message}`)
  })

  ipcMain.once(IpcChannel.rendererReady, () => {
    clearTimeout(timeout)
    console.log('[smoke] renderer ready')
    setTimeout(() => {
      console.log('[smoke] OK')
      app.exit(0)
    }, SMOKE_HOLD_MS)
  })
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  const win = createWindow()
  if (isSmokeTest) armSmokeTest(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
