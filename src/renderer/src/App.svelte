<script lang="ts">
  import { onMount } from 'svelte'
  import Counter from '$lib/Counter.svelte'
  import type { AppVersions } from '../../shared/ipc'

  let versions = $state<AppVersions | null>(null)

  onMount(() => {
    window.api.notifyRendererReady()
    void Promise.resolve(window.api.getVersions()).then(
      (loaded) => {
        versions = loaded
      },
      () => {
        versions = null
      },
    )
  })
</script>

<main>
  <h1>agenteque</h1>
  <p class="tagline">Electron + Svelte 5 + Vite 8</p>

  <div class="card">
    <Counter />
  </div>

  <section class="versions" aria-label="Runtime versions">
    <h2>Versions (via IPC)</h2>
    {#if versions}
      <ul>
        <li>app <code>{versions.app}</code></li>
        <li>Electron <code>{versions.electron}</code></li>
        <li>Chromium <code>{versions.chrome}</code></li>
        <li>Node <code>{versions.node}</code></li>
      </ul>
    {:else}
      <p>Loading…</p>
    {/if}
  </section>

  <p class="hint">Edit <code>src/renderer/src/App.svelte</code> and save to test HMR.</p>
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 3rem 1.5rem;
    text-align: center;
  }

  h1 {
    font-size: 3rem;
    margin: 0;
  }

  .tagline {
    color: var(--muted);
    margin-top: 0.25rem;
  }

  .card {
    padding: 2rem 0;
  }

  .versions ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }

  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
