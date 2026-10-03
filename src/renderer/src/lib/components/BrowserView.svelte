<script module lang="ts">
  export const BOOTING_COPY = 'Arrancando el navegador…'

  export function hostPlaceholder(booting: boolean, error: string | null): string {
    return booting ? BOOTING_COPY : (error ?? BOOTING_COPY)
  }
</script>

<script lang="ts">
  import { browser } from '$lib/browser.svelte'
  import BrowserToolbar from '$lib/components/BrowserToolbar.svelte'

  // Sin motor el hueco nativo nunca se abre, así que basta con pedir el
  // arranque una vez y dejar que el cromo pinte su estado apagado.
  $effect(() => {
    if (!browser.pendingSpawn || browser.alive || browser.booting) return
    void browser.spawn()
  })

  let placeholder = $derived(hostPlaceholder(browser.booting, browser.error))
</script>

<div class="view">
  <BrowserToolbar />
  <div class="host">
    {#if !browser.alive}
      <p class="placeholder">{placeholder}</p>
    {/if}
  </div>
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .host {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .placeholder {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    margin: 0;
    color: var(--text-faint);
    font-size: 0.82rem;
  }
</style>
