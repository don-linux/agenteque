import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, session, shell, type WebFrameMain } from 'electron'
import { BrowserHost } from './browser-host'
import { installLockedSession } from './session-policy'
import {
  type AppConfig,
  type AppearanceSettings,
  type BrowserSettings,
  type LayoutSettings,
  type TerminalSettings,
  withoutRecent,
  withRecent,
  withWorkspaceView,
  type WorkspaceView,
} from '../shared/config'
import { type AppVersions, type EntryRequest, type MoveRequest, IpcChannel } from '../shared/ipc'
import { ConfigStore } from './config-store'
import { readFontPage } from './font-catalog'
import { readGitGraph, readGitRefs, readGitSummary } from './git-host'
import {
  currentShell,
  ptyKill,
  ptyKillAll,
  ptyKillEvery,
  ptyResize,
  ptySpawn,
  ptyWrite,
} from './pty-host'
import {
  createEntry,
  deleteEntry,
  listContextTree,
  listWorkspaceDirs,
  moveEntry,
  readMarkdown,
  renameEntry,
  stopWatching,
  watchWorkspace,
  writeMarkdown,
} from './workspace-fs'

const isSmokeTest = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 20_000
const SMOKE_HOLD_MS = 2_000
const MAX_EXTERNAL_URL_LENGTH = 2048
const MAX_EXTERNAL_OPENS = 8
const browserHost = new BrowserHost()

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
  browserHost.attach(win)
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
  installLockedSession(session.defaultSession)
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
  registerNativeHandlers()
  browserHost.install(isTrustedSender)
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
  handleConfig(IpcChannel.configSaveBrowser, (payload) =>
    store.update((config) => ({ ...config, browser: payload as BrowserSettings })),
  )
  handleConfig(IpcChannel.configRecordRecent, (payload) =>
    store.update((config) => withRecent(config, String(payload ?? ''))),
  )
  handleConfig(IpcChannel.configRemoveRecent, (payload) =>
    store.update((config) => withoutRecent(config, String(payload ?? ''))),
  )
}

