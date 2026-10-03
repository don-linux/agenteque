export interface ComboItem {
  value: string | null
  label: string
  previewFamily?: string
}

export function filterComboItems(items: readonly ComboItem[], query: string): ComboItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...items]
  return items.filter((item) => item.label.toLowerCase().includes(needle))
}

export function comboItemLabel(items: readonly ComboItem[], value: string | null): string {
  const found = items.find((item) => item.value === value)
  if (found) return found.label
  const trimmed = value?.trim()
  if (trimmed) return trimmed
  return items.find((item) => item.value === null)?.label ?? ''
}
