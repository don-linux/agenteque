import {
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  type Input,
  type WebContents,
  type WebFrameMain,
} from 'electron'
import {
  BROWSER_PARTITION,
  type BrowserBounds,
  type BrowserShortcutName,
  browserShortcutFromInput,
  guestNavigationAllowed,
  guestTabUrlAllowed,
  placementFromBounds,
} from '../shared/browser'
import { type DevtoolsDock, resolveDevtoolsDock } from '../shared/config'
import {
  type BrowserBoot,
  type BrowserCommand,
  type BrowserDevtoolsAction,
  type BrowserTabError,
  type BrowserTabState,
  IpcChannel,
} from '../shared/ipc'
import { installLockedSession } from './session-policy'

type TrustedSender = (frame: WebFrameMain | null) => boolean

interface Tab {
  id: string
  view: WebContentsView
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: BrowserTabError | null
  /** The first `about:blank` is the empty document, not a navigation the user asked for. */
  committed: boolean
}

interface BoundsRect {
  x: number
  y: number
  width: number
  height: number
}

const DOCK_RESYNC_MS = [50, 200, 500] as const

/**
 * One WebContentsView per tab, owned by the main process. The view is added to
 * the window only while the browser surface is showing; hiding it does not
 * destroy the page. `destroyAll` is the confirmed close.
 */
export class BrowserHost {
  #win: BrowserWindow | null = null
  #tabs = new Map<string, Tab>()
  #order: string[] = []
  #active: string | null = null
  #attached: WebContentsView | null = null
  #visible = false
  #bounds: BoundsRect = { x: 0, y: 0, width: 0, height: 0 }
  #epoch = 0
  #seq = 0

  install(isTrusted: TrustedSender): void {
    ipcMain.handle(IpcChannel.browserSpawn, (event, url: unknown): BrowserBoot => {
      if (!isTrusted(event.senderFrame)) throw new Error('Rejected untrusted browser:spawn sender')
      return this.spawn(url)
    })
    ipcMain.handle(IpcChannel.browserNewTab, (event, url: unknown): BrowserTabState => {
      if (!isTrusted(event.senderFrame))
        throw new Error('Rejected untrusted browser:new-tab sender')
      return this.newTab(url)
    })
    ipcMain.handle(IpcChannel.browserCommand, (event, payload: unknown): void => {
      if (!isTrusted(event.senderFrame))
        throw new Error('Rejected untrusted browser:command sender')
      this.command(asCommand(payload))
    })
    ipcMain.on(IpcChannel.browserBounds, (event, payload: unknown) => {
      if (!isTrusted(event.senderFrame)) return
      this.bounds(payload)
    })
    ipcMain.handle(IpcChannel.browserFocusApp, (event) => {
      if (!isTrusted(event.senderFrame))
        throw new Error('Rejected untrusted browser:focus-app sender')
      this.focusApp()
    })
    ipcMain.handle(IpcChannel.browserFocusPage, (event) => {
      if (!isTrusted(event.senderFrame)) {
        throw new Error('Rejected untrusted browser:focus-page sender')
      }
      this.focusPage()
    })
    ipcMain.handle(IpcChannel.browserKill, (event) => {
      if (!isTrusted(event.senderFrame)) throw new Error('Rejected untrusted browser:kill sender')
      this.destroyAll()
    })
  }

