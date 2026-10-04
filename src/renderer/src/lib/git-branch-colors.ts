/** La rama actual se pinta con el acento del tema. */
export const CURRENT_BRANCH_LANE = 0

export interface ColorBranch {
  name: string
  current?: boolean
}

export interface ColorCommit {
  hash: string
  parents: string[]
  refs?: string[]
}

/**
 * Color de cada rama del repositorio. La actual se queda con el acento; el
 * resto rota por los secundarios en el orden en que Git las lista, así dos
 * ramas vecinas nunca comparten color y la repetición recién aparece a
 * `secondaries` ramas de distancia.
 *
 * El conteo llega como argumento porque lo decide el tema activo, y esta
 * función no sabe de temas: reparte ordinales. El color tampoco depende de la
 * selección: marcar o desmarcar una rama no repinta las demás.
 */
export function branchLaneColors(
  branches: readonly ColorBranch[],
  current: string | null | undefined,
  secondaries: number,
): Map<string, number> {
  const colors = new Map<string, number>()
  const lanes = Math.max(1, Math.trunc(secondaries))
  let taken = 0

  for (const branch of branches) {
    if (colors.has(branch.name)) continue

    if (current && branch.name === current) {
      colors.set(branch.name, CURRENT_BRANCH_LANE)
      continue
    }

    colors.set(branch.name, 1 + (taken % lanes))
    taken += 1
  }

  return colors
}

/**
 * Orden en que las ramas reclaman commits: primero la actual, después las
 * comparadas y al final el resto. Decide quién se queda con la historia
 * compartida, no el color de cada rama.
 */
export function branchPriority(
  branches: readonly ColorBranch[],
  current: string | null | undefined,
  selected: readonly string[],
): string[] {
  const names = branches.map((branch) => branch.name)
  const order: string[] = []

  const push = (name: string | null | undefined): void => {
    if (!name || order.includes(name) || !names.includes(name)) return
    order.push(name)
  }

  push(current)
  for (const name of names) {
    if (selected.includes(name)) push(name)
  }
  for (const name of names) push(name)

  return order
}

/**
 * Color de cada commit del grafo. Se recorre la cadena de primer padre desde
 * cada punta, en orden de prioridad, y el primero que llega se queda con el
 * commit: por eso el tronco de la rama actual entero queda en acento.
 *
 * Los commits que no cuelgan de ninguna punta listada (por ejemplo la historia
 * lateral de una rama borrada ya fusionada) quedan fuera y los pinta
 * `assignLanes` con su rotación de reserva.
 */
export function commitLaneColors(
  commits: readonly ColorCommit[],
  branchColors: ReadonlyMap<string, number>,
  order: readonly string[],
  head?: string | null,
): Map<string, number> {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit] as const))
  const tips = new Map<string, string>()

  for (const commit of commits) {
    for (const name of commit.refs ?? []) {
      if (!branchColors.has(name) || tips.has(name)) continue
      tips.set(name, commit.hash)
    }
  }

  const colors = new Map<string, number>()

  const paint = (start: string | undefined, color: number): void => {
    let hash = start
    while (hash) {
      const commit = byHash.get(hash)
      if (!commit || colors.has(hash)) return
      colors.set(hash, color)
      hash = commit.parents[0]
    }
  }

  // HEAD primero: con HEAD separado no hay rama que reclame su tronco.
  paint(head ?? undefined, CURRENT_BRANCH_LANE)

  for (const name of order) {
    const color = branchColors.get(name)
    if (color === undefined) continue
    paint(tips.get(name), color)
  }

  return colors
}
