<script lang="ts">
  import { browser } from '$lib/browser.svelte'

  const uid = $props.id()
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!browser.closeRequested) return
    if (event.key !== 'Escape') return

    event.preventDefault()
    browser.cancelClose()
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if browser.closeRequested}
  <div class="overlay">
    <button
      type="button"
      class="backdrop"
      aria-label="Cancelar"
      onclick={() => browser.cancelClose()}
    ></button>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <h2 id={titleId}>agenteque</h2>
      <p id={descId}>¿Cerrar el navegador? Se cierran todas las pestañas y se libera Chromium.</p>
      <div class="actions">
        <button type="button" onclick={() => browser.cancelClose()}>Cancelar</button>
        <button type="button" class="leave" onclick={() => void browser.confirmClose()}
          >Cerrar</button
        >
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
    width: min(22rem, calc(100vw - 2rem));
    padding: 1.25rem 1.25rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
  }

  p {
    margin: 0 0 1.1rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

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

  .actions button:hover {
    border-color: var(--accent);
  }

  .leave {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
