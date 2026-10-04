<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { tick } from 'svelte'
  import { filterComboItems } from '$lib/combobox'
  import { CURRENT_BRANCH_LANE } from '$lib/git-branch-colors'
  import { branchPickerLabel } from '$lib/git-divergence'
  import type { GitRef } from '$lib/git-graph.svelte'
  import { graphLaneVar } from '$lib/ui-theme'

  let {
    branches,
    current,
    selected,
    detached,
    colors,
    laneCount,
    disabled = false,
    onToggle,
  }: {
    branches: GitRef[]
    current: string | null
    selected: string[]
    detached: boolean
    colors: ReadonlyMap<string, number>
    /** Carriles del tema activo: el acento más sus secundarios. */
    laneCount: number
    disabled?: boolean
    onToggle: (name: string) => void
  } = $props()

  let open = $state(false)
  let query = $state('')
  let highlight = $state(0)
  let root: HTMLDivElement | undefined
  let searchEl = $state<HTMLInputElement | undefined>(undefined)

  let items = $derived(
    branches.map((branch) => ({
      value: branch.name,
      label: branch.current ? `${branch.name} (actual)` : branch.name,
    })),
  )
  let visible = $derived(filterComboItems(items, query))
  let label = $derived(branchPickerLabel(current, selected, detached))

  function isCurrent(name: string): boolean {
    return current !== null && name === current
  }

  function isChecked(name: string): boolean {
    return isCurrent(name) || selected.includes(name)
  }

  function swatch(name: string): string {
    return graphLaneVar(colors.get(name) ?? CURRENT_BRANCH_LANE, laneCount)
  }

  async function openList(): Promise<void> {
    if (disabled) return
    open = true
    query = ''
    highlight = 0
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

  function choose(name: string): void {
    if (isCurrent(name)) return
    onToggle(name)
  }

  function onSearchInput(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value
    highlight = 0
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      highlight = visible.length === 0 ? 0 : (highlight + 1) % visible.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      highlight = visible.length === 0 ? 0 : (highlight - 1 + visible.length) % visible.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = visible[highlight]
      if (item?.value) choose(item.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeList()
    }
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (!open || !root) return
    const target = event.target
    if (target instanceof Node && root.contains(target)) return
    closeList()
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="picker" class:open bind:this={root}>
  <button
    type="button"
    class="trigger"
    aria-label="Ramas a comparar"
    aria-haspopup="listbox"
    aria-expanded={open}
    {disabled}
    title={label}
    onclick={toggle}
  >
    <span class="label">{label}</span>
    <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
  </button>

  {#if open}
    <div class="menu">
      <input
        bind:this={searchEl}
        class="search"
        type="search"
        placeholder="Buscar rama"
        value={query}
        oninput={onSearchInput}
        onkeydown={onSearchKeydown}
      />
      {#if visible.length === 0}
        <p class="empty">No hay coincidencias.</p>
      {:else}
        <ul
          class="list"
          role="listbox"
          aria-label="Ramas del repositorio"
          aria-multiselectable="true"
        >
          {#each visible as item, index (item.value)}
            {@const name = item.value ?? ''}
            {@const pinned = isCurrent(name)}
            <li>
              <button
                type="button"
                class="option"
                class:active={index === highlight}
                class:pinned
                role="option"
                aria-selected={isChecked(name)}
                disabled={pinned}
                onclick={() => choose(name)}
                onpointerenter={() => (highlight = index)}
              >
                <span
                  class="box"
                  class:on={isChecked(name)}
                  style:--swatch={swatch(name)}
                  aria-hidden="true"
                ></span>
                <span class="name">{item.label}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .trigger {
    display: flex;
    width: 100%;
    height: 1.5rem;
    align-items: center;
    gap: 0.2rem;
    padding: 0 0.3rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .trigger:hover,
  .picker.open .trigger {
    background: var(--surface-hover);
    color: var(--text);
  }

  .trigger:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    font-size: 0.72rem;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu {
    position: absolute;
    top: calc(100% + 0.2rem);
    right: 0;
    left: 0;
    z-index: 20;
    display: flex;
    max-height: 16rem;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: 0 8px 24px color-mix(in srgb, #000 35%, transparent);
  }

  .search {
    flex-shrink: 0;
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-size: 0.75rem;
    outline: none;
  }

  .list {
    margin: 0;
    padding: 0.2rem;
    overflow-y: auto;
    list-style: none;
  }

  .option {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.4rem;
    padding: 0.28rem 0.35rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
  }

  .option.active,
  .option:hover {
    background: var(--surface-hover);
  }

  .option.pinned {
    cursor: default;
    color: var(--text-muted);
  }

  /* El cuadrito es el código de color de la rama y a la vez la marca de
     selección: contorno si no está comparada, relleno si sí. */
  .box {
    width: 0.7rem;
    height: 0.7rem;
    flex-shrink: 0;
    border: 1px solid var(--swatch);
    border-radius: 2px;
    background: transparent;
  }

  .box.on {
    background: var(--swatch);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    margin: 0;
    padding: 0.5rem;
    color: var(--text-faint);
    font-size: 0.75rem;
  }
</style>
