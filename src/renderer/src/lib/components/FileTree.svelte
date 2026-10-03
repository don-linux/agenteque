<script lang="ts">
  import FileTreeRow from './FileTreeRow.svelte'
  import { dropParentFor, flattenTree, type DraftKind, type TreeRow } from '$lib/file-tree'
  import { fileTree } from '$lib/file-tree.svelte'
  import type { TreeNode } from '$lib/workspace.svelte'

  let {
    nodes,
    selected,
    onSelect,
    onDelete,
    onCreate,
    onRename,
    onMove,
    onRowMenu,
  }: {
    nodes: TreeNode[]
    selected: string | null
    onSelect: (path: string) => void
    onDelete: (path: string, kind: DraftKind) => void
    onCreate: (name: string) => void
    onRename: (name: string) => void
    onMove: (from: string, kind: DraftKind, toParent: string) => void
    onRowMenu: (row: TreeRow, event: MouseEvent) => void
  } = $props()

  let rows = $derived(flattenTree(nodes, { expanded: fileTree.expanded, draft: fileTree.draft }))

  function rowKey(row: TreeRow): string {
    return row.kind === 'draft' ? 'draft' : row.path
  }

  function rowKind(row: TreeRow): DraftKind {
    return row.kind === 'dir' ? 'dir' : 'file'
  }

  function rowDropParent(row: TreeRow): string {
    if (row.kind === 'dir') return dropParentFor({ kind: 'dir', path: row.path })
    return dropParentFor({ kind: 'file', path: row.path })
  }

  function onActivate(row: TreeRow): void {
    fileTree.focus(row.path)
    if (row.kind === 'dir') fileTree.toggle(row.path)
    else if (row.kind === 'file') onSelect(row.path)
  }

  function openMenu(row: TreeRow, event: MouseEvent): void {
    if (row.kind !== 'file' && row.kind !== 'dir') return
    fileTree.focus(row.path)
    onRowMenu(row, event)
  }

  function onRowDragStart(row: TreeRow, event: DragEvent): void {
    if (row.kind !== 'file' && row.kind !== 'dir') return
    event.dataTransfer?.setData('text/plain', row.path)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    fileTree.beginDrag(row.path, rowKind(row))
  }

  function onRowDragOver(row: TreeRow, event: DragEvent): void {
    event.stopPropagation()
    if (row.kind !== 'file' && row.kind !== 'dir') return
    const parent = rowDropParent(row)
    if (!fileTree.canDropOn(parent)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    fileTree.hoverDropParent(parent)
  }

  function onRowDrop(row: TreeRow, event: DragEvent): void {
    event.preventDefault()
    event.stopPropagation()
    const drag = fileTree.drag
    const parent = rowDropParent(row)
    fileTree.endDrag()
    if (!drag) return
    onMove(drag.path, drag.kind, parent)
  }

  function onRowDragLeave(row: TreeRow, event: DragEvent): void {
    if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node) {
      if (event.currentTarget.contains(event.relatedTarget)) return
    }
    if (fileTree.hoverDrop === rowDropParent(row)) fileTree.hoverDropParent(null)
  }
</script>

<div class="tree" role="tree" aria-label="Archivos de la carpeta">
  {#each rows as row (rowKey(row))}
    <FileTreeRow
      {row}
      selected={row.path === selected}
      dropTarget={fileTree.hoverDrop !== null &&
        (row.kind === 'file' || row.kind === 'dir') &&
        rowDropParent(row) === fileTree.hoverDrop}
      renaming={fileTree.rename?.path === row.path}
      invalid={fileTree.draftError !== null}
      onActivate={() => onActivate(row)}
      onExpand={() => fileTree.expand(row.path)}
      onCollapse={() => fileTree.toggle(row.path)}
      onDelete={() => onDelete(row.path, rowKind(row))}
      onRename={() => fileTree.startRename(row.path, rowKind(row))}
      onContextMenu={(event) => openMenu(row, event)}
      onCommitDraft={onCreate}
      onCancelDraft={() => fileTree.cancelDraft()}
      onCommitRename={onRename}
      onCancelRename={() => fileTree.cancelRename()}
      onDragStart={(event) => onRowDragStart(row, event)}
      onDragOver={(event) => onRowDragOver(row, event)}
      onDrop={(event) => onRowDrop(row, event)}
      onDragLeave={(event) => onRowDragLeave(row, event)}
      onDragEnd={() => fileTree.endDrag()}
    />
  {/each}
</div>

<style>
  .tree {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-block: 0.15rem;
  }
</style>
