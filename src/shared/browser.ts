export const BROWSER_HOME_URL = 'https://www.google.com'
export const BROWSER_PARTITION = 'persist:agenteque-browser'
const MAX_GUEST_URL_LENGTH = 4096

export type BrowserShortcutName = 'toggle' | 'toggle-anywhere' | 'focus-url' | 'devtools'

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export interface BrowserKeyInput {
  type?: string
  code?: string
  key?: string
  keyCode?: string
  isAutoRepeat?: boolean
  control?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  modifiers?: readonly string[]
}

/**
 * Ctrl+B esconde el navegador y deja las pestañas vivas. Solo confirmar el
 * cierre destruye los WebContents.
 */
export function keepsGuestAlive(action: 'hide' | 'cancel-close' | 'confirm-close'): boolean {
  return action !== 'confirm-close'
}

/** Confirmar la X mata los guests. Esconderlos con Ctrl+B no. */
export function shouldKillGuest(action: 'hide' | 'cancel-close' | 'confirm-close'): boolean {
  return !keepsGuestAlive(action)
}

export function guestNavigationAllowed(raw: string): boolean {
  if (raw.length === 0 || raw.length > MAX_GUEST_URL_LENGTH) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.username !== '' || url.password !== '') return false
  if (url.protocol === 'about:') return url.href === 'about:blank'
  return url.protocol === 'http:' || url.protocol === 'https:'
}

/** Una pestaña nueva solo abre http(s). `about:blank` no cuenta como destino. */
export function guestTabUrlAllowed(raw: string): boolean {
  if (!guestNavigationAllowed(raw)) return false
  return raw.startsWith('http://') || raw.startsWith('https://')
}

/**
 * Un rectángulo fuera de la ventana, o con lado cero, no se monta: el slot
 * aparcado vive en `left: -12000px` y un WebContentsView no sigue el CSS.
 */
export function placementFromBounds(
  bounds: BrowserBounds,
): { attached: false } | { attached: true; x: number; y: number; width: number; height: number } {
  if (!bounds.visible || bounds.width < 1 || bounds.height < 1 || bounds.x < 0 || bounds.y < 0) {
    return { attached: false }
  }
  return {
    attached: true,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

export function browserShortcutFromInput(
  input: BrowserKeyInput,
  platform: string,
): BrowserShortcutName | null {
  if (
    input.isAutoRepeat ||
    input.modifiers?.includes('isAutoRepeat') ||
    input.modifiers?.includes('isautorepeat')
  ) {
    return null
  }
  if (input.type !== undefined && input.type !== 'keyDown') return null

  const flags = modifierFlags(input, platform)
  if (flags.alt) return null

  const code = input.code ?? ''
  const key = input.key || input.keyCode || ''
  if (!flags.primary && !flags.shift && (code === 'F12' || key === 'F12')) return 'devtools'
  if (!flags.primary) return null

  const isB = code === 'KeyB' || key === 'b' || key === 'B'
  const isL = code === 'KeyL' || key === 'l' || key === 'L'
  if (isB && flags.shift) return 'toggle-anywhere'
  if (isB && !flags.shift) return 'toggle'
  if (isL && !flags.shift) return 'focus-url'
  return null
}

function modifierFlags(
  input: BrowserKeyInput,
  platform: string,
): { primary: boolean; shift: boolean; alt: boolean } {
  let ctrl = input.control === true
  let meta = input.meta === true
  let shift = input.shift === true
  let alt = input.alt === true
  for (const modifier of input.modifiers ?? []) {
    switch (modifier) {
      case 'control':
      case 'ctrl':
        ctrl = true
        break
      case 'meta':
      case 'cmd':
      case 'command':
        meta = true
        break
      case 'shift':
        shift = true
        break
      case 'alt':
      case 'option':
        alt = true
        break
      default:
        break
    }
  }
  const primary = platform === 'darwin' ? meta && !ctrl : ctrl && !meta
  return { primary, shift, alt }
}
