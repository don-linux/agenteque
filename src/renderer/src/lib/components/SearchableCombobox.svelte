<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { tick } from 'svelte'
  import { comboItemLabel, filterComboItems, type ComboItem } from '$lib/combobox'

  let {
    items,
    value,
    onSelect,
    disabled = false,
    id,
    emptyLabel = 'No hay coincidencias.',
  }: {
    items: ComboItem[]
    value: string | null
    onSelect: (value: string | null) => void
    disabled?: boolean
    id: string
    emptyLabel?: string
  } = $props()

  let open = $state(false)
  let query = $state('')
  let highlight = $state(0)
  let root: HTMLDivElement | undefined
  let list = $state<HTMLUListElement | undefined>(undefined)
  let searchEl = $state<HTMLInputElement | undefined>(undefined)

  let visible = $derived(filterComboItems(items, query))
  let listId = $derived(`${id}-list`)
  let activeId = $derived(visible[highlight] ? `${id}-option-${highlight}` : undefined)
  let selectedLabel = $derived(comboItemLabel(items, value))

  async function openList(): Promise<void> {
    if (disabled) return
    open = true
    query = ''
    const index = items.findIndex((item) => item.value === value)
    highlight = index === -1 ? 0 : index
    await tick()
    searchEl?.focus()
  }

  function closeList(): void {
    open = false
    query = ''
    highlight = 0
  }

  function toggle(): void {
    if (disabled) return
    if (open) {
      closeList()
      return
    }
    void openList()
  }

  function choose(next: string | null): void {
    onSelect(next)
    closeList()
  }

  function onSearchInput(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value
    highlight = 0
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      void openList()
    }
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (disabled) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        void openList()
        return
      }
      highlight = visible.length === 0 ? 0 : (highlight + 1) % visible.length
      scrollHighlighted()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        void openList()
        return
      }
      highlight = visible.length === 0 ? 0 : (highlight - 1 + visible.length) % visible.length
      scrollHighlighted()
      return
    }

    if (event.key === 'Enter') {
      if (!open || visible.length === 0) return
      event.preventDefault()
      choose(visible[highlight]?.value ?? null)
      return
    }

    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      closeList()
    }
  }

  function scrollHighlighted(): void {
    const option = list?.querySelector<HTMLElement>(`#${id}-option-${highlight}`)
    option?.scrollIntoView({ block: 'nearest' })
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (!open || !root) return
    const target = event.target
    if (target instanceof Node && root.contains(target)) return
    closeList()
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="combo" bind:this={root}>
  <button
    type="button"
    {id}
    class="field"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={listId}
    {disabled}
    onclick={toggle}
    onkeydown={onTriggerKeydown}
  >
    <span class="label">{selectedLabel}</span>
    <span class={['chevron', { open }]} aria-hidden="true">
      <ChevronDown size={16} strokeWidth={1.75} />
    </span>
  </button>

  {#if open}
    <div class="panel">
      <input
        bind:this={searchEl}
        class="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-label="Filtrar"
        type="text"
        placeholder="Filtrar…"
        autocomplete="off"
        spellcheck="false"
        value={query}
        oninput={onSearchInput}
        onkeydown={onSearchKeydown}
      />
      <ul class="list" id={listId} role="listbox" bind:this={list}>
        {#if visible.length === 0}
          <li class="empty" role="presentation">{emptyLabel}</li>
        {:else}
          {#each visible as item, index (item.value ?? '__default')}
            <li
              id={`${id}-option-${index}`}
              class={['option', { active: index === highlight, selected: item.value === value }]}
              role="option"
              aria-selected={item.value === value}
              style:font-family={item.previewFamily}
              onpointerdown={(event) => {
                event.preventDefault()
                choose(item.value)
              }}
              onpointerenter={() => {
                highlight = index
              }}
            >
              {item.label}
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .combo {
    position: relative;
    width: min(32rem, 100%);
  }

  .field {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .field:focus {
    outline: none;
    border-color: var(--accent);
  }

  .field:disabled {
    color: var(--text-faint);
    cursor: not-allowed;
  }

  .field:disabled .chevron {
    color: var(--text-faint);
  }

  .panel {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.3rem);
    right: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    max-height: 16rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: 0 10px 28px var(--shadow);
  }

  .search {
    box-sizing: border-box;
    flex-shrink: 0;
    width: 100%;
    padding: 0.5rem 0.7rem;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 6px 6px 0 0;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
  }

  .search:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }

  .list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0.25rem;
    overflow: auto;
    list-style: none;
  }

  .option,
  .empty {
    padding: 0.4rem 0.55rem;
    border-radius: 4px;
    color: var(--text);
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .empty {
    color: var(--text-faint);
  }

  .option {
    cursor: pointer;
  }

  .option.active {
    background: var(--surface-hover);
  }

  .option.selected {
    color: var(--accent);
  }
</style>
