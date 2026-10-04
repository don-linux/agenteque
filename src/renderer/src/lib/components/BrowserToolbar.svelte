<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import Code from '@lucide/svelte/icons/code'
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import X from '@lucide/svelte/icons/x'
  import { appConfig } from '$lib/app-config.svelte'
  import {
    browser,
    isUrlBarElement,
    shouldApplyFocusUrlRequest,
    shouldHandleToolbarFocusIn,
  } from '$lib/browser.svelte'
  import { toolbarReloadClick } from '$lib/browser-tabs'
  import BrowserMenu from '$lib/components/BrowserMenu.svelte'
  import { surface } from '$lib/workspace-surface.svelte'
  import type { BrowserReload, DevtoolsDock } from '../../../../shared/config'

  const DEVTOOLS_ITEMS = [
    { id: 'right', label: 'Derecha' },
    { id: 'left', label: 'Izquierda' },
    { id: 'bottom', label: 'Abajo' },
    { id: 'undocked', label: 'Ventana separada' },
  ] as const

  const RELOAD_ITEMS = [
    { id: 'normal', label: 'Recargar' },
    { id: 'nocache', label: 'Recargar sin caché' },
  ] as const

  let lastFocusUrlRequest = 0

  let reloadTitle = $derived(
    appConfig.browserReload === 'nocache' ? 'Recargar sin caché' : 'Recargar',
  )
  let menu = $derived(browser.visible ? browser.menu : null)

  function attachUrl(node: HTMLInputElement): void {
    $effect(() => {
      const requested = browser.focusUrlRequested
      if (!shouldApplyFocusUrlRequest(requested, lastFocusUrlRequest)) return
      if (surface.current !== 'browser') return
      lastFocusUrlRequest = requested
      node.focus()
      node.select()
    })
  }

  function onToolbarPointerDown(): void {
    browser.toolbarClaimBlocked = false
    browser.claimChromeKeyboard()
  }

  function onUrlPointerDown(event: PointerEvent): void {
    const active = document.activeElement
    const alreadyEditing =
      browser.focusOwner === 'app' && isUrlBarElement(active) && active === event.currentTarget
    if (alreadyEditing) {
      browser.toolbarClaimBlocked = false
      return
    }
    event.preventDefault()
    void browser.claimUrlBar(true)
  }

  function onToolbarFocusIn(): void {
    if (!shouldHandleToolbarFocusIn(browser.focusOwner, browser.toolbarClaimBlocked)) return
    browser.claimChromeKeyboard()
  }

  function onUrlKeydown(event: KeyboardEvent): void {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement)) return

    if (event.key === 'Enter') {
      event.preventDefault()
      if (!browser.alive) return
      void browser.navigate(browser.inputUrl)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      browser.finishUrlEdit()
      input.blur()
    }
  }

  function openMenu(event: MouseEvent, kind: 'reload' | 'devtools'): void {
    event.preventDefault()
    browser.openChromeMenu(kind, event.clientX, event.clientY)
  }

  function onReloadClick(): void {
    if (!browser.alive) return
    const action = toolbarReloadClick(browser.loading, appConfig.browserReload)
    if (action.cmd === 'stop') {
      void browser.stop()
      return
    }
    void browser.reload(action.ignoreCache)
  }

  function pickMenu(id: string): void {
    const kind = browser.menu?.kind
    browser.closeChromeMenu()
    if (kind === 'reload') {
      void browser.chooseReload(id as BrowserReload)
      return
    }
    if (kind === 'devtools') void browser.chooseDevtools(id as DevtoolsDock)
  }
</script>

<div
  class="toolbar"
  data-browser-toolbar
  role="toolbar"
  aria-label="Navegación"
  tabindex="-1"
  onpointerdown={onToolbarPointerDown}
  onfocusin={onToolbarFocusIn}
>
  <div class="row">
    <button
      type="button"
      class="action"
      aria-label="Atrás"
      title="Atrás"
      disabled={!browser.alive || !browser.canGoBack}
      onclick={() => void browser.back()}
    >
      <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="action"
      aria-label="Adelante"
      title="Adelante"
      disabled={!browser.alive || !browser.canGoForward}
      onclick={() => void browser.forward()}
    >
      <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="action"
      aria-label={browser.loading ? 'Detener' : reloadTitle}
      title={browser.loading ? 'Detener' : reloadTitle}
      data-browser-reload
      disabled={!browser.alive}
      onclick={onReloadClick}
      oncontextmenu={(event) => openMenu(event, 'reload')}
    >
      {#if browser.loading}
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      {:else}
        <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
      {/if}
    </button>
    <input
      class="url"
      type="text"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      aria-label="URL"
      data-browser-url
      bind:value={browser.inputUrl}
      {@attach attachUrl}
      onpointerdown={onUrlPointerDown}
      onfocus={() => {
        browser.editingUrl = true
      }}
      onblur={() => browser.finishUrlEdit()}
      onkeydown={onUrlKeydown}
    />
    <button
      type="button"
      class="action"
      aria-label="DevTools (F12)"
      title="DevTools (F12)"
      data-browser-devtools
      disabled={!browser.alive}
      onclick={() => void browser.devtools()}
      oncontextmenu={(event) => openMenu(event, 'devtools')}
    >
      <Code size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="action"
      aria-label="Cerrar navegador"
      title="Cerrar navegador"
      data-browser-chrome-last
      onclick={() => browser.requestClose()}
    >
      <X size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  </div>
  {#if browser.error}
    <div class="error">
      <span>{browser.error}</span>
      <button type="button" class="retry" onclick={() => void browser.respawn()}>Reintentar</button>
    </div>
  {/if}
</div>

{#if menu && browser.visible}
  <BrowserMenu
    x={menu.x}
    y={menu.y}
    label={menu.kind === 'devtools' ? 'Ubicación de DevTools' : 'Modo de recarga'}
    items={menu.kind === 'devtools' ? DEVTOOLS_ITEMS : RELOAD_ITEMS}
    current={menu.kind === 'devtools' ? appConfig.browserDevtoolsDock : appConfig.browserReload}
    onPick={pickMenu}
    onClose={() => browser.closeChromeMenu()}
  />
{/if}

<style>
  .toolbar {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    height: 2.25rem;
    padding: 0 0.35rem;
  }

  .action {
    display: inline-flex;
    flex-shrink: 0;
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

  .action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    color: var(--text);
  }

  .action:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .url {
    flex: 1;
    min-width: 0;
    height: 1.55rem;
    margin: 0 0.25rem;
    padding: 0 0.45rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .url:focus {
    outline: none;
    border-color: var(--accent);
  }

  .error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0.5rem 0.35rem;
    color: var(--danger);
    font-size: 0.72rem;
  }

  .error span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .retry {
    flex-shrink: 0;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--danger);
    border-radius: 4px;
    background: transparent;
    color: var(--danger);
    font-size: 0.72rem;
    cursor: pointer;
  }

  .retry:hover {
    background: var(--surface-hover);
  }
</style>
