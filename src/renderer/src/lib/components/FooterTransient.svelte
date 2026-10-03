<script lang="ts">
  import Save from '@lucide/svelte/icons/save'
  import SquarePlus from '@lucide/svelte/icons/square-plus'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import { editorSession } from '$lib/editor-session.svelte'
  import { shortcutLabel } from '$lib/platform'
  import { terminal } from '$lib/terminal.svelte'
  import { surface } from '$lib/workspace-surface.svelte'
  import { workspace } from '$lib/workspace.svelte'

  const undoLabel = `Deshacer (${shortcutLabel('Ctrl+Z')})`
  const saveLabel = `Guardar (${shortcutLabel('Ctrl+S')})`
</script>

<div class="transient">
  {#if surface.current === 'terminals'}
    <button
      type="button"
      class="action"
      aria-label="Nueva terminal"
      title={terminal.canAdd ? 'Nueva terminal' : 'Máximo 6 terminales'}
      disabled={!terminal.canAdd}
      onclick={() => terminal.addSession()}
    >
      <SquarePlus size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  {:else if surface.current !== 'browser'}
    {#if editorSession.canUndo}
      <button
        type="button"
        class="action"
        aria-label={undoLabel}
        title={undoLabel}
        onclick={() => editorSession.undo()}
      >
        <Undo2 size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {/if}
    {#if workspace.dirty}
      <button
        type="button"
        class="action"
        aria-label={saveLabel}
        title={saveLabel}
        onclick={() => void workspace.save()}
      >
        <Save size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {/if}
  {/if}
</div>

<style>
  .transient {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 0.15rem;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.65rem;
    height: 1.65rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .action:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text);
  }

  .action:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
