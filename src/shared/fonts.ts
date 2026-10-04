export interface SystemFont {
  family: string
  monospace: boolean
}

export const FONT_PAGE_SIZE = 40

export function sortFonts(fonts: readonly SystemFont[]): SystemFont[] {
  return fonts.toSorted((left, right) => {
    if (left.monospace !== right.monospace) return left.monospace ? -1 : 1
    const folded = left.family.toLowerCase().localeCompare(right.family.toLowerCase())
    if (folded !== 0) return folded
    if (left.family < right.family) return -1
    if (left.family > right.family) return 1
    return 0
  })
}

export function parseFcListLine(line: string): SystemFont | null {
  const trimmed = line.trim()
  if (trimmed === '') return null
  const tab = trimmed.indexOf('\t')
  if (tab <= 0) return null
  const family = trimmed.slice(0, tab).split(',')[0]?.trim() ?? ''
  if (family === '') return null
  const spacing = Number(trimmed.slice(tab + 1).trim())
  return { family, monospace: spacing === 100 || spacing === 110 }
}

export function filterFontFamilies(fonts: readonly SystemFont[], query: string): SystemFont[] {
  const needle = query.trim().toLowerCase().slice(0, 200)
  if (needle === '') return [...fonts]
  return fonts.filter((font) => font.family.toLowerCase().includes(needle))
}

export function clampFontPage(offset: number, limit: number): { offset: number; limit: number } {
  const start = Number.isFinite(offset) && offset > 0 ? Math.min(100_000, Math.floor(offset)) : 0
  const size =
    Number.isFinite(limit) && limit > 0 ? Math.min(10_000, Math.floor(limit)) : FONT_PAGE_SIZE
  return { offset: start, limit: size }
}
