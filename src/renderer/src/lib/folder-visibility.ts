export const FOLDER_VISIBILITY_LABEL = 'Carpetas visibles'

export const FOLDER_VISIBILITY_TOAST =
  'El árbol puede saturarse. Elige las carpetas del contexto con Carpetas visibles, el icono de carpeta con + junto a agenteque.'

export interface WorkspaceView {
  path: string
  visibleFolders: string[]
}

export function pathKeysMatch(left: string, right: string): boolean {
  if (left === right) return true

  return trimTrailingSeps(left) === trimTrailingSeps(right)
}

export function folderName(path: string): string {
  const trimmed = trimTrailingSeps(path)
  const parts = trimmed.split('/').filter(Boolean)
  return parts.at(-1) ?? path
}

export function visibilityFor(views: readonly WorkspaceView[], path: string): string[] | undefined {
  const match = views.find((view) => pathKeysMatch(view.path, path))
  return match?.visibleFolders
}

export function needsFolderPicker(dirs: readonly string[], saved: string[] | undefined): boolean {
  return dirs.length > 0 && saved === undefined
}

export function shouldShowFolderVisibilityToast(
  hasSubdirs: boolean,
  saved: string[] | undefined,
): boolean {
  return hasSubdirs && saved === undefined
}

/**
 * A new root folder stays invisible under an active filter unless it is added.
 * Nested creates do not change the filter: they already live inside a selected folder.
 */
export function includeCreatedRootFolder(
  visibleFolders: string[] | null,
  parent: string,
  name: string,
): string[] | null {
  if (visibleFolders === null || parent !== '') return visibleFolders
  if (visibleFolders.includes(name)) return visibleFolders
  return [...visibleFolders, name]
}

export function renameVisibleRootFolder(
  visibleFolders: string[] | null,
  from: string,
  to: string,
): string[] | null {
  if (visibleFolders === null || from === to) return visibleFolders
  if (!visibleFolders.includes(from)) return visibleFolders
  return visibleFolders.map((name) => (name === from ? to : name))
}

export function removeVisibleRootFolder(
  visibleFolders: string[] | null,
  name: string,
): string[] | null {
  if (visibleFolders === null) return visibleFolders
  if (!visibleFolders.includes(name)) return visibleFolders
  return visibleFolders.filter((entry) => entry !== name)
}

function trimTrailingSeps(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? path : trimmed
}
