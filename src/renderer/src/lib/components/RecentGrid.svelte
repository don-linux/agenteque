<script lang="ts">
  import type { RecentFolder } from '$lib/app-config.svelte'

  let {
    recents,
    onOpen,
    onRemove,
  }: {
    recents: RecentFolder[]
    onOpen: (path: string) => void
    onRemove: (path: string) => void
  } = $props()

  function splitPath(path: string): { name: string; parent: string } {
    const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path
    const index = trimmed.lastIndexOf('/')

    if (index < 0) return { name: trimmed, parent: '' }

    return {
      name: trimmed.slice(index + 1) || trimmed,
      parent: trimmed.slice(0, index),
    }
  }
</script>

{#if recents.length > 0}
  <ul class="grid">
    {#each recents as recent (recent.path)}
      {@const parts = splitPath(recent.path)}
      <li>
        <article class="card" class:missing={!recent.exists}>
          <button
            type="button"
            class="open"
            disabled={!recent.exists}
            title={recent.path}
            onclick={() => onOpen(recent.path)}
          >
            <span class="name">{parts.name}</span>
            {#if parts.parent}
              <span class="parent">{parts.parent}</span>
            {/if}
            {#if !recent.exists}
              <span class="gone">ya no está en el disco</span>
            {/if}
          </button>
          <button
            type="button"
            class="remove"
            aria-label="Quitar {parts.name} del historial"
            onclick={() => onRemove(recent.path)}
          >
            ×
          </button>
        </article>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 16rem);
    gap: 0.85rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .card {
    position: relative;
    display: flex;
    min-height: 7.5rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
  }

  .card:hover {
    border-color: var(--accent);
  }

  .card.missing {
    opacity: 0.62;
  }

  .card.missing:hover {
    border-color: var(--border);
  }

  .open {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 0.3rem;
    min-width: 0;
    padding: 1rem 2.4rem 1rem 1rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .open:disabled {
    cursor: default;
  }

  .open:not(:disabled):hover {
    background: var(--surface-hover);
  }

  .name {
    overflow: hidden;
    max-width: 100%;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .parent,
  .gone {
    overflow: hidden;
    max-width: 100%;
    color: var(--text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .gone {
    color: var(--danger);
  }

  .remove {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    width: 1.7rem;
    height: 1.7rem;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-faint);
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
  }

  .remove:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
