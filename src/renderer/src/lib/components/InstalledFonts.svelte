<script lang="ts">
  import { onMount } from 'svelte'
  import { FONT_LIST_FAILED_MESSAGE } from '../../../../shared/messages'
  import { FONT_PAGE_SIZE, type SystemFont } from '../../../../shared/fonts'

  let { selected, onPick }: { selected: string | null; onPick: (family: string) => void } = $props()

  let query = $state('')
  let limit = $state(FONT_PAGE_SIZE)
  let shown = $state.raw<SystemFont[]>([])
  let total = $state(0)
  let scanning = $state(true)
  let failed = $state(false)
  let request = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  let moreVisible = $derived(!scanning && !failed && shown.length < total)

  function stop(): void {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  async function pull(): Promise<void> {
    const ticket = ++request
    const currentQuery = query
    const currentLimit = limit
    stop()

    if (typeof window.api?.fontPage !== 'function') {
      if (ticket !== request) return
      scanning = false
      failed = true
      shown = []
      return
    }

    try {
      const result = await window.api.fontPage({
        query: currentQuery,
        offset: 0,
        limit: currentLimit,
      })
      if (ticket !== request || currentQuery !== query) return
      shown = result.families
      total = result.total
      scanning = result.scanning
      failed = !result.scanning && Boolean(result.error)
      if (result.scanning) timer = setTimeout(() => void pull(), 250)
    } catch {
      if (ticket !== request) return
      scanning = false
      failed = true
      shown = []
    }
  }

  function onQuery(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value
    limit = FONT_PAGE_SIZE
    void pull()
  }

  function more(): void {
    limit += FONT_PAGE_SIZE
    void pull()
  }

  function cssFamily(family: string): string {
    return `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  }

  onMount(() => {
    void pull()
    return () => {
      request += 1
      stop()
    }
  })
</script>

<div class="catalog" id="installed-fonts">
  <input
    type="search"
    aria-label="Filtrar fuentes instaladas"
    placeholder="Filtrar"
    value={query}
    oninput={onQuery}
  />

  {#if scanning && shown.length === 0}
    <p class="status">Leyendo las fuentes del sistema…</p>
  {:else if failed}
    <p class="status error">{FONT_LIST_FAILED_MESSAGE}</p>
  {:else if shown.length === 0}
    <p class="status">No hay fuentes que coincidan.</p>
  {:else}
    <ul>
      {#each shown as font (font.family)}
        <li>
          <button
            type="button"
            class={{ current: font.family === selected }}
            aria-current={font.family === selected ? 'true' : undefined}
            style:font-family={cssFamily(font.family)}
            onclick={() => onPick(font.family)}
          >
            {font.family}
          </button>
        </li>
      {/each}
    </ul>
    {#if scanning}
      <p class="status">Leyendo las fuentes del sistema…</p>
    {/if}
  {/if}

  {#if moreVisible}
    <button type="button" class="more" onclick={more}>Mostrar más</button>
  {/if}
</div>

<style>
  .catalog {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-top: 0.45rem;
  }

  input,
  .more,
  ul button {
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
  }

  input,
  .more {
    padding: 0.5rem 0.7rem;
  }

  input:focus,
  .more:focus-visible,
  ul button:focus-visible {
    outline: none;
    border-color: var(--accent);
  }

  ul {
    display: flex;
    flex-direction: column;
    max-height: 16rem;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  li {
    margin: 0;
  }

  ul button {
    width: 100%;
    padding: 0.4rem 0.7rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  ul button:hover,
  ul button.current {
    background: var(--surface-hover);
  }

  ul button.current {
    color: var(--accent);
  }

  .more {
    align-self: flex-start;
    background: var(--surface-hover);
    cursor: pointer;
  }

  .more:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .status {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .status.error {
    color: var(--danger);
  }
</style>
