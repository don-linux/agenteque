import { history } from '@codemirror/commands'
import { EditorState, Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { canUndoFromState } from '$lib/editor-undo'

function createEditor(doc = '') {
  return EditorState.create({
    doc,
    extensions: [history({ newGroupDelay: 0 })],
  })
}

describe('canUndoFromState', () => {
  it('is false on a fresh document', () => {
    expect(canUndoFromState(createEditor('# hi'))).toBe(false)
  })

  it('is true after a user edit', () => {
    const state = createEditor('# hi').update({
      changes: { from: 4, insert: ' there' },
      annotations: Transaction.time.of(10_000),
    }).state

    expect(canUndoFromState(state)).toBe(true)
  })
})
