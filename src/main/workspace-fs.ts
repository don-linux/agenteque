import { randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
  type Dirent,
  type FSWatcher,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'
import {
  escapesRoot,
  isMarkdownName,
  isSkippedDirectory,
  relativeParts,
  sameEntryName,
} from '../shared/workspace-path'

export interface WorkspaceDirs {
  root: string
  dirs: string[]
}

export interface TreeNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  children: TreeNode[]
}

const listeners = new Set<(root: string) => void>()
let watcher: FSWatcher | null = null
let watchedRoot: string | null = null
let watchTimer: ReturnType<typeof setTimeout> | null = null

function fail(message: string): never {
  throw new Error(message)
}

function requireDirectory(root: string): string {
  const trimmed = root.trim()
  if (trimmed === '') fail('Falta la carpeta')
  let real: string
  try {
    real = realpathSync(trimmed)
  } catch {
    fail(`No existe la carpeta \`${trimmed}\``)
  }
  let info
  try {
    info = statSync(real)
  } catch {
    fail(`No existe la carpeta \`${trimmed}\``)
  }
  if (!info.isDirectory()) fail(`No existe la carpeta \`${trimmed}\``)
  return real
}

function partsOf(relativePath: string): string[] {
  const parts = relativeParts(relativePath)
  if (!parts) fail('Ruta inválida')
  return parts
}

function joinRelative(root: string, relativePath: string): string {
  return join(root, ...partsOf(relativePath))
}

function contained(root: string, target: string): string {
  let real: string
  try {
    real = realpathSync(target)
  } catch {
    fail('Ruta inválida')
  }
  if (escapesRoot(relative(root, real))) fail('Ruta inválida')
  return real
}

function existingAncestor(target: string): string {
  let current = target
  while (true) {
    try {
      lstatSync(current)
      return realpathSync(current)
    } catch {
      const parent = join(current, '..')
      if (parent === current) fail('La carpeta destino no existe')
      current = parent
    }
  }
}

function assertInside(root: string, target: string): void {
  const anchor = existingAncestor(target)
  if (escapesRoot(relative(root, anchor))) fail('Ruta inválida')
}

function readEntries(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function byName(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function placeNew(root: string, parts: string[], except?: string): string {
  let directory = root
  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index] ?? ''
    const isLast = index === parts.length - 1
    const hit = readEntries(directory).find((entry) => sameEntryName(entry.name, segment))
    if (hit && isLast && except && hit.name === except) return join(directory, segment)
    if (hit && !isLast) {
      if (hit.name !== segment || !hit.isDirectory() || hit.isSymbolicLink()) {
        fail(`\`${segment}\` ya existe`)
      }
      directory = join(directory, hit.name)
      continue
    }
    if (hit) fail(`\`${segment}\` ya existe`)
    return join(directory, ...parts.slice(index))
  }
  return directory
}

function collect(directory: string, prefix: string): TreeNode[] {
  const nodes: TreeNode[] = []
  for (const entry of readEntries(directory)) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (isSkippedDirectory(entry.name)) continue
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      nodes.push({
        name: entry.name,
        path,
        kind: 'dir',
        children: collect(join(directory, entry.name), path),
      })
      continue
    }
    if (!entry.isFile() || !isMarkdownName(entry.name)) continue
    nodes.push({
      name: entry.name,
      path: prefix === '' ? entry.name : `${prefix}/${entry.name}`,
      kind: 'file',
      children: [],
    })
  }

  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
    return byName(left.name, right.name)
  })
  return nodes
}

function filterTop(nodes: TreeNode[], include: ReadonlySet<string> | null): TreeNode[] {
  if (include === null) return nodes
  return nodes.filter((node) => node.kind === 'file' || include.has(node.name))
}

export function listWorkspaceDirs(root: string): WorkspaceDirs {
  const real = requireDirectory(root)
  const dirs = readEntries(real)
    .filter(
      (entry) => entry.isDirectory() && !entry.isSymbolicLink() && !isSkippedDirectory(entry.name),
    )
    .map((entry) => entry.name)
    .toSorted(byName)
  return { root: real, dirs }
}

export function listContextTree(root: string, includeDirs: string[] | null): TreeNode[] {
  const real = requireDirectory(root)
  let include: Set<string> | null = null
  if (includeDirs !== null) {
    include = new Set()
    for (const name of includeDirs) {
      const parts = relativeParts(name)
      if (!parts || parts.length !== 1) fail('Ruta inválida')
      include.add(parts[0] ?? name)
    }
  }
  return filterTop(collect(real, ''), include)
}

export function readMarkdown(root: string, path: string): string {
  const real = requireDirectory(root)
  if (!isMarkdownName(basename(path))) fail('Solo se pueden abrir archivos .md')
  const target = contained(real, joinRelative(real, path))
  const info = lstatSync(target)
  if (info.isSymbolicLink() || !info.isFile()) fail('Solo se pueden abrir archivos .md')
  return readFileSync(target, 'utf8').replaceAll('\r\n', '\n')
}

