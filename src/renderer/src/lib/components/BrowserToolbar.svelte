<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import Code from '@lucide/svelte/icons/code'
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import X from '@lucide/svelte/icons/x'
  import { displayUrl } from '$lib/browser-url'
  import {
    browser,
    shouldApplyFocusUrlRequest,
    shouldHandleToolbarFocusIn,
  } from '$lib/browser.svelte'
  import { shortcutLabel } from '$lib/platform'
  import { surface } from '$lib/workspace-surface.svelte'

  const closeLabel = `Cerrar navegador (${shortcutLabel('Ctrl+B')})`

  let lastFocusUrlRequest = 0

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

  // Un blur por clic en la página no debe parecer un clic en la barra:
  // `pointerdown` es el gesto que sí puede reclamar el teclado.
  function onToolbarPointerDown(): void {
    browser.toolbarClaimBlocked = false
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
      browser.inputUrl = displayUrl(browser.url)
      input.blur()
    }
  }
</script>

<div class="toolbar" data-browser-toolbar onfocusin={onToolbarFocusIn}>
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
    {#if browser.loading}
      <button
        type="button"
        class="action"
        aria-label="Detener"
        title="Detener"
        disabled={!browser.alive}
        onclick={() => void browser.stop()}
      >
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {:else}
      <button
        type="button"
        class="action"
        aria-label="Recargar"
        title="Recargar"
        disabled={!browser.alive}
        onclick={() => void browser.reload()}
      >
        <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {/if}
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
      onpointerdown={onToolbarPointerDown}
      onkeydown={onUrlKeydown}
    />
    <button
      type="button"
      class="action"
      aria-label="DevTools (F12)"
      title="DevTools (F12)"
      disabled={!browser.alive}
      onclick={() => void browser.devtools()}
    >
      <Code size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="action"
      aria-label={closeLabel}
      title={closeLabel}
      data-browser-chrome-last
      onclick={() => browser.leave()}
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
