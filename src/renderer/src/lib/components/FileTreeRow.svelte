<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import FilePlus from '@lucide/svelte/icons/file-plus'
  import FileText from '@lucide/svelte/icons/file-text'
  import Folder from '@lucide/svelte/icons/folder'
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import FolderPlus from '@lucide/svelte/icons/folder-plus'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { untrack } from 'svelte'
  import { isSameRowDoubleClick, type RowClickStamp, type TreeRow } from '$lib/file-tree'

  let {
    row,
    selected,
    dropTarget = false,
    renaming,
    invalid,
    onActivate,
    onExpand,
    onCollapse,
    onDelete,
    onRename,
    onContextMenu,
    onCommitDraft,
    onCancelDraft,
    onCommitRename,
    onCancelRename,
    onDragStart,
    onDragOver,
    onDrop,
    onDragLeave,
    onDragEnd,
  }: {
    row: TreeRow
    selected: boolean
    dropTarget?: boolean
    renaming: boolean
    invalid: boolean
    onActivate: () => void
    onExpand: () => void
    onCollapse: () => void
    onDelete: () => void
    onRename: () => void
    onContextMenu: (event: MouseEvent) => void
    onCommitDraft: (name: string) => void
    onCancelDraft: () => void
    onCommitRename: (name: string) => void
    onCancelRename: () => void
    onDragStart: (event: DragEvent) => void
    onDragOver: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
    onDragLeave: (event: DragEvent) => void
    onDragEnd: () => void
  } = $props()

  let draftName = $state('')
  let renameName = $state('')
  let lastClick: RowClickStamp | null = null

  function attachDraftField(node: HTMLInputElement): void {
    node.focus()
  }

  function attachRenameField(node: HTMLInputElement): void {
    const name = untrack(() => row.name)
    renameName = name
    node.value = name
    node.focus()
    node.select()
  }

  function onRowKeydown(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault()
      event.stopPropagation()
      onRename()
      return
    }

    if (event.key === 'Delete' && (row.kind === 'file' || row.kind === 'dir')) {
      event.preventDefault()
      event.stopPropagation()
      onDelete()
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onActivate()
      return
    }

    if (row.kind !== 'dir') return

    if (event.key === 'ArrowRight' && !row.expanded) {
      event.preventDefault()
      onExpand()
    } else if (event.key === 'ArrowLeft' && row.expanded) {
      event.preventDefault()
      onCollapse()
    }
  }

  function onDraftKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommitDraft(draftName)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelDraft()
    }
  }

  function onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommitRename(renameName)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelRename()
    }
  }

  function onRowContextMenu(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    onContextMenu(event)
  }

  // Two clicks fire before dblclick. The first opens or toggles; the second
  // must not, or a folder would collapse and then rename.
  function onRowClick(): void {
    const now = Date.now()
    const second = isSameRowDoubleClick(lastClick, row.path, now)
    lastClick = { path: row.path, at: now }
    if (second) return
    onActivate()
  }

  function onRowDblClick(event: MouseEvent): void {
    event.preventDefault()
    onRename()
  }
</script>

