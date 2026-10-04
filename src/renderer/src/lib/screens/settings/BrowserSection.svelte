<script lang="ts">
  import { onMount } from 'svelte'
  import {
    acceptVersions,
    COPY,
    runtimeLines,
    VERSIONS_UNAVAILABLE,
    type AppVersions,
  } from '$lib/navegador-page'

  let versions = $state.raw<AppVersions | null>(null)
  let error = $state<string | null>(null)
  let lines = $derived(versions ? runtimeLines(versions) : null)

  onMount(() => {
    let cancelled = false

    void Promise.resolve(window.api.getVersions()).then(
      (loaded) => {
        if (cancelled) return
        const accepted = acceptVersions(loaded)
        versions = accepted
        error = accepted ? null : VERSIONS_UNAVAILABLE
      },
      () => {
        if (cancelled) return
        versions = null
        error = VERSIONS_UNAVAILABLE
      },
    )

    return () => {
      cancelled = true
    }
  })
</script>

<section class="section" aria-labelledby="browser-heading">
  <h2 id="browser-heading">{COPY.heading}</h2>
  <p class="lead">{COPY.lead}</p>

  {#if error}
    <p class="error">{error}</p>
  {:else if lines}
    <ul class="rows" aria-label="Versiones del runtime">
      <li>{lines.chromium}</li>
      <li>{lines.electron}</li>
      <li>{lines.node}</li>
      <li>{lines.app}</li>
    </ul>
  {:else}
    <p class="hint">{COPY.loading}</p>
  {/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
    max-width: 36rem;
    padding: 2rem 2rem 3rem;
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .lead,
  .hint,
  .error {
    margin: 0;
    font-size: 0.85rem;
  }

  .lead,
  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--danger);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.45;
  }
</style>
