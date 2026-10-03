import type { TreeNode } from '$lib/backend/types'

export const MARKDOWN_EXTENSION = '.md'

export type DraftKind = 'file' | 'dir'

/** An in-progress name the user is typing in the tree. `parent` is "" at the root. */
export interface TreeDraft {
  kind: DraftKind
  parent: string
}

export type TreeRowKind = 'dir' | 'file' | 'draft'

export interface TreeRow {
  kind: TreeRowKind
  /** Empty for the draft row: it has no path until the name is committed. */
  path: string
  name: string
  /** 0 at the root, one step per nesting level. */
  depth: number
  expanded: boolean
  draftKind?: DraftKind
}

export interface FlattenOptions {
  expanded: ReadonlySet<string>
  draft?: TreeDraft | null
}

function draftRow(draft: TreeDraft, depth: number): TreeRow {
  return {
    kind: 'draft',
    path: '',
    name: '',
    depth,
    expanded: false,
    draftKind: draft.kind,
  }
}

/**
 * The visible tree as a flat list, so rows can be full width and indented by
 * padding instead of nested lists. Collapsed directories hide their subtree.
 */
export function flattenTree(nodes: TreeNode[], options: FlattenOptions): TreeRow[] {
  const { expanded, draft = null } = options
  const rows: TreeRow[] = []

  function walk(children: TreeNode[], depth: number, parent: string): void {
    if (draft && draft.parent === parent) {
      rows.push(draftRow(draft, depth))
    }

    for (const node of children) {
      if (node.kind === 'file') {
        rows.push({ kind: 'file', path: node.path, name: node.name, depth, expanded: false })
        continue
      }

      const open = expanded.has(node.path)
      rows.push({ kind: 'dir', path: node.path, name: node.name, depth, expanded: open })

      if (open) walk(node.children, depth + 1, node.path)
    }
  }

  walk(nodes, 0, '')

  // A draft inside a collapsed or unknown folder would otherwise vanish.
  if (draft && draft.parent !== '' && !rows.some((row) => row.kind === 'draft')) {
    const index = rows.findIndex((row) => row.kind === 'dir' && row.path === draft.parent)
    if (index >= 0) {
      rows.splice(index + 1, 0, draftRow(draft, rows[index].depth + 1))
    } else {
      rows.push(draftRow(draft, 0))
    }
  }

  return rows
}

export function toggleExpanded(expanded: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(expanded)
  if (!next.delete(path)) next.add(path)
  return next
}

/** Every ancestor directory of a path, outermost first. `a/b/c.md` → `a`, `a/b`. */
export function ancestorsOf(path: string): string[] {
  const segments = path.split('/').filter((segment) => segment.length > 0)
  segments.pop()

  const ancestors: string[] = []
  let current = ''

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    ancestors.push(current)
  }

  return ancestors
}

/** Expands whatever it takes to make `path` visible. */
export function revealPath(expanded: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(expanded)
  for (const ancestor of ancestorsOf(path)) next.add(ancestor)
  return next
}

export function parentDirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '' : path.slice(0, index)
}

export function baseNameOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? path : path.slice(index + 1)
}

/**
 * Name of the opened folder, for the sidebar header: the full absolute path is
 * too long to read. Trims trailing `/` and splits only on `/`.
 */
export function folderNameOf(root: string): string {
  const trimmed = root.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  const name = index < 0 ? trimmed : trimmed.slice(index + 1)
  return name || trimmed || root
}

export function joinTreePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

/** Path the tree treats as selected. `null` is root focus: no row is marked. */
export function selectedTreePath(focused: string | null): string | null {
  return focused
}

/** Where a new entry lands when the user has a file or folder selected. */
export function draftParentFor(
  selected: string | null,
  isDirectory: (path: string) => boolean,
): string {
  if (!selected) return ''
  if (isDirectory(selected)) return selected
  return parentDirOf(selected)
}

export type DraftCommandSource = 'toolbar' | 'blank'

/**
 * Create parent for a command. The blank context menu is always the root;
 * the toolbar follows the tree focus (folder, file parent, or root).
 */
export function draftParentForCommand(
  source: DraftCommandSource,
  focused: string | null,
  isDirectory: (path: string) => boolean,
): string {
  if (source === 'blank') return ''
  return draftParentFor(selectedTreePath(focused), isDirectory)
}

export function hasMarkdownExtension(name: string): boolean {
  return name.toLowerCase().endsWith(MARKDOWN_EXTENSION)
}

export type NewNameResult = { ok: true; name: string } | { ok: false; error: string }

/**
 * Cleans up what the user typed in the tree. Nested names like `a/b.md` are
 * allowed; traversal (`..`), empty segments, and `//` are not. `\\` is a legal
 * filename character, not a path separator.
 */
export function normalizeNewName(raw: string, kind: DraftKind): NewNameResult {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '')

  if (trimmed.length === 0) return { ok: false, error: 'Escribe un nombre' }
  if (trimmed.includes('//')) return { ok: false, error: 'Ruta inválida' }

  const segments = trimmed.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return { ok: false, error: 'Ruta inválida' }
  }
  if (segments.some((segment) => segment.trim().length === 0)) {
    return { ok: false, error: 'Ruta inválida' }
  }

  if (kind === 'dir') return { ok: true, name: trimmed }

  const name = hasMarkdownExtension(trimmed) ? trimmed : `${trimmed}${MARKDOWN_EXTENSION}`
  if (name === MARKDOWN_EXTENSION) return { ok: false, error: 'Escribe un nombre' }

  return { ok: true, name }
}

