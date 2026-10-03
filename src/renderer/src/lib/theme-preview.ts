import { graphLaneVar, graphSecondaryCount } from '$lib/ui-theme'

/** Carril del acento, el que el grafo reserva para la rama actual. */
export const CURRENT_BRANCH_LANE = 0

export const THEME_PREVIEW_MARKDOWN = `# Guía rápida

Texto de ejemplo para ver el contraste del editor.

- Lista con **negrita** y *cursiva*
- Un [enlace](https://agenteque.dev)

\`const hola = "agenteque"\`

<!-- comentario del editor -->
`

export const THEME_PREVIEW_FILES = [
  { name: 'guia.md', selected: true },
  { name: 'ideas.md', selected: false },
] as const

export const THEME_PREVIEW_ROOT = 'notas'
export const THEME_PREVIEW_DIR = 'diario'
export const THEME_PREVIEW_STATUS = 'guardado'

export interface PreviewLane {
  /** La variable CSS del carril, para que la tira siga al tema ya aplicado. */
  lane: string
  label: string
  current: boolean
}

/**
 * Los carriles del grafo del tema: el acento para la rama actual y después sus
 * secundarios, tantos como traiga.
 *
 * La tira existe porque el grafo de verdad solo muestra tantos colores como
 * ramas tenga el repositorio abierto. Con una sola rama no habría forma de
 * comparar la paleta de un tema contra otra al momento de elegir.
 */
export function previewLanes(id: string | null | undefined): PreviewLane[] {
  const secondaries = graphSecondaryCount(id)
  const lanes = secondaries + 1

  return [
    { lane: graphLaneVar(CURRENT_BRANCH_LANE, lanes), label: 'actual', current: true },
    ...Array.from({ length: secondaries }, (_, index) => ({
      lane: graphLaneVar(index + 1, lanes),
      label: `rama-${index + 1}`,
      current: false,
    })),
  ]
}
