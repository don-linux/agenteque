export const DEFAULT_PLATFORM = 'linux'

/**
 * `process.platform` tal y como lo expone el preload. Se fija una sola vez al
 * arrancar el renderer: olfatear el user agent está deprecado y además miente.
 */
let platform: string = DEFAULT_PLATFORM

export function setPlatform(next: string | undefined | null): void {
  platform = typeof next === 'string' && next !== '' ? next : DEFAULT_PLATFORM
}

export function currentPlatform(): string {
  return platform
}

export function isMacPlatform(target: string = platform): boolean {
  return target === 'darwin'
}

export interface ModifierEvent {
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * El modificador principal de cada sistema: Cmd en macOS, Ctrl en el resto.
 * Exigir `ctrlKey && !metaKey` en todas partes dejaría a macOS sin un solo
 * atajo de la aplicación.
 */
export function isPrimaryModifier(event: ModifierEvent, target: string = platform): boolean {
  return isMacPlatform(target) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

const MAC_KEY_SYMBOLS: Record<string, string> = {
  ctrl: '⌘',
  cmd: '⌘',
  meta: '⌘',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
}

/**
 * Traduce un acorde escrito en forma Windows/Linux (`Ctrl+Shift+T`) a lo que
 * espera ver cada sistema. En macOS se usan los símbolos y sin separador.
 */
export function shortcutLabel(chord: string, target: string = platform): string {
  if (!isMacPlatform(target)) return chord

  return chord
    .split('+')
    .map((part) => MAC_KEY_SYMBOLS[part.trim().toLowerCase()] ?? part.trim())
    .join('')
}
