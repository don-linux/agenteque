/**
 * `ui-monospace` no resuelve en todas las instalaciones de Windows, así que la
 * pila lleva detrás las dos monoespaciadas que sí están siempre allí.
 */
export const MONO_FALLBACK_STACK = 'ui-monospace, "Cascadia Mono", Consolas, monospace'

export const DEFAULT_XTERM_FONT_FAMILY = `"JetBrains Mono Variable", "JetBrains Mono", ${MONO_FALLBACK_STACK}`
export const DEFAULT_TERMINAL_FONT_SIZE = 13
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24
export const DEFAULT_FONT_LABEL = 'Predeterminada'

export interface SystemFont {
  family: string
  monospace: boolean
}

export function xtermFontFamily(name: string | null | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) return DEFAULT_XTERM_FONT_FAMILY

  const escaped = trimmed.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return `"${escaped}", ${MONO_FALLBACK_STACK}`
}

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_TERMINAL_FONT_SIZE
  return Math.min(MAX_TERMINAL_FONT_SIZE, Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(size)))
}

export function filterFonts(fonts: SystemFont[], query: string): SystemFont[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return fonts
  return fonts.filter((font) => font.family.toLowerCase().includes(needle))
}

export function fontLabel(family: string | null | undefined): string {
  const trimmed = family?.trim()
  return trimmed ? trimmed : DEFAULT_FONT_LABEL
}
