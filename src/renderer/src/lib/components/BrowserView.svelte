<script module lang="ts">
  export const BOOTING_COPY = 'Arrancando el navegador…'

  export function hostPlaceholder(booting: boolean, error: string | null): string {
    return booting ? BOOTING_COPY : (error ?? BOOTING_COPY)
  }
</script>

<script lang="ts">
  import { browser } from '$lib/browser.svelte'
  import BrowserTabs from '$lib/components/BrowserTabs.svelte'
  import BrowserToolbar from '$lib/components/BrowserToolbar.svelte'

  $effect(() => {
    if (!browser.pendingSpawn || browser.alive || browser.booting) return
    void browser.spawn()
  })

  let placeholder = $derived(hostPlaceholder(browser.booting, browser.error))

  function watchHost(node: HTMLElement): () => void {
    let frame = 0
    const publish = (): void => {
      const rect = node.getBoundingClientRect()
      const show = browser.visible && browser.alive && !browser.menuOpen
      browser.reportBounds({
        x: show ? rect.x : 0,
        y: show ? rect.y : 0,
        width: show ? rect.width : 0,
        height: show ? rect.height : 0,
        visible: show,
      })
    }
    const observer = new ResizeObserver(() => publish())
    observer.observe(node)
    const onResize = (): void => publish()
    window.addEventListener('resize', onResize)

    $effect(() => {
      void browser.visible
      void browser.alive
      void browser.menuOpen
      publish()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(publish)
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      browser.reportBounds({ x: 0, y: 0, width: 0, height: 0, visible: false })
    }
  }
</script>

<div class="view">
  <BrowserTabs />
  <BrowserToolbar />
  <div class="host" data-browser-host {@attach watchHost}>
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
