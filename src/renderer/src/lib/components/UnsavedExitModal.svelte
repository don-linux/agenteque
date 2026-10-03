<script lang="ts">
  import { unsavedExit } from '$lib/unsaved-exit.svelte'

  const uid = $props.id()
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!unsavedExit.open) return
    if (event.key !== 'Escape') return

    event.preventDefault()
    unsavedExit.cancel()
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if unsavedExit.open}
  <div class="overlay">
    <button
      type="button"
      class="backdrop"
      aria-label="Cancelar"
      onclick={() => unsavedExit.cancel()}
    ></button>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <h2 id={titleId}>Cambios sin guardar</h2>
      {#if unsavedExit.mode === 'tab'}
        <p id={descId}>
          Este archivo tiene cambios sin guardar. Si lo cierras, esos cambios no se pueden
          recuperar.
        </p>
      {:else if unsavedExit.mode === 'save'}
        <p id={descId}>
          Hay archivos con cambios sin guardar. Se van a guardar antes de pasar a las terminales.
        </p>
      {:else}
        <p id={descId}>
          Hay archivos con cambios sin guardar. Si sales, esos cambios no se pueden recuperar.
        </p>
      {/if}
      <div class="actions">
        <button type="button" onclick={() => unsavedExit.cancel()}>Cancelar</button>
        <button
          type="button"
          class={unsavedExit.mode === 'save' ? 'continue' : 'leave'}
          onclick={() => unsavedExit.confirm()}
        >
          {unsavedExit.mode === 'tab'
            ? 'Cerrar'
            : unsavedExit.mode === 'save'
              ? 'Guardar y continuar'
              : 'Salir'}
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
    color: var(--accent);
  }

  .actions button.leave {
    border-color: var(--danger);
    background: transparent;
    color: var(--danger);
  }

  .actions button.leave:hover {
    background: var(--surface-hover);
    border-color: var(--danger);
    color: var(--danger);
  }

  .actions button.continue {
    border-color: var(--accent);
    background: transparent;
    color: var(--accent);
  }

  .actions button.continue:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
