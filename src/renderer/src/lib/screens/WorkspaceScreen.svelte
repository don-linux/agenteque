<script lang="ts">
  import FolderPlus from '@lucide/svelte/icons/folder-plus'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import { appConfig } from '$lib/app-config.svelte'
  import { browser } from '$lib/browser.svelte'
  import { handleBrowserFocusUrlShortcut, handleBrowserShortcut } from '$lib/browser-shortcuts'
  import BrowserView from '$lib/components/BrowserView.svelte'
  import EditorPane from '$lib/components/EditorPane.svelte'
  import FileTreePanel from '$lib/components/FileTreePanel.svelte'
  import FooterActions from '$lib/components/FooterActions.svelte'
  import FooterTransient from '$lib/components/FooterTransient.svelte'
  import GitGraphPanel from '$lib/components/GitGraphPanel.svelte'
  import PanelSplitter from '$lib/components/PanelSplitter.svelte'
  import TerminalHost from '$lib/components/TerminalHost.svelte'
  import { FOLDER_VISIBILITY_LABEL } from '$lib/folder-visibility'
  import {
    handleGitToggleShortcut,
    handleTreeToggleShortcut,
    isTerminalTarget,
  } from '$lib/panel-shortcuts'
  import { shortcutLabel } from '$lib/platform'
  import { handleSaveShortcut } from '$lib/save-shortcut'
  import { handleTerminalShortcut, handleTerminalSurfaceShortcut } from '$lib/terminal-dock'
  import { requestTerminalSurface } from '$lib/terminal-surface'
  import { terminal } from '$lib/terminal.svelte'
  import { unsavedExit } from '$lib/unsaved-exit.svelte'
  import { panels } from '$lib/workspace-panels.svelte'
  import { surface } from '$lib/workspace-surface.svelte'
  import { workspace } from '$lib/workspace.svelte'

  const treeLabel = `Árbol de archivos (${shortcutLabel('Ctrl+T')}) · dentro de la terminal, ${shortcutLabel('Ctrl+Shift+T')}`

  let terminals = $derived(surface.current === 'terminals')
  let browsing = $derived(surface.current === 'browser')
  let parkedChrome = $derived(terminals || browsing)
  let peeking = $derived(terminal.peeking)
  let showTree = $derived(panels.treeVisible)

  $effect(() => {
    if (appConfig.loaded) panels.hydrate(appConfig.layout)
  })

  async function toggleSurface(): Promise<void> {
    await requestTerminalSurface({
      surface: terminal.surface,
      hasUnsaved: workspace.hasUnsaved,
      confirmSave: () => unsavedExit.request('save'),
      saveAll: () => workspace.saveAll(),
      enter: () => terminal.enterTerminals(),
      leave: () => terminal.leaveTerminals(),
    })
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (surface.current === 'editor') {
      handleSaveShortcut(event, { save: () => void workspace.save() })
    }

    handleTerminalShortcut(event, {
      hasWorkspace: workspace.root !== null,
      surface: terminal.surface,
      toggle: (dock) => panels.toggleTerminal(dock),
    })
    handleTerminalSurfaceShortcut(event, {
      hasWorkspace: workspace.root !== null,
      toggleSurface: () => void toggleSurface(),
    })
    handleBrowserShortcut(event, {
      hasWorkspace: workspace.root !== null,
      insideTerminal: isTerminalTarget(event.target),
      toggleBrowser: () => browser.toggle(),
    })
    handleBrowserFocusUrlShortcut(event, {
      browserSurface: surface.current === 'browser',
      focusUrl: () => browser.claimUrlBar(),
    })
    handleTreeToggleShortcut(event, {
      hasWorkspace: workspace.root !== null,
      insideTerminal: isTerminalTarget(event.target),
      toggleTree: () => panels.toggleTree(),
    })
    handleGitToggleShortcut(event, {
      hasWorkspace: workspace.root !== null,
      insideTerminal: isTerminalTarget(event.target),
      toggleGit: () => panels.toggleGit(),
    })
  }
</script>

<svelte:window
  onkeydowncapture={onWindowKeydown}
  onresize={() => panels.fit(window.innerWidth, window.innerHeight)}
/>

