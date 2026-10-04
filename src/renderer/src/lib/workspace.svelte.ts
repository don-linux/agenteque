import { SvelteMap } from 'svelte/reactivity'
import { appConfig } from '$lib/app-config.svelte'
import { demoWorkspace, DEMO_ROOT } from '$lib/backend/demo-workspace'
import type { NodeKind, TreeNode, WorkspaceBackend, WorkspaceDirs } from '$lib/backend/types'
import { browser } from '$lib/browser.svelte'
import { editorSession } from '$lib/editor-session.svelte'
import { gitGraph } from '$lib/git-graph.svelte'
import { addTab, nextActiveAfterClose, removeTab } from '$lib/editor-tabs'
import {
  baseNameOf,
  createPathConflict,
  folderNameOf,
  joinTreePath,
  normalizeNewName,
  normalizeRenameName,
  parentDirOf,
  planMove,
  remapPathPrefix,
  siblingExistsExcept,
  type DraftKind,
} from '$lib/file-tree'
import { fileTree } from '$lib/file-tree.svelte'
import {
  FOLDER_VISIBILITY_TOAST,
  folderName,
  includeCreatedRootFolder,
  needsFolderPicker,
  removeVisibleRootFolder,
  renameVisibleRootFolder,
  shouldShowFolderVisibilityToast,
} from '$lib/folder-visibility'
import { folderVisibility } from '$lib/folder-visibility.svelte'
import { terminal } from '$lib/terminal.svelte'
import { toasts } from '$lib/toast.svelte'
import { unsavedExit } from '$lib/unsaved-exit.svelte'
import { collectDraftWrites } from '$lib/workspace-save'

export type { NodeKind, TreeNode, WorkspaceDirs }

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface DeleteRequest {
  path: string
  kind: NodeKind
}

interface PendingWrite {
  path: string
  contents: string
}

function messageFrom(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

function treeHasFile(nodes: TreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.kind === 'file' && node.path === path) return true
    if (node.kind === 'dir' && treeHasFile(node.children, path)) return true
  }

  return false
}

function treeHasDir(nodes: TreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.kind !== 'dir') continue
    if (node.path === path) return true
    if (treeHasDir(node.children, path)) return true
  }

  return false
}

class Workspace {
  root = $state<string | null>(null)
  tree = $state<TreeNode[]>([])
  childDirs = $state<string[]>([])
  /** `null` es el árbol completo. Un array, aunque esté vacío, es un filtro confirmado. */
  visibleFolders = $state<string[] | null>(null)
  openTabs = $state<string[]>([])
  currentPath = $state<string | null>(null)
  content = $state('')
  dirty = $state(false)
  saveState = $state<SaveState>('idle')
  error = $state<string | null>(null)
  /** Borrado pendiente de confirmar: no hay diálogo nativo, el modal es nuestro. */
  pendingDelete = $state<DeleteRequest | null>(null)

  #backend: WorkspaceBackend = demoWorkspace

  use(backend: WorkspaceBackend): void {
    this.#backend = backend
  }
  #drafts = new SvelteMap<string, string>()
  #contentFor = $state<string | null>(null)
  #writing: Promise<boolean> = Promise.resolve(true)
  /** Evita que una lectura lenta aterrice después de abrir otro fichero. */
  #loadToken = 0
  #resolveDelete: ((confirmed: boolean) => void) | null = null

  get hasEntries(): boolean {
    return this.tree.length > 0
  }

  get folderName(): string {
    return this.root === null ? '' : folderNameOf(this.root)
  }

  isDirectory(path: string): boolean {
    return treeHasDir(this.tree, path)
  }

  get canEditVisibility(): boolean {
    return this.root !== null && this.childDirs.length > 0
  }

  get hasUnsaved(): boolean {
    return this.#drafts.size > 0
  }

  get contentReady(): boolean {
    return this.currentPath !== null && this.#contentFor === this.currentPath
  }

  hasDraft(path: string): boolean {
    return this.#drafts.has(path)
  }

