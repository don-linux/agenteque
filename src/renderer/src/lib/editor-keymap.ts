import { Prec, type Extension } from '@codemirror/state'
import { keymap, type Command } from '@codemirror/view'

/**
 * Ctrl+G queda reservado para la aplicación, no para el `findNext` de
 * CodeMirror. Devolver `true` marca el acorde como atendido, así que
 * `searchKeymap` no llega a ejecutarse.
 */
export const swallowFindNext: Command = () => true

export function editorKeymap(): Extension {
  return Prec.highest(
    keymap.of([
      { key: 'Mod-g', run: swallowFindNext },
      { key: 'Ctrl-g', run: swallowFindNext },
    ]),
  )
}