  attach(win: BrowserWindow): void {
    this.#win = win
    win.on('closed', () => {
      if (this.#win !== win) return
      this.destroyAll()
      this.#win = null
    })
  }

  spawn(url: unknown): BrowserBoot {
    const epoch = this.#epoch
    const existing = this.#activeTab()
    if (existing) return this.#boot(existing)

    const tab = this.#open(requiredUrl(url))
    if (this.#epoch !== epoch) {
      this.#destroyView(tab)
      throw new Error('El navegador se cerró')
    }
    return this.#boot(tab)
  }

  newTab(url: unknown): BrowserTabState {
    const epoch = this.#epoch
    const tab = this.#open(requiredUrl(url))
    if (this.#epoch !== epoch) {
      this.#destroyView(tab)
      throw new Error('El navegador se cerró')
    }
    this.#activate(tab.id)
    return this.#snapshot(tab)
  }

  command(command: BrowserCommand): void {
    if (command.cmd === 'close-tab') {
      this.#close(command.tabId)
      return
    }
    if (command.cmd === 'select-tab') {
      this.#activate(command.tabId)
      return
    }

    const tab = this.#tabs.get(command.tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return
    const contents = tab.view.webContents

    switch (command.cmd) {
      case 'navigate':
        this.#load(tab, command.url, 'navigation')
        break
      case 'back':
        if (contents.canGoBack()) contents.goBack()
        break
      case 'forward':
        if (contents.canGoForward()) contents.goForward()
        break
      case 'stop':
        contents.stop()
        break
      case 'reload':
        if (command.ignoreCache) contents.reloadIgnoringCache()
        else contents.reload()
        break
      case 'devtools':
        this.#devtools(tab, command.mode, command.action)
        break
      default:
        break
    }
  }

  bounds(payload: unknown): void {
    const next = readBounds(payload)
    if (!next) return
    const placement = placementFromBounds(next)
    if (!placement.attached) {
      this.#visible = false
      this.#detach()
      return
    }
    this.#visible = true
    this.#bounds = placement
    this.#syncAttachment()
  }

  focusApp(): void {
    const win = this.#win
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.focus()
  }

  focusPage(): void {
    const tab = this.#activeTab()
    if (!tab || tab.view.webContents.isDestroyed()) return
    tab.view.webContents.focus()
  }

  destroyAll(): void {
    this.#epoch += 1
    this.#visible = false
    const tabs = [...this.#tabs.values()]
    this.#tabs.clear()
    this.#order = []
    this.#active = null
    this.#detach()
    for (const tab of tabs) this.#destroyView(tab)
  }

  #open(url: string): Tab {
    const ses = session.fromPartition(BROWSER_PARTITION)
    installLockedSession(ses)
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        focusOnNavigation: false,
      },
    })
    const tab: Tab = {
      id: `tab-${++this.#seq}`,
      view,
      url,
      title: '',
      loading: true,
      canGoBack: false,
      canGoForward: false,
      error: null,
      committed: false,
    }
    this.#tabs.set(tab.id, tab)
    this.#order.push(tab.id)
    this.#active = tab.id
    this.#wire(tab)
    this.#load(tab, url, 'document')
    return tab
  }

  #wire(tab: Tab): void {
    const contents = tab.view.webContents
    const onShortcut = (_event: Electron.Event, input: Input): void => {
      const name: BrowserShortcutName | null = browserShortcutFromInput(input, process.platform)
      if (!name) return
      _event.preventDefault()
      this.#send(IpcChannel.browserShortcut, name)
    }

    contents.on('before-input-event', onShortcut)
    contents.on('devtools-opened', () => {
      const devtools = contents.devToolsWebContents
      if (devtools && !devtools.isDestroyed()) devtools.on('before-input-event', onShortcut)
      this.#syncAttachment()
      for (const delayMs of DOCK_RESYNC_MS) {
        const timer = setTimeout(() => this.#syncAttachment(), delayMs)
        timer.unref()
      }
    })
    contents.on('devtools-closed', () => this.#syncAttachment())
    contents.setWindowOpenHandler(({ url }) => {
      if (guestTabUrlAllowed(url)) {
        const opened = this.#open(url)
        this.#activate(opened.id)
        this.#send(IpcChannel.browserTabOpened, this.#snapshot(opened))
      }
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!guestNavigationAllowed(navigationUrl(event, url))) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!guestNavigationAllowed(navigationUrl(event, url))) event.preventDefault()
    })
    contents.on('will-frame-navigate', (event) => {
      if (event.isMainFrame && !guestNavigationAllowed(event.url)) event.preventDefault()
    })
    contents.on('did-start-loading', () => {
      tab.loading = true
      this.#emit(tab)
    })
    contents.on('did-stop-loading', () => {
      if (contents.isDestroyed()) return
      tab.loading = false
      tab.canGoBack = contents.canGoBack()
      tab.canGoForward = contents.canGoForward()
      this.#emit(tab)
    })
    contents.on('did-finish-load', () => {
      tab.error = null
      tab.loading = false
      this.#emit(tab)
    })
    contents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return
        tab.error = { kind: 'load', description: errorDescription }
        tab.loading = false
        this.#emit(tab)
      },
    )
    contents.on('did-navigate', (_event, next) => this.#commit(tab, contents, next))
    contents.on('did-navigate-in-page', (_event, next) => this.#commit(tab, contents, next))
    contents.on('page-title-updated', (_event, title) => {
      tab.title = title
      this.#emit(tab)
    })
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return
      tab.error = { kind: 'crash', status: details.reason }
      tab.loading = false
      this.#emit(tab)
    })
    contents.on('focus', () => {
      if (this.#active !== tab.id) return
      this.#send(IpcChannel.browserFocus)
    })
  }

  #commit(tab: Tab, contents: WebContents, next: string): void {
    if (contents.isDestroyed()) return
    if (!tab.committed && next === 'about:blank') return
    tab.committed = true
    tab.url = next
    tab.canGoBack = contents.canGoBack()
    tab.canGoForward = contents.canGoForward()
    this.#emit(tab)
  }

  #load(tab: Tab, url: string, kind: 'document' | 'navigation'): void {
    const allowed = kind === 'document' ? guestTabUrlAllowed(url) : guestNavigationAllowed(url)
    if (!allowed) {
      tab.error = { kind: 'load', description: 'URL no permitida' }
      tab.loading = false
      this.#emit(tab)
      return
    }
    tab.url = url
    tab.loading = true
    tab.error = null
    this.#emit(tab)
    const contents = tab.view.webContents
    if (contents.isDestroyed()) return
    void contents.loadURL(url).catch(() => {
      // `did-fail-load` publishes the failure. The rejection is the same event.
    })
  }

  #devtools(tab: Tab, mode: DevtoolsDock, action: BrowserDevtoolsAction): void {
    const contents = tab.view.webContents
    if (contents.isDestroyed()) return
    if (action === 'toggle' && contents.isDevToolsOpened()) {
      contents.closeDevTools()
      return
    }
    if (contents.isDevToolsOpened()) contents.closeDevTools()
    contents.openDevTools({ mode, activate: true })
  }

  #activate(id: string): void {
    if (!this.#tabs.has(id)) return
    this.#active = id
    this.#syncAttachment()
  }

  #close(id: string): void {
    const index = this.#order.indexOf(id)
    const tab = this.#tabs.get(id)
    if (index < 0 || !tab) return
    this.#order.splice(index, 1)
    this.#tabs.delete(id)
    if (this.#active === id) {
      this.#active = this.#order[index] ?? this.#order[index - 1] ?? null
    }
    if (this.#attached === tab.view) this.#detach()
    this.#syncAttachment()
    this.#destroyView(tab)
  }

  #syncAttachment(): void {
    const win = this.#win
    if (!win || win.isDestroyed()) return
    const next = this.#visible ? this.#activeView() : null
    if (!next || next.webContents.isDestroyed()) {
      this.#detach()
      return
    }
    next.setBounds(this.#bounds)
    if (this.#attached === next) return
    this.#detach()
    win.contentView.addChildView(next)
    this.#attached = next
  }

  #detach(): void {
    const win = this.#win
    const view = this.#attached
    this.#attached = null
    if (!view || !win || win.isDestroyed()) return
    try {
      win.contentView.removeChildView(view)
    } catch {
      // The window can drop the view when it closes.
    }
  }

  #destroyView(tab: Tab): void {
    const contents = tab.view.webContents
    if (contents.isDestroyed()) return
    if (contents.isDevToolsOpened()) contents.closeDevTools()
    // Electron 44 types expose `close`. `destroy` is still the forceful path when the
    // runtime provides it, and it does not wait for the page to allow the unload.
    const forceful = contents as WebContents & { destroy?: () => void }
    if (typeof forceful.destroy === 'function') forceful.destroy()
    else contents.close({ waitForBeforeUnload: false })
  }

  #activeTab(): Tab | null {
    if (!this.#active) return null
    return this.#tabs.get(this.#active) ?? null
  }

  #activeView(): WebContentsView | null {
    return this.#activeTab()?.view ?? null
  }

  #boot(tab: Tab): BrowserBoot {
    return { chromium: process.versions.chrome ?? '', tab: this.#snapshot(tab) }
  }

  #snapshot(tab: Tab): BrowserTabState {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      loading: tab.loading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      error: tab.error,
    }
  }

  #emit(tab: Tab): void {
    if (!this.#tabs.has(tab.id)) return
    this.#send(IpcChannel.browserState, this.#snapshot(tab))
  }

  #send(channel: string, payload?: unknown): void {
    const win = this.#win
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    if (payload === undefined) win.webContents.send(channel)
    else win.webContents.send(channel, payload)
  }
}

