<script lang="ts">
  import { coincidenceHint, type DivergenceMark } from '$lib/git-divergence'
  import { LANE_HEIGHT, NODE_RADIUS, laneCenter, rowEdges, type LaneRow } from '$lib/git-lanes'
  import { graphLaneVar } from '$lib/ui-theme'

  let {
    label,
    row,
    width,
    laneCount,
    mark,
  }: {
    label: string
    row: LaneRow
    width: number
    /** Carriles del tema activo: el acento más sus secundarios. */
    laneCount: number
    mark: DivergenceMark | undefined
  } = $props()

  let edges = $derived(rowEdges(row))
  let cx = $derived(laneCenter(row.column))
  let cy = $derived(LANE_HEIGHT / 2)
  let lane = $derived(graphLaneVar(row.color, laneCount))
  let kind = $derived(mark?.kind ?? 'current')
  let hint = $derived(kind === 'base' ? coincidenceHint(mark?.bases ?? []) : '')
</script>

<li class="row" class:shared={kind === 'shared' || kind === 'base'} class:other={kind === 'other'}>
  <svg
    class="gutter"
    {width}
    height={LANE_HEIGHT}
    viewBox={`0 0 ${width} ${LANE_HEIGHT}`}
    aria-hidden="true"
  >
    {#each edges as edge, index (index)}
      <path class="lane" style:--lane={graphLaneVar(edge.color, laneCount)} d={edge.d} />
    {/each}
    {#if row.merge}
      <circle class="ring" style:--lane={lane} {cx} {cy} r={NODE_RADIUS + 2} />
    {/if}
    <circle class="node" class:head={row.head} style:--lane={lane} {cx} {cy} r={NODE_RADIUS} />
  </svg>
  <div class="meta">
    <span class="label">{label}</span>
    {#if hint}
      <span class="hint">{hint}</span>
    {/if}
  </div>
</li>

<style>
  .row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.35rem;
    padding-right: 0.5rem;
    color: var(--text);
  }

  .row.other {
    color: var(--text-muted);
  }

  .row.shared .label {
    font-weight: 600;
  }

  .gutter {
    flex-shrink: 0;
    display: block;
  }

  /* El color del carril llega por --lane, que apunta a la paleta del tema. */
  .lane {
    fill: none;
    stroke: var(--lane);
    stroke-width: 1.6;
  }

  .node,
  .ring {
    fill: var(--lane);
    stroke: var(--lane);
    stroke-width: 1.5;
  }

  .ring {
    fill: none;
  }

  .node.head {
    fill: var(--surface);
  }

  .meta {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    padding: 0.1rem 0;
  }

  .label {
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    color: var(--accent);
    font-size: 0.62rem;
    line-height: 1.2;
  }
</style>
