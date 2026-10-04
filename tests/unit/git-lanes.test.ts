import { describe, expect, it } from 'vitest'
import {
  assignLanes,
  graphWidth,
  GRAPH_PAD,
  LANE_HEIGHT,
  LANE_WIDTH,
  laneCenter,
  NODE_RADIUS,
  rowEdges,
} from '$lib/git-lanes'

// GitGraphRow dibuja el anillo del merge con este radio.
const RING_RADIUS = NODE_RADIUS + 2

/** Cuántos secundarios trae el tema en estas pruebas. Lo decide el tema real. */
const SECONDARIES = 7

describe('assignLanes', () => {
  it('keeps a linear history on a single column', () => {
    const rows = assignLanes(
      [
        { hash: 'c', parents: ['b'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    expect(rows.map((row) => row.column)).toEqual([0, 0, 0])
    expect(rows.every((row) => !row.merge)).toBe(true)
    expect(rows[0]?.output).toEqual([{ column: 0, id: 'b', color: rows[0].color }])
  })

  it('opens a new lane when a branch forks, then collapses at the shared parent', () => {
    const rows = assignLanes(
      [
        { hash: 'd', parents: ['c'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    expect(rows[0]?.column).toBe(0)
    expect(rows[1]?.column).toBe(1)
    expect(rows[2]?.column).toBe(0)
    expect(rows[3]?.column).toBe(0)
    expect(rows[3]?.input.map((slot) => slot.id).toSorted()).toEqual(['a', 'a'])
    expect(rows[3]?.output).toEqual([])
  })

  it('marks a merge and draws a second parent lane', () => {
    const rows = assignLanes(
      [
        { hash: 'm', parents: ['c', 'd'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'd', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    expect(rows[0]?.merge).toBe(true)
    expect(rows[0]?.column).toBe(0)
    expect(rows[0]?.output.map((slot) => slot.id)).toEqual(['c', 'd'])
    expect(rows[1]?.merge).toBe(false)

    expect(rows[0]?.output.map((slot) => slot.column)).toEqual([0, 1])

    // First parent stays in column 0 (vertical). Second parent opens
    // column 1 (curve that ends on that lane). A curve that merely
    // *mentions* lane 1's x — e.g. a first-parent line bent the wrong way —
    // is not enough.
    const nodeX = laneCenter(0)
    const otherX = laneCenter(1)
    const midY = LANE_HEIGHT / 2
    const bendY = (midY + LANE_HEIGHT) / 2
    expect(rowEdges(rows[0]).map((edge) => edge.d)).toEqual([
      `M ${nodeX} ${midY} L ${nodeX} ${LANE_HEIGHT}`,
      `M ${nodeX} ${midY} C ${nodeX} ${bendY}, ${otherX} ${bendY}, ${otherX} ${LANE_HEIGHT}`,
    ])
  })

  it('reserves color 0 for the current HEAD commit', () => {
    const rows = assignLanes(
      [
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
      'b',
    )

    expect(rows[0]?.color).toBe(0)
    expect(rows[0]?.head).toBe(true)
    expect(rows[1]?.color).toBe(0)
    expect(rows[1]?.head).toBe(false)
  })

  it('still paints HEAD when another tip is listed first', () => {
    const rows = assignLanes(
      [
        { hash: 'd', parents: ['c'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
      'b',
    )

    const head = rows.find((row) => row.hash === 'b')
    const otherTip = rows.find((row) => row.hash === 'd')
    expect(head?.head).toBe(true)
    expect(head?.color).toBe(0)
    expect(otherTip?.head).toBe(false)
    expect(otherTip?.color).not.toBe(0)
    expect(rows.filter((row) => row.head)).toHaveLength(1)
  })

  it('does not use the HEAD color when no HEAD hash is given', () => {
    const rows = assignLanes(
      [
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    expect(rows.every((row) => row.color !== 0)).toBe(true)
    expect(rows.every((row) => !row.head)).toBe(true)
  })

  it('pinta el commit con el color de la rama que lo reclama', () => {
    const rows = assignLanes(
      [
        { hash: 'c', parents: ['b'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
      'c',
      new Map([
        ['c', 0],
        ['b', 4],
      ]),
    )

    // El carril cambia de color en la punta de la otra rama y de ahí hereda.
    expect(rows.map((row) => row.color)).toEqual([0, 4, 4])
  })

  it('no reusa un color que ya está en pantalla para un carril nuevo', () => {
    const rows = assignLanes(
      [
        { hash: 't1', parents: ['p1'] },
        { hash: 't2', parents: ['p2'] },
        { hash: 'p1', parents: [] },
        { hash: 'p2', parents: [] },
      ],
      SECONDARIES,
      null,
      new Map([['t1', 1]]),
    )

    expect(rows[0]?.color).toBe(1)
    expect(rows[1]?.color).not.toBe(1)
  })

  it('abre el carril del segundo padre con el color de su rama', () => {
    const rows = assignLanes(
      [
        { hash: 'm', parents: ['c', 'd'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'd', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
      'm',
      new Map([
        ['m', 0],
        ['c', 0],
        ['d', 5],
        ['a', 0],
      ]),
    )

    expect(rows[0]?.output).toEqual([
      { column: 0, id: 'c', color: 0 },
      { column: 1, id: 'd', color: 5 },
    ])
    expect(rows.find((row) => row.hash === 'd')?.color).toBe(5)
  })

  it('mantiene la reserva dentro de los carriles secundarios', () => {
    const rows = assignLanes(
      Array.from({ length: 12 }, (_, index) => ({ hash: `r${index}`, parents: [] })),
      SECONDARIES,
    )

    for (const row of rows) {
      expect(row.color).toBeGreaterThanOrEqual(1)
      expect(row.color).toBeLessThanOrEqual(SECONDARIES)
    }
  })

  it('no inventa carriles que el tema no puede pintar', () => {
    // Con una paleta de cuatro, la reserva nunca pide un quinto color.
    const rows = assignLanes(
      Array.from({ length: 12 }, (_, index) => ({ hash: `r${index}`, parents: [] })),
      4,
    )

    for (const row of rows) {
      expect(row.color).toBeGreaterThanOrEqual(1)
      expect(row.color).toBeLessThanOrEqual(4)
    }
  })

  it('opens a third lane for a second fork', () => {
    const rows = assignLanes(
      [
        { hash: 'e', parents: ['d'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'd', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    expect(rows.map((row) => row.column)).toEqual([0, 1, 2, 0, 0])
    expect(graphWidth(rows)).toBe(3 * LANE_WIDTH + 2 * GRAPH_PAD)
  })
})

describe('graphWidth', () => {
  it('grows with the number of active lanes', () => {
    const linear = assignLanes(
      [
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )
    const forked = assignLanes(
      [
        { hash: 'd', parents: ['c'] },
        { hash: 'b', parents: ['a'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    expect(graphWidth(linear)).toBe(LANE_WIDTH + 2 * GRAPH_PAD)
    expect(graphWidth(forked)).toBeGreaterThan(graphWidth(linear))
  })

  it('leaves room for the merge ring on both edges of the gutter', () => {
    const merge = assignLanes(
      [
        { hash: 'm', parents: ['c', 'd'] },
        { hash: 'c', parents: ['a'] },
        { hash: 'd', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )
    const linear = assignLanes(
      [
        { hash: 'b', parents: ['a'] },
        { hash: 'a', parents: [] },
      ],
      SECONDARIES,
    )

    for (const rows of [merge, linear]) {
      const last = Math.max(...rows.map((row) => row.column))
      expect(laneCenter(0) - RING_RADIUS).toBeGreaterThan(0)
      expect(laneCenter(last) + RING_RADIUS).toBeLessThan(graphWidth(rows))
    }
  })
})
