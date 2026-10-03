<script lang="ts">
  import Settings from '@lucide/svelte/icons/settings'
  import { appConfig } from '$lib/app-config.svelte'
  import { ROUTES } from '$lib/app-routes'
  import RecentGrid from '$lib/components/RecentGrid.svelte'
  import { router } from '$lib/router.svelte'
  import { workspace } from '$lib/workspace.svelte'

  async function openFolder(): Promise<void> {
    await workspace.openFolder()
    if (workspace.root !== null) router.go(ROUTES.workspace)
  }

  async function openRecent(path: string): Promise<void> {
    await workspace.openRoot(path)
    if (workspace.root !== null) router.go(ROUTES.workspace)
  }
</script>

<main class="home">
  <header>
    <div>
      <h1>agenteque</h1>
      <p>Abre una carpeta para ver y editar sus archivos markdown.</p>
    </div>
    <div class="header-actions">
      <a href={ROUTES.settings} class="icon" aria-label="Configuración" title="Configuración">
        <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
      </a>
      <button type="button" class="primary" onclick={() => openFolder()}>Abrir carpeta</button>
    </div>
  </header>

  <p class="demo">
    Esta etapa trae la interfaz completa sobre un workspace de demostración en memoria: el botón
    abre siempre la misma carpeta de ejemplo y nada toca el disco.
  </p>

  {#if appConfig.recents.length === 0 && appConfig.loaded}
    <p class="empty">Todavía no hay carpetas en el historial.</p>
  {/if}

  <RecentGrid
    recents={appConfig.recents}
    onOpen={openRecent}
    onRemove={(path) => appConfig.remove(path)}
  />

  {#if workspace.error || appConfig.error}
    <p class="error">{workspace.error ?? appConfig.error}</p>
  {/if}
</main>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
    overflow: auto;
    padding: 2rem 2rem 3rem;
  }

  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .header-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.5rem;
  }

  a.icon {
    display: inline-flex;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    width: 2.35rem;
    height: 2.35rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-hover);
    color: var(--text);
    text-decoration: none;
  }

  a.icon:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.6rem;
    font-weight: 600;
  }

  .home p {
    max-width: 34rem;
    margin: 0;
    color: var(--text-muted);
  }

  .demo {
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    background: var(--surface);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .empty {
    color: var(--text-faint);
    font-size: 0.85rem;
  }

  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }

  button {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    background: var(--surface-hover);
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  button.primary {
    padding: 0.5rem 1.1rem;
    font-size: 0.9rem;
  }
</style>