function trusted(event: Electron.IpcMainInvokeEvent, channel: string): void {
  if (!isTrustedSender(event.senderFrame)) {
    throw new Error(`Rejected untrusted ${channel} sender`)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function asKind(value: unknown): 'dir' | 'file' {
  if (value !== 'dir' && value !== 'file') throw new Error('Tipo de entrada inválido')
  return value
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Lista inválida')
  }
  return value
}

function registerNativeHandlers(): void {
  ipcMain.handle(IpcChannel.shellStatus, (event) => {
    trusted(event, IpcChannel.shellStatus)
    return { available: currentShell() !== null }
  })

  ipcMain.handle(IpcChannel.ptySpawn, (event, payload: unknown) => {
    trusted(event, IpcChannel.ptySpawn)
    const row = asRecord(payload)
    if (!row || typeof row.id !== 'string' || typeof row.cwd !== 'string') {
      throw new Error('Petición de terminal inválida')
    }
    const cols = Number(row.cols)
    const rows = Number(row.rows)
    if (!Number.isFinite(cols) || !Number.isFinite(rows))
      throw new Error('Tamaño de terminal inválido')
    const id = row.id
    ptySpawn(
      { id, cwd: row.cwd, cols, rows },
      (data) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcChannel.ptyData, { id, data })
      },
      (code) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcChannel.ptyExit, { id, code })
      },
    )
  })

  ipcMain.handle(IpcChannel.ptyWrite, (event, id: unknown, data: unknown) => {
    trusted(event, IpcChannel.ptyWrite)
    if (typeof id !== 'string' || typeof data !== 'string') throw new Error('Escritura inválida')
    ptyWrite(id, data)
  })

  ipcMain.handle(IpcChannel.ptyResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    trusted(event, IpcChannel.ptyResize)
    if (typeof id !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') {
      throw new Error('Tamaño de terminal inválido')
    }
    ptyResize(id, cols, rows)
  })

  ipcMain.handle(IpcChannel.ptyKill, (event, id: unknown) => {
    trusted(event, IpcChannel.ptyKill)
    if (typeof id !== 'string') throw new Error('Falta el id de la terminal')
    ptyKill(id)
  })

  ipcMain.handle(IpcChannel.ptyKillAll, (event) => {
    trusted(event, IpcChannel.ptyKillAll)
    ptyKillAll()
  })

  ipcMain.handle(IpcChannel.pickFolder, async (event) => {
    trusted(event, IpcChannel.pickFolder)
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent
      ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle(IpcChannel.listWorkspaceDirs, (event, root: unknown) => {
    trusted(event, IpcChannel.listWorkspaceDirs)
    if (typeof root !== 'string') throw new Error('Falta la carpeta')
    const listed = listWorkspaceDirs(root)
    watchWorkspace(listed.root, (changed) => {
      if (!event.sender.isDestroyed()) event.sender.send(IpcChannel.workspaceChanged, changed)
    })
    return listed
  })

  ipcMain.handle(IpcChannel.listContextTree, (event, root: unknown, include: unknown) => {
    trusted(event, IpcChannel.listContextTree)
    if (typeof root !== 'string') throw new Error('Falta la carpeta')
    const includeDirs = include === null ? null : asStringList(include)
    return listContextTree(root, includeDirs)
  })

  ipcMain.handle(IpcChannel.readMarkdown, (event, root: unknown, path: unknown) => {
    trusted(event, IpcChannel.readMarkdown)
    if (typeof root !== 'string' || typeof path !== 'string') throw new Error('Ruta inválida')
    return readMarkdown(root, path)
  })

  ipcMain.handle(
    IpcChannel.writeMarkdown,
    (event, root: unknown, path: unknown, contents: unknown) => {
      trusted(event, IpcChannel.writeMarkdown)
      if (typeof root !== 'string' || typeof path !== 'string' || typeof contents !== 'string') {
        throw new Error('Ruta inválida')
      }
      writeMarkdown(root, path, contents)
    },
  )

  ipcMain.handle(IpcChannel.createEntry, (event, payload: unknown) => {
    trusted(event, IpcChannel.createEntry)
    const row = asRecord(payload) as Partial<EntryRequest> | null
    if (!row || typeof row.root !== 'string' || typeof row.path !== 'string') {
      throw new Error('Ruta inválida')
    }
    createEntry(row.root, row.path, asKind(row.kind))
  })

  ipcMain.handle(IpcChannel.renameEntry, (event, payload: unknown) => {
    trusted(event, IpcChannel.renameEntry)
    const row = asRecord(payload) as Partial<MoveRequest> | null
    if (
      !row ||
      typeof row.root !== 'string' ||
      typeof row.from !== 'string' ||
      typeof row.to !== 'string'
    ) {
      throw new Error('Ruta inválida')
    }
    renameEntry(row.root, row.from, row.to, asKind(row.kind))
  })

  ipcMain.handle(IpcChannel.moveEntry, (event, payload: unknown) => {
    trusted(event, IpcChannel.moveEntry)
    const row = asRecord(payload) as Partial<MoveRequest> | null
    if (
      !row ||
      typeof row.root !== 'string' ||
      typeof row.from !== 'string' ||
      typeof row.to !== 'string'
    ) {
      throw new Error('Ruta inválida')
    }
    moveEntry(row.root, row.from, row.to, asKind(row.kind))
  })

  ipcMain.handle(IpcChannel.deleteEntry, (event, payload: unknown) => {
    trusted(event, IpcChannel.deleteEntry)
    const row = asRecord(payload) as Partial<EntryRequest> | null
    if (!row || typeof row.root !== 'string' || typeof row.path !== 'string') {
      throw new Error('Ruta inválida')
    }
    deleteEntry(row.root, row.path, asKind(row.kind))
  })

  ipcMain.handle(IpcChannel.gitRefs, async (event, root: unknown) => {
    trusted(event, IpcChannel.gitRefs)
    if (typeof root !== 'string') throw new Error('Falta la carpeta')
    try {
      return await readGitRefs(root)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Git no responde'
      return { probe: { available: false }, error: message }
    }
  })

  ipcMain.handle(IpcChannel.gitGraph, async (event, root: unknown, selected: unknown) => {
    trusted(event, IpcChannel.gitGraph)
    if (typeof root !== 'string') throw new Error('Falta la carpeta')
    try {
      return await readGitGraph(root, asStringList(Array.isArray(selected) ? selected : []))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Git no responde'
      return { probe: { available: false }, error: message }
    }
  })

  ipcMain.handle(IpcChannel.gitSummary, async (event, root: unknown) => {
    trusted(event, IpcChannel.gitSummary)
    if (typeof root !== 'string') throw new Error('Falta la carpeta')
    try {
      return await readGitSummary(root)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Git no responde'
      return { probe: { available: false }, error: message }
    }
  })

  ipcMain.handle(IpcChannel.fontPage, (event, payload: unknown) => {
    trusted(event, IpcChannel.fontPage)
    const row = asRecord(payload)
    if (!row) throw new Error('Solicitud inválida')
    const query = typeof row.query === 'string' ? row.query : ''
    const offset = typeof row.offset === 'number' ? row.offset : 0
    const limit = typeof row.limit === 'number' ? row.limit : 40
    return readFontPage(query, offset, limit)
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
  browserHost.destroyAll()
  ptyKillEvery()
  stopWatching()
  if (process.platform !== 'darwin') app.quit()
})
