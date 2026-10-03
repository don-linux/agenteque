import type { EditorState } from '@codemirror/state'
import type { EditorView } from 'codemirror'
import { remapPathPrefix } from '$lib/file-tree'
import { canUndoFromState, undoEditor } from '$lib/editor-undo'

class EditorSession {
  canUndo = $state(false)
  #view: EditorView | null = null
  #states = new Map<string, EditorState>()
  #dropped = new Set<string>()

  attach(view: EditorView): void {
    this.#view = view
    this.sync(view.state)
  }

  detach(): void {
    this.#view = null
    this.canUndo = false
  }

  sync(state: EditorState): void {
    this.canUndo = canUndoFromState(state)
  }

  undo(): void {
    const view = this.#view
    if (!view) return
    undoEditor(view)
    this.sync(view.state)
  }

  saveState(path: string, state: EditorState): void {
    if (this.#dropped.has(path)) return
    this.#states.set(path, state)
  }

  takeState(path: string): EditorState | undefined {
    this.#dropped.delete(path)
    return this.#states.get(path)
  }

  dropState(path: string): void {
    this.#states.delete(path)
    this.#dropped.add(path)
  }

  remapStatesUnder(from: string, to: string): void {
    if (from === to) return

    const paths = new Set([...this.#states.keys(), ...this.#dropped])
    for (const path of paths) {
      const next = remapPathPrefix(path, from, to)
      if (next === path) continue

      const state = this.#states.get(path)
      if (state) {
        this.#states.delete(path)
        this.#states.set(next, state)
      }

      if (this.#dropped.delete(path)) this.#dropped.add(next)
    }
  }

  clearStates(): void {
    this.#states.clear()
    this.#dropped.clear()
    this.canUndo = false
  }
}

export const editorSession = new EditorSession()
