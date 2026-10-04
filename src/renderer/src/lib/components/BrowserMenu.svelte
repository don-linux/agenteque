<script lang="ts">
  let {
    x,
    y,
    label,
    items,
    current,
    onPick,
    onClose,
  }: {
    x: number
    y: number
    label: string
    items: readonly { id: string; label: string }[]
    current: string
    onPick: (id: string) => void
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
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }}
  onpointerdown={(event) => {
    if (menuEl && event.target instanceof Node && menuEl.contains(event.target)) return
    onClose()
  }}
/>

<div
  {@attach attachMenu}
  class="menu"
  style:left="{x}px"
  style:top="{y}px"
  role="menu"
  aria-label={label}
  data-browser-menu
>
  {#each items as item (item.id)}
    <button
      type="button"
      class="item"
      role="menuitemradio"
      aria-checked={item.id === current}
      onclick={() => onPick(item.id)}
    >
      {item.label}
    </button>
  {/each}
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

  .item[aria-checked='true'] {
    color: var(--accent);
  }
</style>
