import { findNext, findPrevious, gotoLine, openSearchPanel } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { keymap, type KeyBinding } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { describe, expect, it } from 'vitest'
import { editorKeymap, swallowFindNext } from '$lib/editor-keymap'

function bindingsFor(key: string, extensions: Extension[]): KeyBinding[] {
  const state = EditorState.create({ doc: 'hola', extensions })
  return state
    .facet(keymap)
    .flat()
    .filter((binding) => binding.key === key)
}

describe('swallowFindNext', () => {
  it('consumes the chord so CodeMirror treats it as handled', () => {
    expect(swallowFindNext({} as never)).toBe(true)
    expect(swallowFindNext).not.toBe(findNext)
  })
})

describe('editorKeymap', () => {
  it("binds Ctrl-g (and CodeMirror's Mod-g name) ahead of findNext from basicSetup", () => {
    const onlySearch = bindingsFor('Mod-g', [basicSetup])
    expect(onlySearch.some((binding) => binding.run === findNext)).toBe(true)
    expect(onlySearch[0]?.run).toBe(findNext)

    const withOurs = bindingsFor('Mod-g', [basicSetup, editorKeymap()])
    expect(withOurs[0]?.run).toBe(swallowFindNext)
    expect(withOurs.some((binding) => binding.run === findNext)).toBe(true)
    expect(withOurs.findIndex((binding) => binding.run === swallowFindNext)).toBeLessThan(
      withOurs.findIndex((binding) => binding.run === findNext),
    )

    const ctrl = bindingsFor('Ctrl-g', [basicSetup, editorKeymap()])
    expect(ctrl[0]?.run).toBe(swallowFindNext)
  })

  it('does not steal find previous, find, or go-to-line', () => {
    const state = EditorState.create({
      doc: 'hola',
      extensions: [basicSetup, editorKeymap()],
    })
    const bindings = state.facet(keymap).flat()
    const keys = bindings.map((binding) => binding.key)

    expect(keys).toContain('Mod-g')
    expect(keys).toContain('Mod-Alt-g')
    expect(keys).toContain('Mod-f')

    // Presence of the search chords is not enough: a highest-precedence
    // swallow on Mod-f / Mod-Alt-g / Shift-Mod-g would still leave those
    // keys in the facet while stealing the commands.
    const swallowed = bindings.filter(
      (binding) => binding.run === swallowFindNext || binding.shift === swallowFindNext,
    )
    expect(swallowed.every((binding) => binding.key === 'Mod-g' || binding.key === 'Ctrl-g')).toBe(
      true,
    )
    expect(swallowed.every((binding) => binding.shift !== swallowFindNext)).toBe(true)

    expect(
      bindings.some((binding) => binding.key === 'Mod-g' && binding.shift === findPrevious),
    ).toBe(true)
    expect(
      bindings.some((binding) => binding.key === 'Mod-Alt-g' && binding.run === gotoLine),
    ).toBe(true)
    expect(
      bindings.some((binding) => binding.key === 'Mod-f' && binding.run === openSearchPanel),
    ).toBe(true)

    expect(bindingsFor('Mod-f', [basicSetup, editorKeymap()])[0]?.run).not.toBe(swallowFindNext)
    expect(bindingsFor('Mod-Alt-g', [basicSetup, editorKeymap()])[0]?.run).not.toBe(swallowFindNext)
    expect(
      bindingsFor('Shift-Mod-g', [basicSetup, editorKeymap()]).every(
        (binding) => binding.run !== swallowFindNext,
      ),
    ).toBe(true)
  })
})
