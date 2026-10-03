<script lang="ts">
  import TerminalPane from '$lib/components/TerminalPane.svelte'
  import { terminal } from '$lib/terminal.svelte'
  import { tilePlan } from '$lib/terminal-tile'

  let { cwd }: { cwd: string } = $props()

  let hostWidth = $state(0)
  let hostHeight = $state(0)

  let tiles = $derived(terminal.surface === 'terminals')
  let plan = $derived(
    tilePlan(
      terminal.sessions.map((session) => session.id),
      hostWidth,
      hostHeight,
    ),
  )
</script>

<div
  class={['host', { tiles, peek: !tiles }]}
  bind:clientWidth={hostWidth}
  bind:clientHeight={hostHeight}
>
  {#if tiles && terminal.sessions.length === 0}
    <p class="empty">Añade una terminal.</p>
  {:else}
    {#each terminal.sessions as session, index (session.id)}
      {@const cell = plan.cells[index]}
      <div
        class={['cell', { hidden: !tiles && session.id !== terminal.activeId }]}
        style:width={tiles && cell ? `${cell.widthPx}px` : undefined}
        style:height={tiles && cell ? `${cell.heightPx}px` : undefined}
      >
        <TerminalPane
          sessionId={session.id}
          {cwd}
          visible={terminal.isVisible(session.id)}
          boxWidth={tiles ? (cell?.widthPx ?? 0) : 0}
          boxHeight={tiles ? (cell?.heightPx ?? 0) : 0}
        />
      </div>
    {/each}
  {/if}
</div>

<style>
  .host {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .host.peek {
    display: flex;
  }

  .host.tiles {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    width: auto;
    height: auto;
    background: var(--border);
  }

  .empty {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    margin: 0;
    color: var(--text-faint);
    font-size: 0.82rem;
  }

  .cell {
    position: relative;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .host.peek .cell {
    flex: 1;
    width: 100%;
    height: 100%;
  }

  .host.tiles .cell {
    flex: 0 0 auto;
    box-sizing: border-box;
    outline: 1px solid var(--border);
    outline-offset: -1px;
  }

  .host.peek .cell.hidden {
    position: fixed;
    top: 0;
    left: -12000px;
    flex: none;
    width: var(--park-width);
    height: var(--park-height);
    overflow: hidden;
    pointer-events: none;
    z-index: -1;
  }
</style>
