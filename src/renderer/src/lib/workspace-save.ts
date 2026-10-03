export interface DraftWrite {
  path: string
  contents: string
}

export function collectDraftWrites(drafts: Iterable<readonly [string, string]>): DraftWrite[] {
  return [...drafts].map(([path, contents]) => ({ path, contents }))
}

export function surfaceSwapAfterSave(saved: boolean): 'enter' | 'abort' {
  return saved ? 'enter' : 'abort'
}