  /** El diálogo nativo elige la carpeta. Sin puente, se queda la demo de los tests. */
  async openFolder(): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.api?.pickFolder === 'function') {
      const picked = await window.api.pickFolder()
      if (!picked) return
      await this.openRoot(picked)
      return
    }
    await this.openRoot(DEMO_ROOT)
  }

  async openRoot(path: string): Promise<void> {
    if (!(await this.#confirmDiscardUnsaved())) return

    let listed: WorkspaceDirs
    try {
      listed = await this.#backend.listWorkspaceDirs(path)
    } catch (error) {
      this.error = messageFrom(error)
      return
    }

    const saved = appConfig.visibilityFor(listed.root)
    let includeDirs: string[] | null = null

    if (needsFolderPicker(listed.dirs, saved)) {
      const picked = await folderVisibility.request({
        rootName: folderName(listed.root),
        dirs: listed.dirs,
        selected: [],
      })
      if (picked !== null) {
        await appConfig.saveVisibility(listed.root, picked)
        includeDirs = picked
      }
    } else if (saved !== undefined) {
      includeDirs = saved
    }

    await this.#leaveSession()

    try {
      this.tree = await this.#backend.listContextTree(listed.root, includeDirs)
      this.error = null
    } catch (error) {
      this.error = messageFrom(error)
      return
    }

    this.root = listed.root
    this.childDirs = listed.dirs
    this.visibleFolders = includeDirs
    this.#resetOpenFiles()

    const recorded = await appConfig.record(listed.root)
    if (recorded) {
      this.root = recorded
    }
    void gitGraph.setRoot(this.root)

    if (shouldShowFolderVisibilityToast(listed.dirs.length > 0, includeDirs ?? undefined)) {
      toasts.hint(FOLDER_VISIBILITY_TOAST)
    }
  }

  async closeWorkspace(): Promise<boolean> {
    if (!(await this.#confirmDiscardUnsaved())) return false

    await this.#leaveSession()

    this.root = null
    void gitGraph.setRoot(null)
    this.tree = []
    this.childDirs = []
    this.visibleFolders = null
    this.#resetOpenFiles()
    this.error = null
    return true
  }

  async refreshTree(): Promise<void> {
    const root = this.root
    if (!root) return

    try {
      this.tree = await this.#backend.listContextTree(root, this.visibleFolders)
    } catch (error) {
      this.tree = []
      this.error = messageFrom(error)
    }
  }

  async editVisibility(): Promise<void> {
    const root = this.root
    if (!root || this.childDirs.length === 0) return

    let listed: WorkspaceDirs
    try {
      listed = await this.#backend.listWorkspaceDirs(root)
    } catch (error) {
      this.error = messageFrom(error)
      return
    }

    this.childDirs = listed.dirs
    if (listed.dirs.length === 0) return

    const picked = await folderVisibility.request({
      rootName: folderName(root),
      dirs: listed.dirs,
      selected: this.visibleFolders ?? [],
    })
    if (picked === null) return

    await appConfig.saveVisibility(root, picked)
    this.visibleFolders = picked
    await this.reloadFromDisk()
  }

  async openFile(path: string): Promise<void> {
    const root = this.root
    if (!root) return

    this.openTabs = addTab(this.openTabs, path)
    fileTree.reveal(path)
    if (path === this.currentPath) return

    const token = ++this.#loadToken
    this.currentPath = path
    this.error = null

    const draft = this.#drafts.get(path)
    if (draft !== undefined) {
      this.content = draft
      this.#contentFor = path
      this.dirty = true
      this.saveState = 'idle'
      return
    }

    this.dirty = false
    this.saveState = 'idle'
    this.#contentFor = null

    try {
      const contents = await this.#backend.readMarkdown(root, path)
      if (token !== this.#loadToken) return
      this.content = contents
      this.#contentFor = path
    } catch (error) {
      if (token !== this.#loadToken) return
      this.content = ''
      this.#contentFor = path
      this.error = messageFrom(error)
    }
  }

  async closeTab(path: string): Promise<void> {
    if (!this.openTabs.includes(path)) return

    if (this.#drafts.has(path)) {
      const confirmed = await unsavedExit.request('tab')
      if (!confirmed) return
      this.#dropDraft(path)
    }

    this.#forgetTab(path)
  }

  confirmDelete = (): void => {
    this.#settleDelete(true)
  }

  cancelDelete = (): void => {
    this.#settleDelete(false)
  }

  async deleteFile(path: string): Promise<void> {
    const root = this.root
    if (!root) return

    if (!(await this.#askDelete({ path, kind: 'file' }))) return

    this.#dropDraft(path)

    try {
      await this.#backend.deleteEntry(root, path, 'file')
      this.error = null
    } catch (error) {
      this.error = messageFrom(error)
      return
    }

    this.#forgetTab(path)

    await this.refreshTree()
  }

  async deleteFolder(path: string): Promise<void> {
    const root = this.root
    if (!root) return

    if (!(await this.#askDelete({ path, kind: 'dir' }))) return

    const gone = this.openTabs.filter((tab) => tab.startsWith(`${path}/`))
    for (const tab of gone) this.#dropDraft(tab)

    try {
      await this.#backend.deleteEntry(root, path, 'dir')
      this.error = null
    } catch (error) {
      this.error = messageFrom(error)
      return
    }

    this.#forgetTabs(gone)
    fileTree.dropExpandedUnder(path)

    if (parentDirOf(path) === '') {
      const name = baseNameOf(path)
      this.childDirs = this.childDirs.filter((dir) => dir !== name)
      const nextVisible = removeVisibleRootFolder(this.visibleFolders, name)
      if (nextVisible !== this.visibleFolders) {
        this.visibleFolders = nextVisible
        if (nextVisible !== null) {
          await appConfig.saveVisibility(root, nextVisible)
        }
      }
    }

    await this.refreshTree()
  }

  /**
   * Renombra desde la fila en línea del árbol. Los fallos se quedan en esa
   * fila, no en el aviso del panel lateral.
   */
  async renameEntry(from: string, kind: DraftKind, rawName: string): Promise<boolean> {
    const root = this.root
    if (!root) return false

    const normalized = normalizeRenameName(rawName, kind)
    if (!normalized.ok) {
      fileTree.failDraft(normalized.error)
      return false
    }

    const parent = parentDirOf(from)
    const to = joinTreePath(parent, normalized.name)

    if (to === from) {
      fileTree.cancelRename()
      return true
    }

    if (siblingExistsExcept(this.tree, parent, normalized.name, from)) {
      fileTree.failDraft(`\`${normalized.name}\` ya existe`)
      return false
    }

    try {
      await this.#backend.renameEntry(root, from, to, kind)
      this.error = null
    } catch (error) {
      fileTree.failDraft(messageFrom(error))
      return false
    }

    this.#remapOpenPaths(from, to)
    fileTree.remapExpanded(from, to)
    fileTree.cancelRename()

    if (kind === 'dir' && parent === '') {
      const fromName = baseNameOf(from)
      this.childDirs = this.childDirs
        .map((dir) => (dir === fromName ? normalized.name : dir))
        .toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

      const nextVisible = renameVisibleRootFolder(this.visibleFolders, fromName, normalized.name)
      if (nextVisible !== this.visibleFolders) {
        this.visibleFolders = nextVisible
        if (nextVisible !== null) {
          await appConfig.saveVisibility(root, nextVisible)
        }
      }
    }

    await this.refreshTree()
    return true
  }

  /**
   * Mueve una entrada a otra carpeta. Los fallos se quedan en el aviso del
   * árbol, igual que crear y renombrar.
   */
  async moveEntry(from: string, kind: DraftKind, toParent: string): Promise<boolean> {
    const root = this.root
    if (!root) return false

    const name = baseNameOf(from)
    const check = planMove(this.tree, from, kind, toParent)
    if (!check.ok) {
      if (check.reason === 'self') {
        fileTree.failDraft('No se puede mover una carpeta dentro de sí misma')
        return false
      }

      if (check.reason === 'exists') {
        fileTree.failDraft(`\`${name}\` ya existe`)
        return false
      }

      return true
    }

    try {
      await this.#backend.moveEntry(root, from, check.to, kind)
      this.error = null
    } catch (error) {
      fileTree.failDraft(messageFrom(error))
      return false
    }

    const fromParent = parentDirOf(from)
    this.#remapOpenPaths(from, check.to)
    fileTree.remapExpanded(from, check.to)
    fileTree.clearError()

    if (kind === 'dir' && fromParent !== toParent) {
      if (fromParent === '') {
        this.childDirs = this.childDirs.filter((dir) => dir !== name)
        const nextVisible = removeVisibleRootFolder(this.visibleFolders, name)
        if (nextVisible !== this.visibleFolders) {
          this.visibleFolders = nextVisible
          if (nextVisible !== null) {
            await appConfig.saveVisibility(root, nextVisible)
          }
        }
      } else if (toParent === '') {
        if (!this.childDirs.includes(name)) {
          this.childDirs = [...this.childDirs, name].toSorted((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' }),
          )
        }

        const nextVisible = includeCreatedRootFolder(this.visibleFolders, toParent, name)
        if (nextVisible !== null && nextVisible !== this.visibleFolders) {
          this.visibleFolders = nextVisible
          await appConfig.saveVisibility(root, nextVisible)
        }
      }
    }

    fileTree.revealFolder(toParent)
    await this.refreshTree()
    return true
  }

  /**
   * Crea desde la fila en línea del árbol. Los fallos se quedan en la fila del
   * borrador, para que el nombre se pueda arreglar ahí mismo.
   */
  async createEntry(kind: DraftKind, parent: string, rawName: string): Promise<boolean> {
    const root = this.root
    if (!root) return false

    const normalized = normalizeNewName(rawName, kind)
    if (!normalized.ok) {
      fileTree.failDraft(normalized.error)
      return false
    }

    const path = joinTreePath(parent, normalized.name)
    const name = baseNameOf(path)
    const conflict = createPathConflict(this.tree, path)

    if (conflict) {
      fileTree.failDraft(conflict)
      return false
    }

    try {
      await this.#backend.createEntry(root, path, kind)
      this.error = null
    } catch (error) {
      fileTree.failDraft(messageFrom(error))
      return false
    }

    fileTree.cancelDraft()

    if (kind === 'dir' && parent === '') {
      if (!this.childDirs.includes(name)) {
        this.childDirs = [...this.childDirs, name].toSorted((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' }),
        )
      }

      const nextVisible = includeCreatedRootFolder(this.visibleFolders, parent, name)
      if (nextVisible !== null && nextVisible !== this.visibleFolders) {
        this.visibleFolders = nextVisible
        await appConfig.saveVisibility(root, nextVisible)
      }
    }

    await this.refreshTree()

    if (kind === 'dir') {
      fileTree.revealFolder(path)
      return true
    }

    fileTree.reveal(path)
    await this.openFile(path)
    return true
  }

  async reloadFromDisk(): Promise<void> {
    const root = this.root
    if (!root) return

    const path = this.currentPath
    await this.refreshTree()

    const missing = this.openTabs.filter((tab) => !treeHasFile(this.tree, tab))
    if (missing.length > 0) {
      const remaining = this.openTabs.filter((tab) => treeHasFile(this.tree, tab))
      for (const tab of missing) {
        this.#dropDraft(tab)
        editorSession.dropState(tab)
      }
      this.openTabs = remaining

      if (path !== null && missing.includes(path) && this.currentPath === path) {
        const next = remaining[0]
        if (next !== undefined) {
          await this.openFile(next)
        } else {
          this.#dropOpenFile()
        }
        return
      }
    }

    if (path === null || this.currentPath !== path) return

    if (!treeHasFile(this.tree, path)) {
      this.#dropDraft(path)
      this.#dropOpenFile()
      return
    }

    if (this.dirty) return

    try {
      const contents = await this.#backend.readMarkdown(root, path)
      if (this.currentPath !== path || this.dirty) return
      if (contents === this.content) return
      this.content = contents
      this.#contentFor = path
    } catch (error) {
      if (this.currentPath !== path) return
      this.#dropDraft(path)
      this.#forgetTab(path)
      this.error = messageFrom(error)
    }
  }

  edit(contents: string): void {
    const path = this.currentPath
    if (!path) return

    this.content = contents
    this.dirty = true
    this.#drafts.set(path, contents)
  }

  async save(): Promise<void> {
    const path = this.currentPath
    if (!path || !this.dirty) return

    this.#writing = this.#writing.then(() => this.#write({ path, contents: this.content }))
    await this.#writing
  }

  async saveAll(): Promise<boolean> {
    const writes = collectDraftWrites(this.#drafts)
    if (writes.length === 0) return true

    for (const pending of writes) {
      this.#writing = this.#writing.then(() => this.#write(pending))
      if (!(await this.#writing)) return false
    }

    return true
  }

  discardUnsaved(): void {
    this.#clearDrafts()
    this.dirty = false
    this.saveState = 'idle'
  }

  #askDelete(request: DeleteRequest): Promise<boolean> {
    if (this.pendingDelete) return Promise.resolve(false)

    this.pendingDelete = request
    return new Promise((resolve) => {
      this.#resolveDelete = resolve
    })
  }

  #settleDelete(confirmed: boolean): void {
    const resolve = this.#resolveDelete
    this.pendingDelete = null
    this.#resolveDelete = null
    resolve?.(confirmed)
  }

  #forgetTab(path: string): void {
    const next = nextActiveAfterClose(this.openTabs, path, this.currentPath)
    this.openTabs = removeTab(this.openTabs, path)
    editorSession.dropState(path)

    if (this.currentPath !== path) return

    if (next) {
      void this.openFile(next)
      return
    }

    this.#dropOpenFile()
  }

  #forgetTabs(paths: string[]): void {
    if (paths.length === 0) return

    const gone = new Set(paths)
    const remaining = this.openTabs.filter((tab) => !gone.has(tab))
    for (const tab of paths) editorSession.dropState(tab)

    const currentGone = this.currentPath !== null && gone.has(this.currentPath)
    this.openTabs = remaining

    if (!currentGone) return

    const next = remaining[0]
    if (next !== undefined) {
      void this.openFile(next)
      return
    }

    this.#dropOpenFile()
  }

  #remapOpenPaths(from: string, to: string): void {
    this.openTabs = this.openTabs.map((tab) => remapPathPrefix(tab, from, to))

    if (this.currentPath !== null) {
      this.currentPath = remapPathPrefix(this.currentPath, from, to)
    }

    if (this.#contentFor !== null) {
      this.#contentFor = remapPathPrefix(this.#contentFor, from, to)
    }

    const remapped = new Map<string, string>()
    for (const [path, contents] of this.#drafts) {
      remapped.set(remapPathPrefix(path, from, to), contents)
    }
    this.#drafts.clear()
    for (const [path, contents] of remapped) {
      this.#drafts.set(path, contents)
    }

    editorSession.remapStatesUnder(from, to)
  }

  #resetOpenFiles(): void {
    this.openTabs = []
    editorSession.clearStates()
    fileTree.reset()
    this.#dropOpenFile()
  }

  #dropOpenFile(): void {
    this.currentPath = null
    this.content = ''
    this.#contentFor = null
    this.dirty = false
    this.saveState = 'idle'
    this.#loadToken += 1
  }

  #dropDraft(path: string): void {
    this.#drafts.delete(path)
    if (this.currentPath === path) {
      this.dirty = false
    }
  }

  #clearDrafts(): void {
    this.#drafts.clear()
    this.dirty = false
  }

  async #confirmDiscardUnsaved(): Promise<boolean> {
    if (!this.hasUnsaved) return true

    const confirmed = await unsavedExit.request()
    if (!confirmed) return false

    this.#clearDrafts()
    return true
  }

  async #leaveSession(): Promise<void> {
    await terminal.teardown()
    await browser.teardown()
  }

  async #write(pending: PendingWrite): Promise<boolean> {
    const root = this.root
    if (!root) return false

    this.saveState = 'saving'

    try {
      await this.#backend.writeMarkdown(root, pending.path, pending.contents)

      const draft = this.#drafts.get(pending.path)
      if (draft !== undefined && draft !== pending.contents) {
        return true
      }

      this.#drafts.delete(pending.path)

      if (this.currentPath === pending.path) {
        this.dirty = false
        this.saveState = 'saved'
      } else if (this.#drafts.size === 0) {
        this.saveState = 'saved'
      }

      return true
    } catch (error) {
      this.error = messageFrom(error)
      this.saveState = 'error'
      return false
    }
  }
}

export const workspace = new Workspace()