function requiredUrl(value: unknown): string {
  if (typeof value !== 'string' || !guestTabUrlAllowed(value)) {
    throw new Error('URL de navegador inválida')
  }
  return value
}

function navigationUrl(event: { url?: string }, url: unknown): string {
  if (typeof url === 'string') return url
  return typeof event.url === 'string' ? event.url : ''
}

function readBounds(value: unknown): BrowserBounds | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<BrowserBounds>
  const { x, y, width, height } = row
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null
  if (Math.abs(x) > 16000 || Math.abs(y) > 16000 || width > 16000 || height > 16000) return null
  if (width < 0 || height < 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    visible: row.visible === true,
  }
}

function asCommand(value: unknown): BrowserCommand {
  if (!value || typeof value !== 'object') throw new Error('Comando de navegador inválido')
  const row = value as Partial<BrowserCommand>
  if (typeof row.cmd !== 'string' || typeof row.tabId !== 'string' || row.tabId.length > 80) {
    throw new Error('Comando de navegador inválido')
  }
  const tabId = row.tabId
  switch (row.cmd) {
    case 'navigate':
      if (typeof row.url !== 'string') throw new Error('Comando de navegador inválido')
      return { cmd: 'navigate', tabId, url: row.url }
    case 'back':
    case 'forward':
    case 'stop':
    case 'close-tab':
    case 'select-tab':
      return { cmd: row.cmd, tabId }
    case 'reload':
      return { cmd: 'reload', tabId, ignoreCache: row.ignoreCache === true }
    case 'devtools': {
      const mode = resolveDevtoolsDock(row.mode)
      if (row.mode !== mode) throw new Error('Comando de navegador inválido')
      if (row.action !== 'toggle' && row.action !== 'set') {
        throw new Error('Comando de navegador inválido')
      }
      return { cmd: 'devtools', tabId, mode, action: row.action }
    }
    default:
      throw new Error('Comando de navegador inválido')
  }
}
