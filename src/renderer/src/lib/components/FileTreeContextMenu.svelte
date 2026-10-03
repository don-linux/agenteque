<script lang="ts">
  let {
    x,
    y,
    variant = 'row',
    onDelete,
    onRename,
    onNewFile,
    onNewFolder,
    onClose,
  }: {
    x: number
    y: number
    variant?: 'row' | 'blank'
    onDelete?: () => void
    onRename?: () => void
    onNewFile?: () => void
    onNewFolder?: () => void
    onClose: () => void
  } = $props()

  let menuEl: HTMLDivElement | null = null

  function attachMenu(node: HTMLDivElement): () => void {
    menuEl = node

    const pad = 8
    const rect = node.getBoundingClientRect()
    let nextLeft = x
    let nextTop = y

    if (nextLeft + rect.width > window.innerWidth - pad) {
      nextLeft = window.innerWidth - rect.width - pad
    }
    if (nextTop + rect.height > window.innerHeight - pad) {
      nextTop = window.innerHeight - rect.height - pad
    }

    node.style.left = `${Math.max(pad, nextLeft)}px`
    node.style.top = `${Math.max(pad, nextTop)}px`

    return () => {
      if (menuEl === node) menuEl = null
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }}
  onpointerdown={(event) => {
    if (menuEl && event.target instanceof Node && menuEl.contains(event.target)) return
    onClose()
  }}
/>

<svelte:document onscrollcapture={onClose} />

<div
  {@attach attachMenu}
  class="menu"
  style:left="{x}px"
  style:top="{y}px"
  role="menu"
  aria-label="Acciones del árbol"
>
  {#if variant === 'blank'}
    <button type="button" class="item" role="menuitem" onclick={onNewFile}> Nuevo archivo </button>
    <button type="button" class="item" role="menuitem" onclick={onNewFolder}>
      Nueva carpeta
    </button>
  {:else}
    <button type="button" class="item danger" role="menuitem" onclick={onDelete}>
      Borrar <span class="key">(Delete)</span>
    </button>
    <button type="button" class="item" role="menuitem" onclick={onRename}>
      Renombrar <span class="key">(F2)</span>
    </button>
  {/if}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 40;
    display: flex;
    flex-direction: column;
    min-width: 11.5rem;
    padding: 0.2rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.28);
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.28rem 0.45rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }

  .item:hover,
  .item:focus-visible {
    background: var(--surface-hover);
    outline: none;
  }

  .item.danger {
    color: var(--danger);
  }

  .key {
    color: var(--text-faint);
    font-size: 0.72rem;
  }

  .item.danger .key {
    color: var(--danger);
    opacity: 0.7;
  }
</style>
