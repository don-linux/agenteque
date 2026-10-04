export interface DivergenceCommit {
  hash: string
  parents: string[]
}

export interface DivergenceComparison {
  name: string
  mergeBase?: string
}

export type DivergenceKind = 'shared' | 'current' | 'other' | 'base'

export interface DivergenceMark {
  kind: DivergenceKind
  bases: string[]
}

export function classifyDivergence(
  commits: readonly DivergenceCommit[],
  head: string | null | undefined,
  comparisons: readonly DivergenceComparison[],
): Map<string, DivergenceMark> {
  const known = new Set(commits.map((commit) => commit.hash))
  const parentsOf = new Map(commits.map((commit) => [commit.hash, commit.parents] as const))

  const walk = (start: string | undefined): Set<string> => {
    const seen = new Set<string>()
    if (!start) return seen
    const stack = [start]
    while (stack.length > 0) {
      const hash = stack.pop()
      if (!hash || seen.has(hash) || !known.has(hash)) continue
      seen.add(hash)
      const parents = parentsOf.get(hash)
      if (parents) stack.push(...parents)
    }
    return seen
  }

  const shared = new Set<string>()
  for (const comparison of comparisons) {
    if (!comparison.mergeBase) continue
    for (const hash of walk(comparison.mergeBase)) shared.add(hash)
  }

  const onCurrent = walk(head ?? undefined)
  const marks = new Map<string, DivergenceMark>()

  for (const commit of commits) {
    const bases = comparisons
      .filter((comparison) => comparison.mergeBase === commit.hash)
      .map((comparison) => comparison.name)

    if (bases.length > 0) {
      marks.set(commit.hash, { kind: 'base', bases })
    } else if (shared.has(commit.hash)) {
      marks.set(commit.hash, { kind: 'shared', bases: [] })
    } else if (onCurrent.has(commit.hash)) {
      marks.set(commit.hash, { kind: 'current', bases: [] })
    } else {
      marks.set(commit.hash, { kind: 'other', bases: [] })
    }
  }

  return marks
}

export function commitLabel(subject: string, short: string): string {
  const text = subject.trim() || 'commit'
  return `${text} (${short})`
}

export function branchPickerLabel(
  current: string | null,
  selected: readonly string[],
  detached: boolean,
): string {
  const extras = selected.length
  const head = current ?? (detached ? 'HEAD' : 'Ramas')
  if (extras === 0) return head
  return `${head} + ${extras}`
}

export function coincidenceHint(bases: readonly string[]): string {
  if (bases.length === 0) return 'Coinciden hasta aquí'
  if (bases.length === 1) return `Coinciden con ${bases[0]} hasta aquí`
  return `Coinciden con ${bases.join(', ')} hasta aquí`
}
