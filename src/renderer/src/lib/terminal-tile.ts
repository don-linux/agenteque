export interface TileDimensions {
  cols: number
  rows: number
}

export interface TileCell {
  column: string
  row: string
  width: string
  height: string
  widthPx: number
  heightPx: number
}

export interface TilePlan<T> {
  cols: number
  rows: number
  units: number
  rowsOfIds: T[][]
  cells: TileCell[]
}

export function tileDimensions(n: number, width: number, height: number): TileDimensions {
  if (n <= 0) return { cols: 0, rows: 0 }
  if (n === 1) return { cols: 1, rows: 1 }

  const wide = width >= height
  let rows = 1
  let cols = 1

  while (rows * cols < n) {
    if (wide) {
      cols += 1
      if (rows * cols < n) rows += 1
    } else {
      rows += 1
      if (rows * cols < n) cols += 1
    }
  }

  return { cols, rows }
}

export function tileRows<T>(ids: readonly T[], cols: number): T[][] {
  if (cols <= 0) return []

  const rows: T[][] = []
  for (let index = 0; index < ids.length; index += cols) {
    rows.push(ids.slice(index, index + cols))
  }
  return rows
}

export function tileCells(
  n: number,
  cols: number,
  rows: number,
  width = 0,
  height = 0,
): TileCell[] {
  if (n <= 0 || cols <= 0 || rows <= 0) return []

  const lastCount = n - (rows - 1) * cols
  const units = cols * Math.max(lastCount, 1)
  const fullSpan = units / cols
  const lastSpan = units / Math.max(lastCount, 1)

  return Array.from({ length: n }, (_, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const leftover = row === rows - 1 && lastCount < cols
    const span = leftover ? lastSpan : fullSpan
    const start = col * span + 1
    const count = leftover ? lastCount : cols
    return {
      column: `${start} / span ${span}`,
      row: `${row + 1}`,
      width: `calc(100% / ${count})`,
      height: `calc(100% / ${rows})`,
      widthPx: width / count,
      heightPx: height / rows,
    }
  })
}

export function tileUnits(n: number, cols: number, rows: number): number {
  if (n <= 0 || cols <= 0) return 0
  const lastCount = n - (rows - 1) * cols
  return cols * Math.max(lastCount, 1)
}

export function tilePlan<T>(ids: readonly T[], width: number, height: number): TilePlan<T> {
  const { cols, rows } = tileDimensions(ids.length, width, height)
  return {
    cols,
    rows,
    units: tileUnits(ids.length, cols, rows),
    rowsOfIds: tileRows(ids, cols),
    cells: tileCells(ids.length, cols, rows, width, height),
  }
}
