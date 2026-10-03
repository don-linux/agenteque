import { describe, expect, it } from 'vitest'
import { tileCells, tileDimensions, tilePlan, tileRows } from '$lib/terminal-tile'

describe('tileDimensions', () => {
  it('is empty when there are no panes', () => {
    expect(tileDimensions(0, 1200, 800)).toEqual({ cols: 0, rows: 0 })
  })

  it('is a single cell for one pane', () => {
    expect(tileDimensions(1, 1200, 800)).toEqual({ cols: 1, rows: 1 })
    expect(tileDimensions(1, 400, 900)).toEqual({ cols: 1, rows: 1 })
  })

  it('grows the long axis first on a wide canvas', () => {
    expect(tileDimensions(2, 1200, 800)).toEqual({ cols: 2, rows: 1 })
    expect(tileDimensions(3, 1200, 800)).toEqual({ cols: 2, rows: 2 })
    expect(tileDimensions(4, 1200, 800)).toEqual({ cols: 2, rows: 2 })
    expect(tileDimensions(5, 1200, 800)).toEqual({ cols: 3, rows: 2 })
    expect(tileDimensions(6, 1200, 800)).toEqual({ cols: 3, rows: 2 })
  })

  it('grows rows first on a tall canvas', () => {
    expect(tileDimensions(2, 400, 900)).toEqual({ cols: 1, rows: 2 })
    expect(tileDimensions(3, 400, 900)).toEqual({ cols: 2, rows: 2 })
    expect(tileDimensions(4, 400, 900)).toEqual({ cols: 2, rows: 2 })
  })
})

describe('tileRows', () => {
  it('stretches the leftover panes into the last row', () => {
    expect(tileRows(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']])
    expect(tileRows(['a', 'b', 'c', 'd', 'e'], 3)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ])
  })

  it('returns no rows when columns are zero', () => {
    expect(tileRows(['a'], 0)).toEqual([])
  })
})

describe('tileCells', () => {
  it('stretches a leftover pane across the last row', () => {
    expect(tileCells(3, 2, 2)).toEqual([
      {
        column: '1 / span 1',
        row: '1',
        width: 'calc(100% / 2)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
      {
        column: '2 / span 1',
        row: '1',
        width: 'calc(100% / 2)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
      {
        column: '1 / span 2',
        row: '2',
        width: 'calc(100% / 1)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
    ])
  })

  it('splits a leftover row evenly when it is not full', () => {
    expect(tileCells(5, 3, 2)).toEqual([
      {
        column: '1 / span 2',
        row: '1',
        width: 'calc(100% / 3)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
      {
        column: '3 / span 2',
        row: '1',
        width: 'calc(100% / 3)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
      {
        column: '5 / span 2',
        row: '1',
        width: 'calc(100% / 3)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
      {
        column: '1 / span 3',
        row: '2',
        width: 'calc(100% / 2)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
      {
        column: '4 / span 3',
        row: '2',
        width: 'calc(100% / 2)',
        height: 'calc(100% / 2)',
        widthPx: 0,
        heightPx: 0,
      },
    ])
  })
})

describe('tilePlan', () => {
  it('pairs dimensions with row groups and grid spans', () => {
    expect(tilePlan(['a', 'b', 'c'], 1200, 800)).toEqual({
      cols: 2,
      rows: 2,
      units: 2,
      rowsOfIds: [['a', 'b'], ['c']],
      cells: [
        {
          column: '1 / span 1',
          row: '1',
          width: 'calc(100% / 2)',
          height: 'calc(100% / 2)',
          widthPx: 600,
          heightPx: 400,
        },
        {
          column: '2 / span 1',
          row: '1',
          width: 'calc(100% / 2)',
          height: 'calc(100% / 2)',
          widthPx: 600,
          heightPx: 400,
        },
        {
          column: '1 / span 2',
          row: '2',
          width: 'calc(100% / 1)',
          height: 'calc(100% / 2)',
          widthPx: 1200,
          heightPx: 400,
        },
      ],
    })
  })

  it('tiles 1..6 on a wide canvas and stretches leftover rows', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const expected = [
      { cols: 1, rows: 1, units: 1 },
      { cols: 2, rows: 1, units: 4 },
      { cols: 2, rows: 2, units: 2 },
      { cols: 2, rows: 2, units: 4 },
      { cols: 3, rows: 2, units: 6 },
      { cols: 3, rows: 2, units: 9 },
    ]

    for (let n = 1; n <= 6; n += 1) {
      const plan = tilePlan(ids.slice(0, n), 1600, 900)
      expect({ cols: plan.cols, rows: plan.rows, units: plan.units }).toEqual(expected[n - 1])
      expect(plan.rowsOfIds.at(-1)?.length).toBe(n - (plan.rows - 1) * plan.cols)
    }
  })

  it('stacks first on a tall canvas and stretches a leftover row', () => {
    const plan = tilePlan(['a', 'b', 'c'], 400, 900)
    expect(plan).toMatchObject({
      cols: 2,
      rows: 2,
      units: 2,
      rowsOfIds: [['a', 'b'], ['c']],
      cells: [
        {
          column: '1 / span 1',
          row: '1',
          width: 'calc(100% / 2)',
          height: 'calc(100% / 2)',
          widthPx: 200,
          heightPx: 450,
        },
        {
          column: '2 / span 1',
          row: '1',
          width: 'calc(100% / 2)',
          height: 'calc(100% / 2)',
          widthPx: 200,
          heightPx: 450,
        },
        {
          column: '1 / span 2',
          row: '2',
          width: 'calc(100% / 1)',
          height: 'calc(100% / 2)',
          widthPx: 400,
          heightPx: 450,
        },
      ],
    })
  })
})
