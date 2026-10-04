import { appConfig } from '$lib/app-config.svelte'
import { formatTabError } from '$lib/browser-errors'
import { planTabClose, reloadIgnoresCache } from '$lib/browser-tabs'
import { displayUrl, normalizeUrlInput } from '$lib/browser-url'
import { inertBrowser } from '$lib/backend/inert-browser'
import type {
  BrowserBackend,
  BrowserBounds,
  BrowserCommand,
  BrowserTabState,
} from '$lib/backend/types'
import { folderVisibility } from '$lib/folder-visibility.svelte'
import { unsavedExit } from '$lib/unsaved-exit.svelte'
import { surface } from '$lib/workspace-surface.svelte'
import {
  BROWSER_HOME_URL,
  type BrowserShortcutName,
  shouldKillGuest,
} from '../../../shared/browser'
import type { BrowserReload, DevtoolsDock } from '../../../shared/config'

export type { BrowserCommand }

export type FocusOwner = 'app' | 'browser'

/** Campo de la barra que no debe retener el teclado cuando el motor lo reclama. */
export type KeyboardTarget = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
  blur?: () => void
  focus?: () => void
  select?: () => void
  selectionStart?: number | null
  selectionEnd?: number | null
  querySelector?: (selector: string) => KeyboardTarget | null
}

export function isAppKeyboardTarget(el: KeyboardTarget | null | undefined): boolean {
  if (!el) return false
  if (typeof el.closest === 'function' && el.closest('[data-browser-toolbar]')) return true
  const tag = el.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return el.isContentEditable === true
}

export function shouldClaimAppFocus(owner: FocusOwner): boolean {
  return owner !== 'app'
}

/** Un blur programático con `owner=browser` no debe parecer un clic en la barra. */
export function shouldHandleToolbarFocusIn(owner: FocusOwner, blocked: boolean): boolean {
  return !blocked && shouldClaimAppFocus(owner)
}

/** Respaldo de `attachUrl`: solo cuando Ctrl+L incrementa el contador. */
export function shouldApplyFocusUrlRequest(requested: number, lastApplied: number): boolean {
  return requested !== 0 && requested !== lastApplied
}

export function isUrlBarElement(el: KeyboardTarget | null | undefined): boolean {
  return Boolean(el && typeof el.closest === 'function' && el.closest('[data-browser-url]'))
}

function pageDocument(): {
  activeElement?: KeyboardTarget | null
  querySelector?: (selector: string) => KeyboardTarget | null
} | null {
  if (typeof document === 'undefined') return null
  return document
}

function blurActiveAppKeyboard(): void {
  const active = pageDocument()?.activeElement ?? null
  if (active == null || !isAppKeyboardTarget(active)) return
  active.blur?.()
}

function urlBarElement(): KeyboardTarget | null {
  return pageDocument()?.querySelector?.('[data-browser-url]') ?? null
}

