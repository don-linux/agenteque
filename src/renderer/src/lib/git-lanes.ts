import { CURRENT_BRANCH_LANE } from '$lib/git-branch-colors'

export const LANE_WIDTH = 11
export const LANE_HEIGHT = 22
export const NODE_RADIUS = 4
// Aire a los lados del carril: el anillo de merge es más ancho que el
// nodo y sin este margen se sale del SVG.
export const GRAPH_PAD = 6

export interface LaneCommit {
  hash: string
  parents: string[]
}

export interface LaneSlot {
  column: number
  id: string
  color: number
}

export interface LaneRow {
  hash: string
  column: number
  color: number
  merge: boolean
  head: boolean
  input: LaneSlot[]
  output: LaneSlot[]
}

export interface LaneEdge {
  d: string
  color: number
}

interface OpenLane {
  id: string
  color: number
}

/**
 * El color de un carril sale, en este orden, de la rama que reclama el commit
 * (`colors`), del carril que entra, o de una rotación de reserva que esquiva
 * los colores que ya están en pantalla.
 *
 * `secondaries` es cuántos colores tiene la paleta del tema activo. Llega como
 * argumento y no importado: así esta función reparte ordinales sin saber de
 * temas, y la reserva nunca inventa un carril que el tema no puede pintar.
 */
export function assignLanes(
  commits: readonly LaneCommit[],
  secondaries: number,
  headHash?: string | null,
  colors?: ReadonlyMap<string, number>,
): LaneRow[] {
  const rows: LaneRow[] = []
  const total = Math.max(1, Math.trunc(secondaries))
  let lanes: Array<OpenLane | null> = []
  let nextColor = 1

  const rotate = (): number => {
    const color = nextColor
    nextColor = nextColor === total ? 1 : nextColor + 1
    return color
  }

  const takeColor = (used: ReadonlySet<number>): number => {
    for (let step = 0; step < total; step += 1) {
      const color = rotate()
      if (!used.has(color)) return color
    }
    return rotate()
  }

  for (const commit of commits) {
    const input = lanes.map((lane, column) =>
      lane ? { column, id: lane.id, color: lane.color } : null,
    )

    let column = input.findIndex((lane) => lane?.id === commit.hash)
    const incoming = column >= 0 ? input[column]?.color : undefined

    if (column < 0) {
      column = lanes.findIndex((lane) => lane === null)
      if (column < 0) column = lanes.length
    }

    const used = new Set<number>()
    for (const lane of input) {
      if (lane) used.add(lane.color)
    }

    const isHead = Boolean(headHash && commit.hash === headHash)
    const owned = colors?.get(commit.hash)
    const color = isHead ? CURRENT_BRANCH_LANE : (owned ?? incoming ?? takeColor(used))
    used.add(color)

    const next: Array<OpenLane | null> = lanes.map((lane) =>
      lane && lane.id === commit.hash ? null : lane,
    )
    while (next.length <= column) next.push(null)

    const first = commit.parents[0]
    next[column] = first ? { id: first, color } : null

    for (const parent of commit.parents.slice(1)) {
      if (next.some((lane) => lane?.id === parent)) continue
      let slot = next.findIndex((lane) => lane === null)
      if (slot < 0) {
        slot = next.length
        next.push(null)
      }
      const branch = colors?.get(parent) ?? takeColor(used)
      used.add(branch)
      next[slot] = { id: parent, color: branch }
    }

    while (next.length > 0 && next[next.length - 1] === null) next.pop()

    rows.push({
      hash: commit.hash,
      column,
      color,
      merge: commit.parents.length > 1,
      head: isHead,
      input: slotsOf(input),
      output: slotsOf(next.map((lane, index) => (lane ? { column: index, ...lane } : null))),
    })

    lanes = next
  }

  return rows
}

export function graphWidth(rows: readonly LaneRow[]): number {
  let columns = 1
  for (const row of rows) {
    columns = Math.max(columns, row.column + 1, row.input.length, row.output.length)
    for (const slot of row.input) columns = Math.max(columns, slot.column + 1)
    for (const slot of row.output) columns = Math.max(columns, slot.column + 1)
  }
  return columns * LANE_WIDTH + GRAPH_PAD * 2
}

export function rowEdges(row: LaneRow): LaneEdge[] {
  const edges: LaneEdge[] = []
  const nodeX = laneCenter(row.column)
  const mid = LANE_HEIGHT / 2

  for (const slot of row.input) {
    const startX = laneCenter(slot.column)
    if (slot.id === row.hash) {
      edges.push({
        d: slot.column === row.column ? vertical(startX, 0, mid) : curve(startX, 0, nodeX, mid),
        color: slot.color,
      })
    } else {
      edges.push({ d: vertical(startX, 0, LANE_HEIGHT), color: slot.color })
    }
  }

  for (const slot of row.output) {
    const passthrough = row.input.some(
      (incoming) => incoming.column === slot.column && incoming.id === slot.id,
    )
    if (passthrough) continue

    const endX = laneCenter(slot.column)
    edges.push({
      d:
        slot.column === row.column
          ? vertical(nodeX, mid, LANE_HEIGHT)
          : curve(nodeX, mid, endX, LANE_HEIGHT),
      color: slot.color,
    })
  }

  return edges
}

export function laneCenter(column: number): number {
  return GRAPH_PAD + column * LANE_WIDTH + LANE_WIDTH / 2
}

function slotsOf(lanes: Array<LaneSlot | null>): LaneSlot[] {
  return lanes.filter((lane): lane is LaneSlot => lane !== null)
}

function vertical(x: number, y1: number, y2: number): string {
  return `M ${x} ${y1} L ${x} ${y2}`
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
}
