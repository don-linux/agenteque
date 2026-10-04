<script lang="ts">
  import GitBranchPicker from './GitBranchPicker.svelte'
  import GitGraphRow from './GitGraphRow.svelte'
  import { branchLaneColors, branchPriority, commitLaneColors } from '$lib/git-branch-colors'
  import { classifyDivergence, commitLabel } from '$lib/git-divergence'
  import {
    GIT_CLIENT_MISSING_MESSAGE,
    GIT_NOT_REPOSITORY_MESSAGE,
    gitGraph,
  } from '$lib/git-graph.svelte'
  import { assignLanes, graphWidth } from '$lib/git-lanes'
  import { settingsEditor } from '$lib/settings-editor.svelte'
  import { graphSecondaryCount } from '$lib/ui-theme'
  import { panels } from '$lib/workspace-panels.svelte'
  import { workspace } from '$lib/workspace.svelte'

  let { parked = false }: { parked?: boolean } = $props()

  // El tema activo decide cuántos colores hay. Se lee de la misma fuente que
  // usa applyTheme, así que el reparto de carriles y las variables CSS que los
  // pintan nunca hablan de paletas distintas.
  let secondaries = $derived(graphSecondaryCount(settingsEditor.uiTheme))
  let branchColors = $derived(branchLaneColors(gitGraph.branches, gitGraph.current, secondaries))
  let commitColors = $derived(
    commitLaneColors(
      gitGraph.commits,
      branchColors,
      branchPriority(gitGraph.branches, gitGraph.current, gitGraph.selected),
      gitGraph.oid,
    ),
  )
  let rows = $derived(assignLanes(gitGraph.commits, secondaries, gitGraph.oid, commitColors))
  let marks = $derived(classifyDivergence(gitGraph.commits, gitGraph.oid, gitGraph.comparisons))
  let width = $derived(graphWidth(rows))
  let labels = $derived(
    new Map(
      gitGraph.commits.map((commit) => [commit.hash, commitLabel(commit.subject, commit.short)]),
    ),
  )
  let pickerDisabled = $derived(
    gitGraph.empty || gitGraph.unavailable || gitGraph.initial || gitGraph.branches.length === 0,
  )

  let hint = $derived.by(() => {
    if (gitGraph.unavailable) return GIT_CLIENT_MISSING_MESSAGE
    if (gitGraph.empty) return gitGraph.error ?? GIT_NOT_REPOSITORY_MESSAGE
    if (gitGraph.error) return gitGraph.error
    if (gitGraph.initial) return 'Aún no hay commits.'
    if (gitGraph.loading && gitGraph.commits.length === 0) return 'Cargando…'
    if (gitGraph.commits.length === 0) return 'No hay historial para mostrar.'
    return ''
  })
</script>

<svelte:window
  onfocus={() => {
    if (panels.gitVisible) void gitGraph.refresh()
  }}
/>

<aside class:parked>
  <header>
    <span class="folder" title={workspace.root}>{workspace.folderName}</span>
  </header>

  <div class="toolbar">
    <GitBranchPicker
      branches={gitGraph.branches}
      current={gitGraph.current}
      selected={gitGraph.selected}
      detached={gitGraph.detached}
      colors={branchColors}
      laneCount={secondaries + 1}
      disabled={pickerDisabled}
      onToggle={(name) => gitGraph.toggleBranch(name)}
    />
  </div>

  <div class="body" role="group" aria-label="Grafo de ramas Git">
    {#if hint}
      <p class="empty">{hint}</p>
    {:else}
      <ol class="commits">
        {#each rows as row (row.hash)}
          <GitGraphRow
            label={labels.get(row.hash) ?? row.hash}
            {row}
            {width}
            laneCount={secondaries + 1}
            mark={marks.get(row.hash)}
          />
        {/each}
      </ol>
    {/if}
  </div>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    grid-area: tree;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }

  aside.parked {
    position: fixed;
    top: 0;
    left: -12000px;
    width: var(--tree-width, 16rem);
    height: 80vh;
    overflow: hidden;
    pointer-events: none;
    z-index: -1;
  }

  header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    height: 2rem;
    padding: 0 0.6rem;
  }

  .folder {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .toolbar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.1rem;
    padding: 0 0.35rem 0.35rem;
    border-bottom: 1px solid var(--border);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .commits {
    margin: 0;
    padding: 0.2rem 0 0.6rem;
    list-style: none;
  }

  .empty {
    margin: 0;
    padding: 0.5rem 0.6rem;
    color: var(--text-faint);
    font-size: 0.78rem;
  }
</style>