function messageFrom(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

class BrowserState {
  started = $state(false)
  alive = $state(false)
  booting = $state(false)
  notice = $state<string | null>(null)
  tabs = $state<BrowserTabState[]>([])
  activeId = $state<string | null>(null)
  inputUrl = $state('')
  editingUrl = $state(false)
  closeRequested = $state(false)
  /** El menú de la barra tapa el hueco: la vista nativa se desmonta mientras está abierto. */
  menuOpen = $state(false)
  menu = $state<null | { kind: 'reload' | 'devtools'; x: number; y: number }>(null)
  focusUrlRequested = $state(0)
  pendingSpawn = $state(false)
  /** Único dueño del teclado: el cromo de la app o el motor. */
  focusOwner = $state<FocusOwner>('app')
  /** True mientras se devuelve el foco, para que `focusin` no lo reclame. */
  toolbarClaimBlocked = $state(false)

  active = $derived(this.tabs.find((tab) => tab.id === this.activeId) ?? null)
  url = $derived(this.active?.url ?? 'about:blank')
  title = $derived(this.active?.title ?? '')
  loading = $derived(this.active?.loading ?? false)
  canGoBack = $derived(this.active?.canGoBack ?? false)
  canGoForward = $derived(this.active?.canGoForward ?? false)
  error = $derived(this.notice ?? formatTabError(this.active?.error ?? null))
  visible = $derived(
    surface.current === 'browser' &&
      !unsavedExit.open &&
      !folderVisibility.open &&
      !this.closeRequested,
  )

  #backend: BrowserBackend = inertBrowser
  #gen = 0
  #stop: (() => void) | null = null
  /** Eventos que llegan antes de que `spawn` devuelva la pestaña. */
  #pending = new Map<string, BrowserTabState>()

  use(backend: BrowserBackend): void {
    this.#stop?.()
    this.#backend = backend
    this.#stop = backend.subscribe({
      state: (tab) => this.#onState(tab),
      shortcut: (name) => this.#onShortcut(name),
      focus: () => this.#onGuestFocus(),
      tabOpened: (tab) => this.#addTab(tab),
    })
  }

  enter(): void {
    surface.enterBrowser()
    this.started = true
    if (this.tabs.length > 0) {
      this.alive = true
      this.pendingSpawn = false
      return
    }
    if (!this.alive && !this.booting) this.pendingSpawn = true
  }

  leave(): void {
    this.closeChromeMenu()
    if (shouldKillGuest('hide')) void this.#destroyEngine()
    surface.leaveBrowser()
  }

  toggle(): void {
    if (this.closeRequested) this.closeRequested = false
    if (surface.current === 'browser') {
      this.leave()
      return
    }
    this.enter()
  }

  async spawn(): Promise<void> {
    if (this.alive || this.booting || this.tabs.length > 0) return

    const gen = ++this.#gen
    this.pendingSpawn = false
    this.booting = true
    this.notice = null

    try {
      const boot = await this.#backend.spawn(BROWSER_HOME_URL)
      if (gen !== this.#gen) {
        await this.#dropTab(boot.tab.id)
        return
      }
      this.#addTab(boot.tab)
      this.booting = false
    } catch (error) {
      if (gen !== this.#gen) return
      this.booting = false
      this.alive = false
      this.notice = messageFrom(error)
    }
  }

  async newTab(url: string = BROWSER_HOME_URL): Promise<boolean> {
    const gen = this.#gen
    try {
      const tab = await this.#backend.newTab(url)
      if (gen !== this.#gen) {
        await this.#dropTab(tab.id)
        return false
      }
      this.#addTab(tab)
      return true
    } catch (error) {
      if (gen !== this.#gen) return false
      this.notice = messageFrom(error)
      return false
    }
  }

  async closeTab(id: string): Promise<void> {
    const plan = planTabClose(this.tabs, id, this.activeId)
    if (!plan) return
    if (plan.replace) {
      const opened = await this.newTab(BROWSER_HOME_URL)
      if (!opened || !this.tabs.some((tab) => tab.id !== id)) return
    }

    try {
      await this.#backend.command({ cmd: 'close-tab', tabId: id })
    } catch (error) {
      this.notice = messageFrom(error)
      return
    }

    const nextActive = this.activeId === id ? plan.activeId : this.activeId
    this.#pending.delete(id)
    this.tabs = this.tabs.filter((tab) => tab.id !== id)
    if (this.activeId === id) {
      this.activeId = nextActive
      const active = this.tabs.find((tab) => tab.id === nextActive)
      this.editingUrl = false
      this.inputUrl = active ? displayUrl(active.url) : ''
    }
  }

  async selectTab(id: string): Promise<void> {
    const tab = this.tabs.find((item) => item.id === id)
    if (!tab) return
    this.activeId = id
    this.editingUrl = false
    this.inputUrl = displayUrl(tab.url)
    await this.#command({ cmd: 'select-tab', tabId: id })
  }

  async navigate(input: string): Promise<void> {
    const url = normalizeUrlInput(input)
    if (url === null) {
      if (input.trim().length > 0) this.notice = 'Introduce una URL válida'
      return
    }
    if (!this.activeId) return

    this.notice = null
    this.editingUrl = false
    this.inputUrl = displayUrl(url)
    this.releaseChromeKeyboard()
    await this.#command({ cmd: 'navigate', tabId: this.activeId, url })
    await this.#backend.focusPage()
  }

  async back(): Promise<void> {
    if (!this.canGoBack || !this.activeId) return
    await this.#command({ cmd: 'back', tabId: this.activeId })
  }

  async forward(): Promise<void> {
    if (!this.canGoForward || !this.activeId) return
    await this.#command({ cmd: 'forward', tabId: this.activeId })
  }

  async reload(ignoreCache = reloadIgnoresCache(appConfig.browserReload)): Promise<void> {
    if (!this.activeId) return
    await this.#command({ cmd: 'reload', tabId: this.activeId, ignoreCache })
  }

  async chooseReload(mode: BrowserReload): Promise<void> {
    await appConfig.saveBrowser({
      devtoolsDock: appConfig.browserDevtoolsDock,
      reload: mode,
    })
    if (!this.alive || !this.activeId) return
    await this.#command({
      cmd: 'reload',
      tabId: this.activeId,
      ignoreCache: reloadIgnoresCache(mode),
    })
  }

  async stop(): Promise<void> {
    if (!this.activeId) return
    await this.#command({ cmd: 'stop', tabId: this.activeId })
  }

  async devtools(): Promise<void> {
    if (!this.activeId) return
    await this.#command({
      cmd: 'devtools',
      tabId: this.activeId,
      mode: appConfig.browserDevtoolsDock,
      action: 'toggle',
    })
  }

  async chooseDevtools(mode: DevtoolsDock): Promise<void> {
    await appConfig.saveBrowser({
      devtoolsDock: mode,
      reload: appConfig.browserReload,
    })
    if (!this.alive || !this.activeId) return
    await this.#command({
      cmd: 'devtools',
      tabId: this.activeId,
      mode,
      action: 'set',
    })
  }

  /** Botón «Reintentar» de la tira de error. No tira el resto de pestañas. */
  async respawn(): Promise<void> {
    this.notice = null
    if (this.activeId) {
      await this.#command({ cmd: 'reload', tabId: this.activeId, ignoreCache: true })
      return
    }
    this.booting = false
    this.alive = false
    this.started = true
    this.pendingSpawn = true
    if (surface.current !== 'browser') surface.enterBrowser()
  }

  /**
   * Ctrl+L y el primer clic en la barra: el `webContents` de la app primero,
   * y solo después el input, para que el guest no se quede el teclado.
   */
  async claimUrlBar(selectAll = true): Promise<void> {
    this.toolbarClaimBlocked = false
    this.focusOwner = 'app'
    this.editingUrl = true
    await this.#backend.focusApp()
    this.focusUrlRequested += 1
    const url = urlBarElement()
    url?.focus?.()
    if (selectAll) url?.select?.()
  }

  finishUrlEdit(): void {
    if (!this.editingUrl) return
    this.editingUrl = false
    this.inputUrl = displayUrl(this.url)
  }

  releaseChromeKeyboard(): void {
    this.focusOwner = 'browser'
    this.toolbarClaimBlocked = true
    blurActiveAppKeyboard()
  }

  claimChromeKeyboard(): void {
    this.focusOwner = 'app'
    this.toolbarClaimBlocked = false
    void this.#backend.focusApp()
  }

  reportBounds(bounds: BrowserBounds): void {
    this.#backend.bounds(bounds)
  }

  openChromeMenu(kind: 'reload' | 'devtools', x: number, y: number): void {
    this.menu = { kind, x, y }
    this.menuOpen = true
  }

  closeChromeMenu(): void {
    this.menu = null
    this.menuOpen = false
  }

  requestClose(): void {
    this.closeChromeMenu()
    if (!this.alive && this.tabs.length === 0 && !this.booting) {
      this.leave()
      return
    }
    this.closeRequested = true
  }

  cancelClose(): void {
    this.closeRequested = false
  }

  async confirmClose(): Promise<void> {
    this.closeRequested = false
    this.leave()
    if (shouldKillGuest('confirm-close')) await this.#destroyEngine()
  }

  async teardown(): Promise<void> {
    this.closeRequested = false
    await this.#destroyEngine()
    if (surface.current === 'browser') surface.set('editor')
  }

  #onState(tab: BrowserTabState): void {
    if (!this.tabs.some((item) => item.id === tab.id)) {
      this.#pending.set(tab.id, tab)
      return
    }
    this.#pending.delete(tab.id)
    this.tabs = this.tabs.map((item) => (item.id === tab.id ? tab : item))
    if (this.activeId === tab.id && !this.editingUrl) this.inputUrl = displayUrl(tab.url)
  }

  #addTab(tab: BrowserTabState): void {
    const pending = this.#pending.get(tab.id)
    this.#pending.delete(tab.id)
    const next = pending ?? tab
    if (this.tabs.some((item) => item.id === next.id)) {
      this.tabs = this.tabs.map((item) => (item.id === next.id ? next : item))
    } else {
      this.tabs = [...this.tabs, next]
    }
    this.activeId = next.id
    this.editingUrl = false
    this.inputUrl = displayUrl(next.url)
    this.notice = null
    this.alive = true
    this.booting = false
  }

  #onShortcut(name: BrowserShortcutName): void {
    switch (name) {
      case 'toggle':
      case 'toggle-anywhere':
        this.toggle()
        break
      case 'focus-url':
        void this.claimUrlBar()
        break
      case 'devtools':
        void this.devtools()
        break
      default:
        break
    }
  }

  /** El guest ya tiene el foco. No volvemos a pedirlo: sería un bucle. */
  #onGuestFocus(): void {
    this.focusOwner = 'browser'
    this.toolbarClaimBlocked = true
    blurActiveAppKeyboard()
  }

  async #dropTab(id: string): Promise<void> {
    try {
      await this.#backend.command({ cmd: 'close-tab', tabId: id })
    } catch {
      // La pestaña ya no está.
    }
  }

  async #destroyEngine(): Promise<void> {
    this.#gen += 1
    this.pendingSpawn = false
    this.started = false
    this.alive = false
    this.booting = false
    this.notice = null
    this.tabs = []
    this.activeId = null
    this.#pending.clear()
    this.inputUrl = ''
    this.editingUrl = false
    this.focusUrlRequested = 0
    this.closeChromeMenu()
    this.focusOwner = 'app'
    this.toolbarClaimBlocked = false

    try {
      await this.#backend.kill()
    } catch {
      // El motor puede haberse ido ya.
    }
  }

  async #command(command: BrowserCommand): Promise<void> {
    if (!this.alive && command.cmd !== 'close-tab') return

    try {
      await this.#backend.command(command)
    } catch (error) {
      this.notice = messageFrom(error)
    }
  }
}

export const browser = new BrowserState()
