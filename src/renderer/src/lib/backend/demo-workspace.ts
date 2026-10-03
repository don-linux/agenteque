import type { NodeKind, TreeNode, WorkspaceBackend, WorkspaceDirs } from '$lib/backend/types'

export const DEMO_ROOT = '/demo/agenteque'

interface DemoFile {
  path: string
  contents: string
}

const DEMO_FILES: readonly DemoFile[] = [
  {
    path: 'README.md',
    contents: [
      '# agenteque',
      '',
      'Este workspace es una demo en memoria: el árbol, las pestañas y el editor',
      'funcionan de verdad, pero nada toca el disco.',
      '',
      '- Crea, renombra, mueve y borra entradas desde el árbol.',
      '- `Ctrl+S` guarda el borrador en memoria.',
      '- `Ctrl+J` abre la terminal, `Ctrl+B` el navegador.',
      '',
      '> La etapa 2 sustituye este backend por uno sobre IPC sin tocar la interfaz.',
      '',
    ].join('\n'),
  },
  {
    path: 'notas/ideas.md',
    contents: [
      '# Ideas',
      '',
      '1. Guardar la sesión de terminales entre arranques.',
      '2. Buscar dentro del contexto abierto.',
      '3. Exportar el árbol visible a Markdown.',
      '',
      'Un bloque de código para ver el resaltado:',
      '',
      '```ts',
      "const saludo: string = 'hola'",
      'console.log(saludo.toUpperCase())',
      '```',
      '',
    ].join('\n'),
  },
  {
    path: 'notas/reunion.md',
    contents: [
      '# Reunión semanal',
      '',
      '## Acuerdos',
      '',
      '- [x] Portar la interfaz al shell de Electron',
      '- [ ] Conectar el backend real',
      '',
      'Enlace de referencia: [electron-vite](https://electron-vite.org)',
      '',
    ].join('\n'),
  },
  {
    path: 'docs/arquitectura.md',
    contents: [
      '# Arquitectura',
      '',
      'Los componentes nunca llaman al backend: hablan con los singletons de',
      'estado, y esos con los puertos de `lib/backend`.',
      '',
      '| Capa      | Responsable                     |',
      '| --------- | ------------------------------- |',
      '| Pantallas | Composición y atajos            |',
      '| Estado    | Reglas y orden de las llamadas  |',
      '| Puertos   | Hablar con el proceso principal |',
      '',
    ].join('\n'),
  },
  {
    path: 'docs/guia/primeros-pasos.md',
    contents: [
      '# Primeros pasos',
      '',
      'Abre `README.md`, escribe algo y fíjate en el punto de la pestaña: marca',
      'que hay cambios sin guardar.',
      '',
    ].join('\n'),
  },
]

function sameName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

function isUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`)
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '' : path.slice(0, index)
}

function baseNameOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? path : path.slice(index + 1)
}

function byName(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

/**
 * Árbol y markdown en RAM. Las operaciones de CRUD se aplican de verdad, que es
 * lo que ejercita el álgebra de rutas del árbol de archivos.
 */
class DemoWorkspace implements WorkspaceBackend {
  #files = new Map<string, string>()
  #dirs = new Set<string>()

  constructor() {
    this.reset()
  }

  reset(): void {
    this.#files = new Map(DEMO_FILES.map((file) => [file.path, file.contents]))
    this.#dirs = new Set(['docs', 'docs/guia', 'notas'])
  }

  async listWorkspaceDirs(root: string): Promise<WorkspaceDirs> {
    this.#requireRoot(root)
    const dirs = Array.from(this.#dirs)
      .filter((path) => parentOf(path) === '')
      .toSorted(byName)
    return { root: DEMO_ROOT, dirs }
  }

  async listContextTree(root: string, includeDirs: string[] | null): Promise<TreeNode[]> {
    this.#requireRoot(root)

    const allowed = includeDirs === null ? null : new Set(includeDirs)
    const visible = (path: string): boolean => {
      if (allowed === null) return true
      const top = path.split('/')[0] ?? ''
      // Los ficheros sueltos de la raíz nunca se filtran: el filtro es de carpetas.
      if (top === path && !this.#dirs.has(path)) return true
      return allowed.has(top)
    }

    const paths = [...this.#dirs, ...this.#files.keys()].filter(visible)
    return buildTree(paths, this.#dirs)
  }

  async readMarkdown(root: string, path: string): Promise<string> {
    this.#requireRoot(root)
    const contents = this.#files.get(path)
    if (contents === undefined) throw new Error(`No existe \`${path}\``)
    return contents
  }

  async writeMarkdown(root: string, path: string, contents: string): Promise<void> {
    this.#requireRoot(root)
    if (!this.#files.has(path)) throw new Error(`No existe \`${path}\``)
    this.#files.set(path, contents)
  }

  async createEntry(root: string, path: string, kind: NodeKind): Promise<void> {
    this.#requireRoot(root)
    this.#requireFree(path)
    this.#ensureParents(parentOf(path))

    if (kind === 'dir') this.#dirs.add(path)
    else this.#files.set(path, '')
  }

  async renameEntry(root: string, from: string, to: string, kind: NodeKind): Promise<void> {
    await this.moveEntry(root, from, to, kind)
  }

  async moveEntry(root: string, from: string, to: string, kind: NodeKind): Promise<void> {
    this.#requireRoot(root)
    if (from === to) return
    if (kind === 'dir' && isUnder(to, from)) {
      throw new Error('No se puede mover una carpeta dentro de sí misma')
    }
    this.#requireFree(to, from)
    this.#ensureParents(parentOf(to))

    if (kind === 'file') {
      const contents = this.#files.get(from)
      if (contents === undefined) throw new Error(`No existe \`${from}\``)
      this.#files.delete(from)
      this.#files.set(to, contents)
      return
    }

    if (!this.#dirs.has(from)) throw new Error(`No existe \`${from}\``)

    for (const dir of Array.from(this.#dirs)) {
      if (!isUnder(dir, from)) continue
      this.#dirs.delete(dir)
      this.#dirs.add(`${to}${dir.slice(from.length)}`)
    }

    for (const [path, contents] of Array.from(this.#files)) {
      if (!isUnder(path, from)) continue
      this.#files.delete(path)
      this.#files.set(`${to}${path.slice(from.length)}`, contents)
    }
  }

  async deleteEntry(root: string, path: string, kind: NodeKind): Promise<void> {
    this.#requireRoot(root)

    if (kind === 'file') {
      if (!this.#files.delete(path)) throw new Error(`No existe \`${path}\``)
      return
    }

    if (!this.#dirs.has(path)) throw new Error(`No existe \`${path}\``)
    for (const dir of Array.from(this.#dirs)) if (isUnder(dir, path)) this.#dirs.delete(dir)
    for (const file of Array.from(this.#files.keys()))
      if (isUnder(file, path)) this.#files.delete(file)
  }

  #requireRoot(root: string): void {
    if (root !== DEMO_ROOT) throw new Error(`No existe la carpeta \`${root}\``)
  }

  #ensureParents(parent: string): void {
    if (parent === '') return
    const segments = parent.split('/')
    let current = ''
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`
      this.#dirs.add(current)
    }
  }

  /** Insensible a mayúsculas: es el lado seguro en Windows y macOS. */
  #requireFree(path: string, except?: string): void {
    const parent = parentOf(path)
    const name = baseNameOf(path)

    for (const candidate of [...this.#dirs, ...this.#files.keys()]) {
      if (candidate === except) continue
      if (parentOf(candidate) !== parent) continue
      if (sameName(baseNameOf(candidate), name)) throw new Error(`\`${name}\` ya existe`)
    }
  }
}

function buildTree(paths: readonly string[], dirs: ReadonlySet<string>): TreeNode[] {
  const roots: TreeNode[] = []
  const byPath = new Map<string, TreeNode>()

  const ensureDir = (path: string): TreeNode => {
    const existing = byPath.get(path)
    if (existing) return existing

    const node: TreeNode = { name: baseNameOf(path), path, kind: 'dir', children: [] }
    byPath.set(path, node)

    const parent = parentOf(path)
    if (parent === '') roots.push(node)
    else ensureDir(parent).children.push(node)

    return node
  }

  for (const path of paths.toSorted(byName)) {
    if (dirs.has(path)) {
      ensureDir(path)
      continue
    }

    const node: TreeNode = { name: baseNameOf(path), path, kind: 'file', children: [] }
    const parent = parentOf(path)
    if (parent === '') roots.push(node)
    else ensureDir(parent).children.push(node)
  }

  sortNodes(roots)
  return roots
}

/** Carpetas primero y dentro de cada grupo por nombre, como el árbol original. */
function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
    return byName(left.name, right.name)
  })
  for (const node of nodes) sortNodes(node.children)
}

export const demoWorkspace = new DemoWorkspace()
