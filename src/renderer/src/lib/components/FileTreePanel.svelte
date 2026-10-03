<script lang="ts">
  import FilePlus from '@lucide/svelte/icons/file-plus'
  import FolderPlus from '@lucide/svelte/icons/folder-plus'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import FileTree from './FileTree.svelte'
  import FileTreeContextMenu from './FileTreeContextMenu.svelte'
  import { draftParentForCommand, type DraftKind, type TreeRow } from '$lib/file-tree'
  import { fileTree } from '$lib/file-tree.svelte'
  import { SPIN_TURN_MS, spinHoldMs } from '$lib/refresh-spin'
  import { workspace } from '$lib/workspace.svelte'

  let { parked = false }: { parked?: boolean } = $props()

  let refreshing = $state(false)
  let menu = $state<
    | { variant: 'row'; x: number; y: number; path: string; kind: DraftKind }
    | { variant: 'blank'; x: number; y: number }
    | null
  >(null)

  function startDraft(kind: DraftKind): void {
    menu = null
    const parent = draftParentForCommand('toolbar', fileTree.focusedPath, (path) =>
      workspace.isDirectory(path),
    )
    fileTree.startDraft(kind, parent)
  }

  function startRootDraft(kind: DraftKind): void {
    menu = null
    const parent = draftParentForCommand('blank', fileTree.focusedPath, (path) =>
      workspace.isDirectory(path),
    )
    fileTree.startDraft(kind, parent)
  }

  function closeMenu(): void {
    menu = null
  }

  function openRowMenu(row: TreeRow, event: MouseEvent): void {
    if (row.kind !== 'file' && row.kind !== 'dir') return
    menu = {
      variant: 'row',
      x: event.clientX,
      y: event.clientY,
      path: row.path,
      kind: row.kind,
    }
  }

  function onBlankClick(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[role="treeitem"]')) return
    fileTree.focusRoot()
  }

  function onBlankDblClick(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[role="treeitem"]')) return
    event.preventDefault()
  }

  function onBodyContextMenu(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    fileTree.focusRoot()
    menu = { variant: 'blank', x: event.clientX, y: event.clientY }
  }

  function onBodyDragOver(event: DragEvent): void {
    if (!fileTree.canDropOn('')) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    fileTree.hoverDropParent('')
  }

  function onBodyDrop(event: DragEvent): void {
    event.preventDefault()
    const drag = fileTree.drag
    fileTree.endDrag()
    if (!drag) return
    void workspace.moveEntry(drag.path, drag.kind, '')
  }

  function onBodyDragLeave(event: DragEvent): void {
    if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node) {
      if (event.currentTarget.contains(event.relatedTarget)) return
    }
    if (fileTree.hoverDrop === '') fileTree.hoverDropParent(null)
  }

  function startRename(path: string, kind: DraftKind): void {
    closeMenu()
    fileTree.startRename(path, kind)
  }

  function deleteTarget(path: string, kind: DraftKind): void {
    closeMenu()
    if (kind === 'dir') void workspace.deleteFolder(path)
    else void workspace.deleteFile(path)
  }

  async function refresh(): Promise<void> {
    if (refreshing) return
    refreshing = true
    const started = Date.now()
    try {
      await workspace.refreshTree()
    } finally {
      const hold = spinHoldMs(Date.now() - started)
      if (hold > 0) await new Promise((resolve) => setTimeout(resolve, hold))
      refreshing = false
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (menu?.variant !== 'row') return

    if (event.key === 'F2') {
      event.preventDefault()
      startRename(menu.path, menu.kind)
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      deleteTarget(menu.path, menu.kind)
    }
  }}
/>

<aside
  class:parked
  oncontextmenu={(event) => {
    event.preventDefault()
  }}
>
  <header>
    <span class="folder" title={workspace.root}>{workspace.folderName}</span>
  </header>

  <div class="toolbar">
    <button
      type="button"
      class="tool"
      aria-label="Crear archivo"
      title="Crear archivo"
      onclick={() => startDraft('file')}
    >
      <FilePlus size={15} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="tool"
      aria-label="Crear carpeta"
      title="Crear carpeta"
      onclick={() => startDraft('dir')}
    >
      <FolderPlus size={15} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="tool"
      class:spinning={refreshing}
      style="--spin-turn: {SPIN_TURN_MS}ms"
      aria-label="Refrescar"
      title="Refrescar"
      onclick={() => void refresh()}
    >
      <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
    </button>
  </div>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (blank space focuses workspace root) -->
  <div
    class="body"
    class:drop-root={fileTree.hoverDrop === ''}
    role="group"
    aria-label="Área del árbol"
    onclick={onBlankClick}
    ondblclick={onBlankDblClick}
    oncontextmenu={onBodyContextMenu}
    ondragover={onBodyDragOver}
    ondrop={onBodyDrop}
    ondragleave={onBodyDragLeave}
  >
    {#if workspace.hasEntries || fileTree.draft}
      <FileTree
        nodes={workspace.tree}
        selected={fileTree.focusedPath}
        onSelect={(path) => workspace.openFile(path)}
        onDelete={(path, kind) => deleteTarget(path, kind)}
        onCreate={(name) => {
          const draft = fileTree.draft
          if (draft) void workspace.createEntry(draft.kind, draft.parent, name)
        }}
        onRename={(name) => {
          const rename = fileTree.rename
          if (rename) void workspace.renameEntry(rename.path, rename.kind, name)
        }}
        onMove={(from, kind, toParent) => {
          void workspace.moveEntry(from, kind, toParent)
        }}
        onRowMenu={openRowMenu}
      />
    {:else}
      <p class="hint">Esta carpeta está vacía.</p>
    {/if}
  </div>

  {#if fileTree.draftError}
    <p class="draft-error">{fileTree.draftError}</p>
  {/if}
</aside>

{#if menu}
  {@const target = menu}
  {#if target.variant === 'blank'}
    <FileTreeContextMenu
      variant="blank"
      x={target.x}
      y={target.y}
      onNewFile={() => startRootDraft('file')}
      onNewFolder={() => startRootDraft('dir')}
      onClose={closeMenu}
    />
  {:else}
    <FileTreeContextMenu
      x={target.x}
      y={target.y}
      onDelete={() => deleteTarget(target.path, target.kind)}
      onRename={() => startRename(target.path, target.kind)}
      onClose={closeMenu}
    />
  {/if}
{/if}

<style>
  aside {
    display: flex;
    flex-direction: column;
    grid-area: tree;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }

  aside.parked {
    position: fixed;
    top: 0;
    left: -12000px;
    width: var(--tree-width, 16rem);
    height: 80vh;
    overflow: hidden;
    pointer-events: none;
    z-index: -1;
  }

  header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    height: 2rem;
    padding: 0 0.6rem;
  }

  .folder {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .toolbar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.1rem;
    padding: 0 0.35rem 0.35rem;
    border-bottom: 1px solid var(--border);
  }

  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .tool:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .tool.spinning {
    color: var(--accent);
  }

  .tool.spinning :global(svg) {
    transform-origin: 50% 50%;
    animation: spin var(--spin-turn, 800ms) linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tool.spinning :global(svg) {
      animation: none;
    }
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-user-select: none;
    user-select: none;
  }

  .body.drop-root {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .hint {
    margin: 0;
    padding: 0.5rem 0.6rem;
    color: var(--text-faint);
    font-size: 0.78rem;
  }

  .draft-error {
    flex-shrink: 0;
    margin: 0;
    padding: 0.35rem 0.6rem;
    border-top: 1px solid var(--border);
    color: var(--danger);
    font-size: 0.72rem;
  }
</style>
