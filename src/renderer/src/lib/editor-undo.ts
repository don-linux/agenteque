import { undo, undoDepth } from '@codemirror/commands'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from 'codemirror'

export function canUndoFromState(state: EditorState): boolean {
  return undoDepth(state) > 0
}

export function undoEditor(view: EditorView): boolean {
  return undo(view)
}