function preserveNewlines(target: string, contents: string): string {
  let existing = ''
  try {
    existing = readFileSync(target, 'utf8')
  } catch {
    return contents
  }
  if (!existing.includes('\r\n')) return contents
  return contents.replaceAll('\n', '\r\n')
}

export function writeMarkdown(root: string, path: string, contents: string): void {
  const real = requireDirectory(root)
  if (!isMarkdownName(basename(path))) fail('Solo se pueden abrir archivos .md')
  const target = contained(real, joinRelative(real, path))
  const info = lstatSync(target)
  if (info.isSymbolicLink() || !info.isFile()) fail(`No existe \`${path}\``)

  const temporary = join(target, '..', `.${basename(target)}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, preserveNewlines(target, contents), { encoding: 'utf8' })
    renameSync(temporary, target)
  } catch (error) {
    rmSync(temporary, { force: true })
    const message = error instanceof Error ? error.message : 'No se pudo guardar'
    fail(`No se pudo guardar \`${path}\`: ${message}`)
  }
  notify(real)
}

function createNew(target: string): void {
  const opened = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL)
  closeSync(opened)
}

export function createEntry(root: string, path: string, kind: 'dir' | 'file'): void {
  const real = requireDirectory(root)
  const parts = partsOf(path)
  if (kind === 'file' && !isMarkdownName(parts.at(-1) ?? ''))
    fail('Solo se pueden crear archivos .md')
  const target = placeNew(real, parts)
  assertInside(real, target)

  try {
    if (kind === 'dir') mkdirSync(target, { recursive: true })
    else {
      mkdirSync(join(target, '..'), { recursive: true })
      createNew(target)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear'
    fail(`No se pudo crear \`${path}\`: ${message}`)
  }
  notify(real)
}

export function moveEntry(root: string, from: string, to: string, kind: 'dir' | 'file'): void {
  const real = requireDirectory(root)
  if (from === to) return
  if (kind === 'dir' && (to === from || to.startsWith(`${from}/`))) {
    fail('No se puede mover una carpeta dentro de sí misma')
  }

  const source = contained(real, joinRelative(real, from))
  const sourceInfo = lstatSync(source)
  if (sourceInfo.isSymbolicLink()) fail('Ruta inválida')
  if (kind === 'file' && !sourceInfo.isFile()) fail(`No existe \`${from}\``)
  if (kind === 'dir' && !sourceInfo.isDirectory()) fail(`No existe \`${from}\``)
  if (kind === 'file' && !isMarkdownName(basename(from))) fail('Solo se pueden abrir archivos .md')

  const destinationParts = partsOf(to)
  if (kind === 'file' && !isMarkdownName(destinationParts.at(-1) ?? '')) {
    fail('Solo se pueden crear archivos .md')
  }
  const sourceParent = join(source, '..')
  const except =
    join(real, ...destinationParts.slice(0, -1)) === sourceParent ? basename(source) : undefined
  const destination = placeNew(real, destinationParts, except)
  assertInside(real, destination)

  try {
    renameSync(source, destination)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo mover'
    fail(`No se pudo mover \`${from}\`: ${message}`)
  }
  notify(real)
}

export function renameEntry(root: string, from: string, to: string, kind: 'dir' | 'file'): void {
  moveEntry(root, from, to, kind)
}

export function deleteEntry(root: string, path: string, kind: 'dir' | 'file'): void {
  const real = requireDirectory(root)
  const target = contained(real, joinRelative(real, path))
  const info = lstatSync(target)
  if (info.isSymbolicLink()) fail('Ruta inválida')
  if (kind === 'file' && !info.isFile()) fail(`No existe \`${path}\``)
  if (kind === 'dir' && !info.isDirectory()) fail(`No existe \`${path}\``)
  rmSync(target, { recursive: kind === 'dir', force: false })
  notify(real)
}

function watchMatters(filename: string | null): boolean {
  if (!filename) return true
  return !filename.split(/[/\\]/).some((part) => isSkippedDirectory(part))
}

function notify(root: string): void {
  if (watchedRoot !== root) return
  for (const listener of listeners) listener(root)
}

export function watchWorkspace(root: string, listener: (root: string) => void): () => void {
  const real = requireDirectory(root)
  listeners.clear()
  listeners.add(listener)
  if (watchedRoot !== real) {
    watcher?.close()
    watchedRoot = real
    watcher = watch(real, { recursive: true }, (_event, filename) => {
      if (!watchMatters(filename)) return
      if (watchTimer) clearTimeout(watchTimer)
      watchTimer = setTimeout(() => {
        watchTimer = null
        if (watchedRoot) notify(watchedRoot)
      }, 80)
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      watcher?.close()
      watcher = null
      watchedRoot = null
    }
  }
}

export function stopWatching(): void {
  watcher?.close()
  watcher = null
  watchedRoot = null
  listeners.clear()
  if (watchTimer) clearTimeout(watchTimer)
  watchTimer = null
}

export function homeDirectory(): string {
  return homedir()
}
