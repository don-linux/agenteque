import { clampFontPage, filterFontFamilies, sortFonts, type SystemFont } from '../shared/fonts'
import type { FontPageResult } from '../shared/ipc'

export class FontIndex {
  #faces = new Map<string, boolean>()
  #sorted: SystemFont[] | null = null
  scanning = true
  error: string | null = null

  add(family: string, monospace: boolean): void {
    const name = family.trim()
    if (name === '') return
    const next = (this.#faces.get(name) ?? false) || monospace
    if (this.#faces.get(name) === next) return
    this.#faces.set(name, next)
    this.#sorted = null
  }

  finish(error?: string): void {
    if (!this.scanning) return
    this.scanning = false
    if (error) this.error = error
  }

  page(query: string, offset: number, limit: number): FontPageResult {
    const range = clampFontPage(offset, limit)
    const matched = filterFontFamilies(this.#list(), query)
    return {
      families: matched.slice(range.offset, range.offset + range.limit),
      total: matched.length,
      scanning: this.scanning,
      ...(this.error && !this.scanning ? { error: this.error } : {}),
    }
  }

  #list(): SystemFont[] {
    if (!this.#sorted) {
      this.#sorted = sortFonts(
        [...this.#faces].map(([family, monospace]) => ({ family, monospace })),
      )
    }
    return this.#sorted
  }
}
