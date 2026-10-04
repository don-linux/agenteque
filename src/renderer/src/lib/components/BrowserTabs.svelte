<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import { browser } from '$lib/browser.svelte'
  import { tabLabel } from '$lib/browser-tabs'

  function closeTab(event: MouseEvent, id: string): void {
    event.preventDefault()
    event.stopPropagation()
    void browser.closeTab(id)
  }
</script>

<div class="strip" data-browser-tabs>
  <div class="tabs" role="tablist" aria-label="Pestañas">
    {#each browser.tabs as tab (tab.id)}
      {@const active = tab.id === browser.activeId}
      {@const label = tabLabel(tab.title, tab.url)}
      <div class={['tab', { active }]} role="presentation" data-browser-tab={tab.id}>
        <button
          type="button"
          class="select"
          role="tab"
          aria-selected={active}
          title={label}
          onpointerdown={() => browser.claimChromeKeyboard()}
          onclick={() => void browser.selectTab(tab.id)}
        >
          <span class="name">{label}</span>
        </button>
        <button
          type="button"
          class="close"
          aria-label="Cerrar {label}"
          title="Cerrar"
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => closeTab(event, tab.id)}
        >
          <X size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    {/each}
  </div>
  <button
    type="button"
    class="plus"
    aria-label="Nueva pestaña"
    title="Nueva pestaña"
    disabled={!browser.alive}
    onpointerdown={() => browser.claimChromeKeyboard()}
    onclick={() => void browser.newTab()}
  >
    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
  </button>
</div>

<style>
  .strip {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    min-width: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

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
    padding: 0.4rem 0.15rem 0.4rem 0.7rem;
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

  .close,
  .plus {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1.35rem;
    height: 1.35rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }

  .close {
    margin-right: 0.25rem;
  }

  .plus {
    align-self: center;
    margin: 0 0.3rem;
  }

  .close:hover,
  .close:focus-visible,
  .plus:hover:not(:disabled),
  .plus:focus-visible {
    background: var(--surface-hover);
    color: var(--text);
    outline: none;
  }

  .plus:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
