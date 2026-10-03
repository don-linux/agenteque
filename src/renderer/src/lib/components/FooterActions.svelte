<script lang="ts">
  import Folder from '@lucide/svelte/icons/folder'
  import Globe from '@lucide/svelte/icons/globe'
  import House from '@lucide/svelte/icons/house'
  import Settings from '@lucide/svelte/icons/settings'
  import SquareTerminal from '@lucide/svelte/icons/square-terminal'
  import { ROUTES } from '$lib/app-routes'
  import { browser } from '$lib/browser.svelte'
  import {
    DEFAULT_FOOTER_ACTION_ORDER,
    runFooterAction,
    type FooterActionId,
  } from '$lib/footer-actions'
  import { shortcutLabel } from '$lib/platform'
  import { router } from '$lib/router.svelte'
  import { dockFromAlt } from '$lib/terminal-dock'
  import { terminal } from '$lib/terminal.svelte'
  import { panels } from '$lib/workspace-panels.svelte'
  import { surface } from '$lib/workspace-surface.svelte'
  import { workspace } from '$lib/workspace.svelte'

  const labels: Record<FooterActionId, string> = {
    home: 'Inicio',
    folder: 'Cambiar',
    settings: 'Configuración',
    terminal: 'Terminal',
    browser: 'Navegador',
  }

  const titles: Record<FooterActionId, string> = {
    home: 'Inicio',
    folder: 'Cambiar carpeta',
    settings: 'Configuración',
    terminal: `Terminal (${shortcutLabel('Ctrl+J')}) · a la derecha (${shortcutLabel(
      'Ctrl+Alt+J',
    )}) · pantalla (${shortcutLabel('Ctrl+Shift+J')})`,
    browser: `Navegador (${shortcutLabel('Ctrl+B')}) · desde la terminal, ${shortcutLabel(
      'Ctrl+Shift+B',
    )}`,
  }

  function onActionClick(id: FooterActionId, event: MouseEvent): void {
    runFooterAction(id, {
      home: () => {
        void workspace.closeWorkspace().then((left) => {
          if (left) router.go(ROUTES.home)
        })
      },
      folder: () => {
        void workspace.openFolder()
      },
      terminal: () => {
        panels.toggleTerminal(dockFromAlt(event.altKey))
      },
      browser: () => {
        browser.toggle()
      },
    })
  }
</script>

<div class="actions">
  {#each DEFAULT_FOOTER_ACTION_ORDER as id (id)}
    <span class="item">
      {#if id === 'settings'}
        <a
          href={ROUTES.settings}
          class="action"
          aria-label={labels.settings}
          title={titles.settings}
          draggable="false"
        >
          <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
        </a>
      {:else}
        <button
          type="button"
          class={[
            'action',
            {
              active:
                (id === 'terminal' && (terminal.open || terminal.surface === 'terminals')) ||
                (id === 'browser' && surface.current === 'browser'),
            },
          ]}
          aria-pressed={id === 'terminal'
            ? terminal.open || terminal.surface === 'terminals'
            : id === 'browser'
              ? surface.current === 'browser'
              : undefined}
          aria-label={labels[id]}
          title={titles[id]}
          onclick={(event) => onActionClick(id, event)}
        >
          {#if id === 'home'}
            <House size={16} strokeWidth={1.75} aria-hidden="true" />
          {:else if id === 'folder'}
            <Folder size={16} strokeWidth={1.75} aria-hidden="true" />
          {:else if id === 'browser'}
            <Globe size={16} strokeWidth={1.75} aria-hidden="true" />
          {:else}
            <SquareTerminal size={16} strokeWidth={1.75} aria-hidden="true" />
          {/if}
        </button>
      {/if}
    </span>
  {/each}
</div>

<style>
  .actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    margin-left: auto;
    gap: 0.15rem;
    user-select: none;
  }

  .item {
    display: inline-flex;
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
    text-decoration: none;
    cursor: pointer;
  }

  .action:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .action.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