function childrenAt(nodes: TreeNode[], parent: string): TreeNode[] {
  if (parent === '') return nodes

  for (const node of nodes) {
    if (node.kind !== 'dir') continue
    if (node.path === parent) return node.children
    if (parent.startsWith(`${node.path}/`)) return childrenAt(node.children, parent)
  }

  return []
}

/**
 * Insensible a mayúsculas: en Windows y macOS `Notas.md` y `notas.md` son el
 * mismo fichero. En Linux queda algo más estricto de lo necesario, que es el
 * lado seguro del error.
 */
export function sameEntryName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

export function siblingExists(nodes: TreeNode[], parent: string, name: string): boolean {
  return siblingExistsExcept(nodes, parent, name, null)
}

/** Como `siblingExists`, pero un renombrado puede conservar su propio nombre. */
export function siblingExistsExcept(
  nodes: TreeNode[],
  parent: string,
  name: string,
  exceptPath: string | null,
): boolean {
  return childrenAt(nodes, parent).some((node) => {
    if (exceptPath !== null && node.path === exceptPath) return false
    return sameEntryName(node.name, name)
  })
}

/**
 * El alta con segmentos intermedios (`NOTAS/nueva.md`, `README.md/extra.md`)
 * se rechaza entero si un tramo choca sin distinguir mayúsculas con un hermano,
 * o si un fichero iba a convertirse en ancestro. Un padre que aún no existe
 * deja libre el resto: no hay con quién chocar debajo.
 */
export function createPathConflict(nodes: TreeNode[], path: string): string | null {
  const segments = path.split('/')
  let level = nodes

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? ''
    const isLast = index === segments.length - 1
    const child = level.find((node) => sameEntryName(node.name, segment))
    if (!child) return null

    if (!isLast) {
      if (child.kind !== 'dir' || child.name !== segment) {
        return `\`${segment}\` ya existe`
      }
      level = child.children
      continue
    }

    return `\`${segment}\` ya existe`
  }

  return null
}

/**
 * Cleans a rename typed in the tree. Unlike create, `/` is refused: this is
 * a same-folder rename, not a move. `\\` is allowed in the name.
 */
export function normalizeRenameName(raw: string, kind: DraftKind): NewNameResult {
  const trimmed = raw.trim()

  if (trimmed.length === 0) return { ok: false, error: 'Escribe un nombre' }
  if (trimmed.includes('/')) {
    return { ok: false, error: 'El nombre no puede llevar `/`' }
  }
  if (trimmed === '.' || trimmed === '..') return { ok: false, error: 'Ruta inválida' }

  if (kind === 'dir') return { ok: true, name: trimmed }

  const name = hasMarkdownExtension(trimmed) ? trimmed : `${trimmed}${MARKDOWN_EXTENSION}`
  if (name === MARKDOWN_EXTENSION) return { ok: false, error: 'Escribe un nombre' }

  return { ok: true, name }
}

/** `docs` → `notas` also rewrites `docs/guia.md` to `notas/guia.md`. */
export function remapPathPrefix(path: string, from: string, to: string): string {
  if (path === from) return to
  if (from.length > 0 && path.startsWith(`${from}/`)) {
    return `${to}${path.slice(from.length)}`
  }
  return path
}

export function pathIsUnder(path: string, folder: string): boolean {
  return path === folder || (folder.length > 0 && path.startsWith(`${folder}/`))
}

export type DropTarget = { kind: 'file' | 'dir'; path: string } | { kind: 'root' }

/** Folder that receives a drop: the folder itself, a file's parent, or the tree root. */
export function dropParentFor(target: DropTarget): string {
  if (target.kind === 'root') return ''
  if (target.kind === 'dir') return target.path
  return parentDirOf(target.path)
}

export type MoveCheck = { ok: true; to: string } | { ok: false; reason: 'noop' | 'self' }

export type PlanMove = { ok: true; to: string } | { ok: false; reason: 'noop' | 'self' | 'exists' }

/** Whether `from` can land in `toParent`. Same folder is a no-op; a folder cannot enter itself. */
export function canMoveEntry(from: string, kind: DraftKind, toParent: string): MoveCheck {
  const to = joinTreePath(toParent, baseNameOf(from))
  if (to === from) return { ok: false, reason: 'noop' }
  if (kind === 'dir' && pathIsUnder(toParent, from)) return { ok: false, reason: 'self' }
  return { ok: true, to }
}

/** `canMoveEntry` más una colisión de nombre en el destino. */
export function planMove(
  nodes: TreeNode[],
  from: string,
  kind: DraftKind,
  toParent: string,
): PlanMove {
  const check = canMoveEntry(from, kind, toParent)
  if (!check.ok) return check
  if (siblingExists(nodes, toParent, baseNameOf(from))) {
    return { ok: false, reason: 'exists' }
  }
  return check
}

/** First click activates; a second click inside this window must not (it is a double-click). */
export const DOUBLE_CLICK_MS = 400

export interface RowClickStamp {
  path: string
  at: number
}

/** True when this click is the second half of a double-click on the same row. */
export function isSameRowDoubleClick(
  previous: RowClickStamp | null,
  path: string,
  now: number,
  intervalMs = DOUBLE_CLICK_MS,
): boolean {
  if (previous === null) return false
  if (previous.path !== path) return false
  const delta = now - previous.at
  return delta >= 0 && delta < intervalMs
}
