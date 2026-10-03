import { isPrimaryModifier } from '$lib/platform'

export interface SaveShortcutEvent {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation?: () => void
}

export function isSaveShortcut(event: {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): boolean {
  return event.code === 'KeyS' && isPrimaryModifier(event) && !event.shiftKey
}

export function handleSaveShortcut(event: SaveShortcutEvent, ctx: { save: () => void }): void {
  if (!isSaveShortcut(event)) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  ctx.save()
}
