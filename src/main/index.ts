import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, session, shell, type WebFrameMain } from 'electron'
import {
  type AppConfig,
  type AppearanceSettings,
  type LayoutSettings,
  type TerminalSettings,
  withoutRecent,
  withRecent,
  withWorkspaceView,
  type WorkspaceView,
} from '../shared/config'
import { type AppVersions, IpcChannel } from '../shared/ipc'
import { ConfigStore } from './config-store'

const isSmokeTest = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 20_000
const SMOKE_HOLD_MS = 2_000
const MAX_EXTERNAL_URL_LENGTH = 2048
const MAX_EXTERNAL_OPENS = 8
const clipboardDenied = new Set<string>(['clipboard-read', 'deprecated-sync-clipboard-read'])
const chromiumSpoolPrefix = '.org.chromium.Chromium.'
const SPOOL_SWEEP_MS = 800
const SPOOL_SWEEP_STEP_MS = 20

/**
 * Camera and microphone share `media`. MIDI sysex is a separate check from
 * `midi`. Approximate geolocation is the same capability as geolocation.
 * Clipboard reads are denied separately by ADV-E18.
 */
const DENIED_PERMISSIONS = new Set<string>([
  'media',
  'geolocation',
  'geolocation-approximate',
  'notifications',
  'midi',
  'midiSysex',
])

function permissionDenied(permission: string): boolean {
  return DENIED_PERMISSIONS.has(permission) || clipboardDenied.has(permission)
}

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

/**
 * Empaquetada la copia viaja con el renderer; en desarrollo `out/renderer` no
 * existe y se usa el original que consume electron-builder.
 */
function windowIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../renderer/icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ]
  return candidates.find((file) => existsSync(file))
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    // Tres paneles (árbol, editor y terminal) no caben en 960×700.
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    icon: windowIcon(),
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
  recoverRenderer(win)

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function recoverRenderer(win: BrowserWindow): void {
  if (isSmokeTest) return
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    if (win.isDestroyed()) return
    void win.webContents.reload()
  })
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

function installSessionGuards(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(!permissionDenied(permission))
  })
  ses.setPermissionCheckHandler((_contents, permission) => !permissionDenied(permission))
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (event, item) => {
    event.preventDefault()
    item.cancel()
    discardChromiumSpools()
  })
}

function discardChromiumSpools(): void {
  const dirs = [...new Set([app.getPath('downloads'), app.getPath('temp')])]
  const sweep = (): void => {
    for (const dir of dirs) unlinkChromiumSpools(dir)
  }
  sweep()
  for (let delayMs = 0; delayMs <= SPOOL_SWEEP_MS; delayMs += SPOOL_SWEEP_STEP_MS) {
    const timer = setTimeout(sweep, delayMs)
    timer.unref()
  }
}

function unlinkChromiumSpools(dir: string): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.startsWith(chromiumSpoolPrefix)) continue
    try {
      unlinkSync(join(dir, name))
    } catch {
      // The spool can disappear between the listing and the unlink.
    }
  }
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

  registerConfigHandlers(new ConfigStore(app.getPath('userData')))
}

function handleConfig(channel: string, run: (payload: unknown) => AppConfig): void {
  ipcMain.handle(channel, (event, payload: unknown): AppConfig => {
    if (!isTrustedSender(event.senderFrame)) {
      throw new Error(`Rejected untrusted ${channel} sender`)
    }
    return run(payload)
  })
}

/**
 * Un canal por comando, como en el backend que se porta, y todos devuelven el
 * `AppConfig` completo ya saneado: el renderer nunca ve lo que había en disco.
 */
function registerConfigHandlers(store: ConfigStore): void {
  handleConfig(IpcChannel.configLoad, () => store.load())
  handleConfig(IpcChannel.configSaveTerminal, (payload) =>
    store.update((config) => ({ ...config, terminal: payload as TerminalSettings })),
  )
  handleConfig(IpcChannel.configSaveAppearance, (payload) =>
    store.update((config) => ({ ...config, appearance: payload as AppearanceSettings })),
  )
  handleConfig(IpcChannel.configSaveLayout, (payload) =>
    store.update((config) => ({ ...config, layout: payload as LayoutSettings })),
  )
  handleConfig(IpcChannel.configSaveWorkspaceView, (payload) =>
    store.update((config) => withWorkspaceView(config, payload as WorkspaceView)),
  )
  handleConfig(IpcChannel.configRecordRecent, (payload) =>
    store.update((config) => withRecent(config, String(payload ?? ''))),
  )
  handleConfig(IpcChannel.configRemoveRecent, (payload) =>
    store.update((config) => withoutRecent(config, String(payload ?? ''))),
  )
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
    if (readyCount > 1 && hold) {
      clearTimeout(hold)
      hold = undefined
    }
    void event.sender
      .executeJavaScript(`document.querySelector('h1')?.textContent === 'agenteque'`)
      .then((mounted: unknown) => {
        if (settled) return
        // A signal before the heading is mounted is not ready. Do not exit
        // here: a crash in that same window must still surface as
        // render-process-gone, and the smoke timeout still fails the run.
        if (mounted !== true) return
        if (readyCount > 1) {
          // A second signal must not print OK. Exit after the same hold the
          // success path uses so the duplicate IPC can be observed first.
          if (hold) clearTimeout(hold)
          hold = setTimeout(() => finish(1, 'duplicate renderer-ready'), SMOKE_HOLD_MS)
          return
        }
        console.log('[smoke] renderer ready')
        hold = setTimeout(() => finish(0), SMOKE_HOLD_MS)
      })
      .catch((error: unknown) => {
        if (settled) return
        if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        finish(1, `renderer-ready before the renderer mounted: ${message}`)
      })
  })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  void app.whenReady().then(() => {
    installSessionGuards()
    registerIpcHandlers()
    const win = createWindow()
    if (isSmokeTest) armSmokeTest(win)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
