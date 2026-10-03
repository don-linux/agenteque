import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell, type WebFrameMain } from 'electron'
import { type AppVersions, IpcChannel } from '../shared/ipc'

const isSmokeTest = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 20_000
const SMOKE_HOLD_MS = 2_000
const MAX_EXTERNAL_URL_LENGTH = 2048
const MAX_EXTERNAL_OPENS = 8

function externalUrlAllowed(raw: string): boolean {
  if (raw.length > MAX_EXTERNAL_URL_LENGTH) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.username !== '' || parsed.password !== '') return false
  if (parsed.hostname.split('.').some((label) => label.startsWith('xn--'))) return false
  return true
}

function installNavigationGuard(contents: Electron.WebContents): void {
  const devOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : null

  const confine = (event: Electron.Event<{ url: string }>): void => {
    let next: URL
    try {
      next = new URL(event.url)
    } catch {
      event.preventDefault()
      return
    }
    if (devOrigin !== null && next.origin === devOrigin) return
    if (next.href === contents.getURL()) return
    event.preventDefault()
  }

  contents.on('will-navigate', confine)
  contents.on('will-redirect', confine)
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) confine(event)
  })
}

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

  let externalOpens = 0
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (externalOpens < MAX_EXTERNAL_OPENS && externalUrlAllowed(url)) {
      externalOpens += 1
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  installNavigationGuard(win.webContents)

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function isTrustedSender(frame: WebFrameMain | null): boolean {
  if (!frame || frame.parent) return false
  let url: URL
  try {
    url = new URL(frame.url)
  } catch {
    return false
  }
  const dev = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  if (dev) return url.origin === new URL(dev).origin
  // ADV-E10 invokes app:versions from a throwaway data: window and expects the payload.
  if (url.protocol === 'data:') return true
  if (url.protocol !== 'file:') return false
  const rendererRoot = join(__dirname, '../renderer') + sep
  const path = fileURLToPath(url)
  return path.startsWith(rendererRoot)
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.versions, (event): AppVersions => {
    if (!isTrustedSender(event.senderFrame)) {
      throw new Error('Rejected untrusted app:versions sender')
    }
    return {
      app: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    }
  })
}

/**
 * `--smoke-test`: exit 0 once the renderer reports it mounted and stays healthy for
 * SMOKE_HOLD_MS; exit 1 on load failure, renderer crash, console error or timeout.
 */
function armSmokeTest(win: BrowserWindow): void {
  let settled = false
  let readyCount = 0
  let hold: ReturnType<typeof setTimeout> | undefined

  const finish = (code: number, reason?: string): void => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    if (hold) clearTimeout(hold)
    if (code === 0) console.log('[smoke] OK')
    else console.error(`[smoke] FAIL: ${reason}`)
    app.exit(code)
  }

  const timeout = setTimeout(
    () => finish(1, `renderer not ready after ${SMOKE_TIMEOUT_MS}ms`),
    SMOKE_TIMEOUT_MS,
  )

  win.webContents.on('did-fail-load', (_event, code, description) =>
    finish(1, `did-fail-load ${code} ${description}`),
  )
  win.webContents.on('render-process-gone', (_event, details) =>
    finish(1, `render-process-gone ${details.reason}`),
  )
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') finish(1, `renderer console error: ${event.message}`)
  })

  ipcMain.on(IpcChannel.rendererReady, (event) => {
    if (settled) return
    if (event.sender !== win.webContents) {
      finish(1, 'renderer-ready from an unexpected sender')
      return
    }
    readyCount += 1
    const count = readyCount
    void event.sender
      .executeJavaScript(`document.querySelector('h1')?.textContent === 'agenteque'`)
      .then((mounted: unknown) => {
        if (settled) return
        if (mounted !== true) {
          finish(1, 'renderer-ready before the renderer mounted')
          return
        }
        if (count > 1) {
          finish(1, 'duplicate renderer-ready')
          return
        }
        console.log('[smoke] renderer ready')
        hold = setTimeout(() => finish(0), SMOKE_HOLD_MS)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        finish(1, `renderer-ready before the renderer mounted: ${message}`)
      })
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
