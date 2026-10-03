<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { tabBasename } from '$lib/editor-tabs'
  import { workspace } from '$lib/workspace.svelte'

  function closeTab(event: MouseEvent, path: string): void {
    event.preventDefault()
    event.stopPropagation()
    void workspace.closeTab(path)
  }
</script>

<div class="tabs" role="tablist" aria-label="Archivos abiertos">
  {#each workspace.openTabs as path (path)}
    {@const active = path === workspace.currentPath}
    {@const name = tabBasename(path)}
    <div class={['tab', { active }]} role="presentation">
      <button
        type="button"
        class="select"
        role="tab"
        aria-selected={active}
        title={path}
        onclick={() => void workspace.openFile(path)}
      >
        <span class="name">{name}</span>
        {#if workspace.hasDraft(path)}
          <span class="dirty" title="Sin guardar" aria-label="Sin guardar"></span>
        {/if}
      </button>
      <button
        type="button"
        class="close"
        aria-label="Cerrar {name}"
        title="Cerrar"
        onclick={(event) => closeTab(event, path)}
      >
        <X size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: stretch;
    overflow-x: auto;
  }

  .tab {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    max-width: 14rem;
    border-right: 1px solid var(--border);
  }

  .tab.active {
    background: var(--accent-soft);
  }

  .select {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 0.15rem 0.55rem 0.85rem;
    border: 0;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .tab.active .select {
    color: var(--accent);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dirty {
    flex-shrink: 0;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .close {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1.35rem;
    height: 1.35rem;
    margin-right: 0.25rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }

  .close:hover,
  .close:focus-visible {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
