/** Segmentos POSIX relativos. Rechaza absoluto, vacío, `.`, `..` y barras invertidas. */
export function relativeParts(relative: string): string[] | null {
  if (relative === '' || relative.startsWith('/') || relative.includes('\\')) return null
  const parts = relative.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
  return parts
}

export function isMarkdownName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return name.slice(dot + 1).toLowerCase() === 'md'
}

export const SKIP_DIRECTORIES: readonly string[] = [
  '.git',
  'node_modules',
  'target',
  'dist',
  '.svelte-kit',
]

export function isSkippedDirectory(name: string): boolean {
  return SKIP_DIRECTORIES.includes(name)
}

export function sameEntryName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

/**
 * `path.relative(root, target)` vacío es la propia raíz. `..` o un absoluto
 * (otro disco en Windows) significa que el destino salió de ella.
 */
export function escapesRoot(relativeFromRoot: string): boolean {
  if (relativeFromRoot === '') return false
  const normalized = relativeFromRoot.replaceAll('\\', '/')
  if (normalized === '..' || normalized.startsWith('../')) return true
  if (normalized.startsWith('/')) return true
  return /^[A-Za-z]:/.test(normalized)
}