{#if row.kind === 'draft'}
  <div class="row draft" style:--depth={row.depth} role="treeitem" aria-selected="true">
    <span class="twisty" aria-hidden="true"></span>
    <span class="icon" aria-hidden="true">
      {#if row.draftKind === 'dir'}
        <FolderPlus size={14} strokeWidth={1.75} />
      {:else}
        <FilePlus size={14} strokeWidth={1.75} />
      {/if}
    </span>
    <!-- Focused on mount so the user types the name right away, like VS Code. -->
    <input
      {@attach attachDraftField}
      bind:value={draftName}
      class="field"
      class:invalid
      type="text"
      spellcheck="false"
      autocomplete="off"
      aria-invalid={invalid}
      aria-label={row.draftKind === 'dir' ? 'Nombre de la carpeta' : 'Nombre del archivo'}
      placeholder={row.draftKind === 'dir' ? 'carpeta' : 'nombre.md'}
      onkeydown={onDraftKeydown}
      onblur={onCancelDraft}
    />
  </div>
{:else if renaming}
  <div
    class="row draft selected"
    style:--depth={row.depth}
    role="treeitem"
    aria-selected="true"
    aria-expanded={row.kind === 'dir' ? row.expanded : undefined}
  >
    <span class="twisty" aria-hidden="true">
      {#if row.kind === 'dir'}
        {#if row.expanded}
          <ChevronDown size={14} strokeWidth={2} />
        {:else}
          <ChevronRight size={14} strokeWidth={2} />
        {/if}
      {/if}
    </span>
    <span class="icon" aria-hidden="true">
      {#if row.kind === 'dir'}
        {#if row.expanded}
          <FolderOpen size={14} strokeWidth={1.75} />
        {:else}
          <Folder size={14} strokeWidth={1.75} />
        {/if}
      {:else}
        <FileText size={14} strokeWidth={1.75} />
      {/if}
    </span>
    <input
      {@attach attachRenameField}
      bind:value={renameName}
      class="field"
      class:invalid
      type="text"
      spellcheck="false"
      autocomplete="off"
      aria-invalid={invalid}
      aria-label="Nuevo nombre"
      onkeydown={onRenameKeydown}
      onblur={onCancelRename}
    />
  </div>
{:else}
  <div
    class="row"
    class:selected
    class:drop-target={dropTarget}
    style:--depth={row.depth}
    role="treeitem"
    tabindex="0"
    aria-level={row.depth + 1}
    aria-selected={selected}
    aria-expanded={row.kind === 'dir' ? row.expanded : undefined}
    title={row.path}
    draggable="true"
    onclick={onRowClick}
    ondblclick={onRowDblClick}
    onkeydown={onRowKeydown}
    oncontextmenu={onRowContextMenu}
    ondragstart={onDragStart}
    ondragover={onDragOver}
    ondrop={onDrop}
    ondragleave={onDragLeave}
    ondragend={onDragEnd}
  >
    <span class="twisty" aria-hidden="true">
      {#if row.kind === 'dir'}
        {#if row.expanded}
          <ChevronDown size={14} strokeWidth={2} />
        {:else}
          <ChevronRight size={14} strokeWidth={2} />
        {/if}
      {/if}
    </span>
    <span class="icon" aria-hidden="true">
      {#if row.kind === 'dir'}
        {#if row.expanded}
          <FolderOpen size={14} strokeWidth={1.75} />
        {:else}
          <Folder size={14} strokeWidth={1.75} />
        {/if}
      {:else}
        <FileText size={14} strokeWidth={1.75} />
      {/if}
    </span>
    <span class="name">{row.name}</span>
    {#if row.kind === 'file'}
      <button
        type="button"
        class="delete"
        aria-label="Borrar {row.name}"
        draggable="false"
        onclick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        ondblclick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        ondragstart={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {/if}
  </div>
{/if}

<style>
  .row {
    --indent-step: 0.72rem;

    display: flex;
    align-items: center;
    gap: 0.2rem;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 1.6rem;
    padding-inline: calc(0.25rem + var(--depth, 0) * var(--indent-step)) 0.25rem;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    line-height: 1.25;
    white-space: nowrap;
    cursor: pointer;
  }

  .row:hover {
    background: var(--surface-hover);
  }

  .row.selected {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .row.drop-target {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .row:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  .twisty,
  .icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 0.95rem;
    color: var(--text-faint);
  }

  .row.selected .icon,
  .row.selected .twisty {
    color: var(--accent);
  }

  .name {
    flex: 1;
    align-self: stretch;
    min-width: 0;
    overflow: hidden;
    line-height: 1.6rem;
    text-overflow: ellipsis;
  }

  .delete {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--danger);
    opacity: 0;
    cursor: pointer;
  }

  .row:hover .delete,
  .row.selected .delete,
  .delete:focus-visible {
    opacity: 1;
  }

  .delete:hover {
    background: var(--surface);
  }

  .row.draft {
    cursor: default;
  }

  .field {
    flex: 1;
    min-width: 0;
    height: 1.2rem;
    padding: 0 0.25rem;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    -webkit-user-select: text;
    user-select: text;
  }

  .field:focus {
    outline: none;
  }

  .field.invalid {
    border-color: var(--danger);
  }
</style>