<div class="ide">
  <div class="body">
    <div
      class="workspace"
      class:with-tree={showTree && !parkedChrome}
      class:term-bottom={peeking && terminal.dock === 'bottom'}
      class:term-right={peeking && terminal.dock === 'right'}
      class:surface-terminals={terminals}
      class:surface-browser={browsing}
      style:--tree-width="{panels.treeWidth}px"
      style:--term-size="{terminal.size}px"
      style:--park-width="{terminal.parkWidth}px"
      style:--park-height="{terminal.parkHeight}px"
    >
      {#if showTree}
        {#if panels.gitVisible}
          <GitGraphPanel parked={parkedChrome} />
        {:else}
          <FileTreePanel parked={parkedChrome} />
        {/if}
        {#if !parkedChrome}
          <div class="sash">
            <PanelSplitter
              axis="x"
              grow="forward"
              size={panels.treeWidth}
              label="Redimensionar el árbol de archivos"
              onSize={(pixels) => panels.setTreeWidth(pixels, window.innerWidth)}
              onCommit={() => panels.commitResize()}
            />
          </div>
        {/if}
      {/if}

      <EditorPane parked={parkedChrome} />

      {#if terminal.started}
        <div class="term-slot" class:parked={!peeking && !terminals}>
          {#if peeking}
            <PanelSplitter
              axis={terminal.dock === 'bottom' ? 'y' : 'x'}
              grow="backward"
              size={terminal.size}
              label="Redimensionar la terminal"
              onSize={(pixels) =>
                terminal.setSize(
                  pixels,
                  terminal.dock === 'bottom' ? window.innerHeight : window.innerWidth,
                  panels.treeSpace,
                )}
              onCommit={() => panels.commitResize()}
            />
          {/if}
          <TerminalHost cwd={workspace.root ?? ''} />
        </div>
      {/if}

      {#if browser.started}
        <div class="browser-slot" class:parked={!browsing}>
          <BrowserView />
        </div>
      {/if}
    </div>
  </div>
  <footer>
    <div class="footer-start">
      <div class="brand-group">
        <span class="brand">agenteque</span>
        {#if !panels.treeVisible}
          <button
            type="button"
            class="action"
            aria-label={treeLabel}
            title={treeLabel}
            onclick={() => panels.toggleTree()}
          >
            <PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        {/if}
        {#if workspace.canEditVisibility}
          <button
            type="button"
            class="action"
            aria-label={FOLDER_VISIBILITY_LABEL}
            title={FOLDER_VISIBILITY_LABEL}
            onclick={() => void workspace.editVisibility()}
          >
            <FolderPlus size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <FooterTransient />
    </div>
    <FooterActions />
  </footer>
</div>

<style>
  .ide {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .body {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  footer {
    position: sticky;
    bottom: 0;
    z-index: 10;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    height: var(--footer-height);
    padding: 0 0.5rem;
    border-top: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-faint);
  }

  .footer-start {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-group {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.2rem;
  }

  .brand {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: lowercase;
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

  .action:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  /*
   * Cuatro regiones, dos de ellas opcionales. Las pistas van con nombre para
   * que un árbol oculto o una terminal aparcada simplemente salgan de la
   * plantilla, y toda región visible conserve un tamaño definido: xterm mide
   * su propia caja y necesita uno.
   */
  .workspace {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    grid-template-areas: 'editor';
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .workspace.with-tree {
    grid-template-columns: var(--tree-width) 4px 1fr;
    grid-template-areas: 'tree sash editor';
  }

  .workspace.term-bottom {
    grid-template-rows: 1fr var(--term-size);
    grid-template-areas: 'editor' 'term';
  }

  .workspace.with-tree.term-bottom {
    grid-template-columns: var(--tree-width) 4px 1fr;
    grid-template-rows: 1fr var(--term-size);
    grid-template-areas: 'tree sash editor' 'tree sash term';
  }

  .workspace.term-right {
    grid-template-columns: 1fr var(--term-size);
    grid-template-areas: 'editor term';
  }

  .workspace.with-tree.term-right {
    grid-template-columns: var(--tree-width) 4px 1fr var(--term-size);
    grid-template-areas: 'tree sash editor term';
  }

  .workspace.surface-terminals,
  .workspace.surface-browser {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: block;
    width: auto;
    height: auto;
  }

  .sash {
    display: flex;
    grid-area: sash;
    min-width: 0;
  }

  .term-slot {
    display: flex;
    box-sizing: border-box;
    grid-area: term;
    align-self: stretch;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .workspace.term-bottom .term-slot {
    flex-direction: column;
    border-top: 1px solid var(--border);
  }

  .workspace.term-right .term-slot {
    flex-direction: row;
    border-left: 1px solid var(--border);
  }

  .workspace.surface-terminals .term-slot {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: block;
    width: auto;
    height: auto;
    min-height: 0;
    border: 0;
  }

  /* Vivo pero fuera de vista: xterm conserva una caja medible. */
  .term-slot.parked,
  .browser-slot.parked {
    position: fixed;
    top: 0;
    left: -12000px;
    width: var(--park-width);
    height: var(--park-height);
    overflow: hidden;
    pointer-events: none;
    z-index: -1;
  }

  .browser-slot {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .browser-slot.parked {
    width: min(80vw, 1200px);
    height: 80vh;
  }
</style>
