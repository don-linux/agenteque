<script lang="ts">
  import { folderVisibility } from '$lib/folder-visibility.svelte'

  const uid = $props.id()
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!folderVisibility.open) return
    if (event.key !== 'Escape') return

    event.preventDefault()
    folderVisibility.cancel()
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if folderVisibility.open}
  <div class="overlay">
    <button
      type="button"
      class="backdrop"
      aria-label="Cancelar"
      onclick={() => folderVisibility.cancel()}
    ></button>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <h2 id={titleId}>Carpetas visibles</h2>
      <p id={descId}>
        Elige qué carpetas de {folderVisibility.rootName} se muestran en el árbol. Los archivos markdown
        en la raíz siempre se ven.
      </p>
      <div class="toolbar">
        <button type="button" onclick={() => folderVisibility.selectAll()}>Todas</button>
        <button type="button" onclick={() => folderVisibility.selectNone()}>Ninguna</button>
      </div>
      <ul class="dirs">
        {#each folderVisibility.dirs as dir (dir)}
          <li>
            <label class="row">
              <input
                type="checkbox"
                checked={folderVisibility.isSelected(dir)}
                onchange={() => folderVisibility.toggle(dir)}
              />
              <span>{dir}</span>
            </label>
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button type="button" onclick={() => folderVisibility.cancel()}>Cancelar</button>
        <button type="button" class="confirm" onclick={() => folderVisibility.confirm()}>
          Confirmar
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .backdrop {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }

  .dialog {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(28rem, calc(100vw - 2rem));
    max-height: min(36rem, calc(100vh - 2rem));
    padding: 1.25rem 1.25rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 28px var(--shadow);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
  }

  p {
    margin: 0 0 0.85rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .toolbar button,
  .actions button {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    background: var(--surface-hover);
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .toolbar button:hover,
  .actions button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .dirs {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-height: 0;
    margin: 0 0 1.1rem;
    padding: 0;
    overflow: auto;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
  }

  .row:hover {
    background: var(--surface-hover);
  }

  .row input {
    flex-shrink: 0;
    width: 0.95rem;
    height: 0.95rem;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .row span {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 0.85rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .actions button.confirm {
    border-color: var(--accent);
    background: transparent;
    color: var(--accent);
  }

  .actions button.confirm:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
