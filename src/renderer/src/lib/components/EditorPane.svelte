<script lang="ts">
  import EditorTabs from './EditorTabs.svelte'
  import MarkdownEditor from './MarkdownEditor.svelte'
  import { appConfig } from '$lib/app-config.svelte'
  import { terminal } from '$lib/terminal.svelte'
  import { workspace } from '$lib/workspace.svelte'

  let { parked = false }: { parked?: boolean } = $props()

  let status = $derived.by(() => {
    if (workspace.saveState === 'error') return 'error al guardar'
    if (workspace.saveState === 'saving') return 'guardando'
    if (workspace.dirty) return 'sin guardar'
    if (workspace.saveState === 'saved') return 'guardado'
    return ''
  })
</script>

<section class="editor-col" class:parked>
  {#if workspace.currentPath === null}
    <p class="hint centered">Selecciona un archivo.</p>
  {:else}
    <header>
      <EditorTabs />
      <span class="status" class:error={workspace.saveState === 'error'}>{status}</span>
    </header>
    <MarkdownEditor
      path={workspace.currentPath}
      content={workspace.content}
      contentReady={workspace.contentReady}
      onChange={(contents) => workspace.edit(contents)}
    />
  {/if}

  {#if workspace.error || appConfig.error || terminal.error}
    <p class="error banner">{workspace.error ?? appConfig.error ?? terminal.error}</p>
  {/if}
</section>

<style>
  .editor-col {
    display: flex;
    flex-direction: column;
    grid-area: editor;
    min-width: 0;
    min-height: 0;
  }

  .editor-col.parked {
    position: fixed;
    top: 0;
    left: -12000px;
    width: min(80vw, 1200px);
    height: 80vh;
    overflow: hidden;
    pointer-events: none;
    z-index: -1;
  }

  header {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    gap: 1rem;
    min-height: 2.35rem;
    border-bottom: 1px solid var(--border);
  }

  .status {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    padding-right: 1.5rem;
    color: var(--text-faint);
    font-size: 0.72rem;
  }

  .status.error {
    color: var(--danger);
  }

  .hint {
    margin: 0;
    padding: 1rem;
    color: var(--text-faint);
    font-size: 0.82rem;
  }

  .centered {
    display: grid;
    flex: 1;
    place-content: center;
  }

  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }

  .banner {
    margin: 0;
    padding: 0.6rem 1.5rem;
    border-top: 1px solid var(--border);
  }
</style>
