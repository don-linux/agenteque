import { Transaction, type EditorState, type TransactionSpec } from '@codemirror/state'

function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length))
}

export function externalDocumentSpec(state: EditorState, next: string): TransactionSpec {
  const { anchor, head } = state.selection.main

  return {
    changes: { from: 0, to: state.doc.length, insert: next },
    selection: {
      anchor: clampOffset(anchor, next.length),
      head: clampOffset(head, next.length),
    },
    annotations: Transaction.addToHistory.of(false),
  }
}
