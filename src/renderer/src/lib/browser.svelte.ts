import { clearsRenderCrash } from '$lib/browser-errors'
import { displayUrl, normalizeUrlInput } from '$lib/browser-url'
import { inertBrowser } from '$lib/backend/inert-browser'
import type { BrowserBackend, BrowserCommand } from '$lib/backend/types'
import { folderVisibility } from '$lib/folder-visibility.svelte'
import { unsavedExit } from '$lib/unsaved-exit.svelte'
import { surface } from '$lib/workspace-surface.svelte'

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

/**
 * La mitad de interfaz del navegador. Los campos del motor (`alive`, `booting`,
 * historial) se conservan como estado inerte detrás de `BrowserBackend`: con la
 * implementación de esta etapa nunca se encienden, así que el cromo pinta su
 * estado apagado, que es justo la superficie que se quiere ver.
 */
class BrowserState {
  started = $state(false)
  alive = $state(false)
  booting = $state(false)
  error = $state<string | null>(null)
  url = $state('about:blank')
  inputUrl = $state('')
  title = $state('')
  loading = $state(false)
  canGoBack = $state(false)
  canGoForward = $state(false)
  focusUrlRequested = $state(0)
  pendingSpawn = $state(false)
  /** Único dueño del teclado: el cromo de la app o el motor. */
  focusOwner = $state<FocusOwner>('app')
  /** True mientras se devuelve el foco, para que `focusin` no lo reclame. */
  toolbarClaimBlocked = $state(false)

  visible = $derived(surface.current === 'browser' && !unsavedExit.open && !folderVisibility.open)

  #backend: BrowserBackend = inertBrowser
  #gen = 0

  enter(): void {
    surface.enterBrowser()
    this.started = true
    if (!this.alive && !this.booting) this.pendingSpawn = true
  }

  leave(): void {
    surface.leaveBrowser()
  }

  toggle(): void {
    if (surface.current === 'browser') {
      this.leave()
      return
    }
    this.enter()
  }

  async spawn(): Promise<void> {
    if (this.alive || this.booting) return

    const gen = ++this.#gen
    this.pendingSpawn = false
    this.booting = true
    this.error = null

    try {
      await this.#backend.spawn(this.url)
      if (gen !== this.#gen) return
      this.alive = true
      this.booting = false
    } catch (error) {
      if (gen !== this.#gen) return
      this.booting = false
      this.alive = false
      this.error = messageFrom(error)
    }
  }

  /** Botón «Reintentar» de la tira de error. */
  async respawn(): Promise<void> {
    this.#gen += 1
    this.alive = false
    this.booting = false
    this.error = null
    this.started = true
    this.pendingSpawn = true
    if (surface.current !== 'browser') surface.enterBrowser()

    try {
      await this.#backend.kill()
    } catch {
      // El motor puede haberse ido ya.
    }
  }

  async navigate(input: string): Promise<void> {
    const url = normalizeUrlInput(input)
    if (url === null) {
      if (input.trim().length > 0) this.error = 'Introduce una URL válida'
      return
    }

    this.url = url
    this.inputUrl = displayUrl(url)
    if (clearsRenderCrash(this.error)) this.error = null
    // Enter es una carga de la barra: las teclas pasan a la página.
    this.releaseChromeKeyboard()
    await this.#command({ cmd: 'navigate', url })
  }

  async back(): Promise<void> {
    if (!this.canGoBack) return
    await this.#command({ cmd: 'back' })
  }

  async forward(): Promise<void> {
    if (!this.canGoForward) return
    await this.#command({ cmd: 'forward' })
  }

  async reload(ignoreCache = false): Promise<void> {
    await this.#command({ cmd: 'reload', ignoreCache })
  }

  async stop(): Promise<void> {
    await this.#command({ cmd: 'stop' })
  }

  async devtools(): Promise<void> {
    await this.#command({ cmd: 'devtools' })
  }

  /** Ctrl+L: enfoca y selecciona la barra de direcciones. */
  claimUrlBar(): void {
    this.toolbarClaimBlocked = false
    this.focusOwner = 'app'
    this.focusUrlRequested += 1
    const url = urlBarElement()
    url?.focus?.()
    url?.select?.()
  }

  releaseChromeKeyboard(): void {
    this.focusOwner = 'browser'
    this.toolbarClaimBlocked = true
    blurActiveAppKeyboard()
  }

  claimChromeKeyboard(): void {
    this.focusOwner = 'app'
    this.toolbarClaimBlocked = false
  }

  async teardown(): Promise<void> {
    this.#gen += 1
    this.pendingSpawn = false
    this.started = false
    this.alive = false
    this.booting = false
    this.error = null
    this.url = 'about:blank'
    this.inputUrl = ''
    this.title = ''
    this.loading = false
    this.canGoBack = false
    this.canGoForward = false
    this.focusUrlRequested = 0
    this.focusOwner = 'app'
    this.toolbarClaimBlocked = false

    if (surface.current === 'browser') surface.set('editor')

    try {
      await this.#backend.kill()
    } catch {
      // El motor puede haberse ido ya.
    }
  }

  async #command(cmd: BrowserCommand): Promise<void> {
    if (!this.alive) return

    try {
      await this.#backend.command(cmd)
    } catch (error) {
      this.error = messageFrom(error)
    }
  }
}

export const browser = new BrowserState()
