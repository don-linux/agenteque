import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_ROOT, demoWorkspace } from '$lib/backend/demo-workspace'
import type { TreeNode } from '$lib/backend/types'

function paths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => [node.path, ...paths(node.children)])
}

beforeEach(() => demoWorkspace.reset())

describe('demo workspace tree', () => {
  it('lists the top-level folders of the demo root', async () => {
    await expect(demoWorkspace.listWorkspaceDirs(DEMO_ROOT)).resolves.toEqual({
      root: DEMO_ROOT,
      dirs: ['docs', 'notas'],
    })
  })

  it('refuses any other root', async () => {
    await expect(demoWorkspace.listWorkspaceDirs('/otra')).rejects.toThrow('No existe la carpeta')
  })

  it('puts folders before files and sorts each group by name', async () => {
    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, null)

    expect(tree.map((node) => node.path)).toEqual(['docs', 'notas', 'README.md'])
    expect(tree[0]?.children.map((node) => node.path)).toEqual([
      'docs/guia',
      'docs/arquitectura.md',
    ])
  })

  it('honours a folder filter but never hides the root files', async () => {
    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, ['notas'])

    expect(tree.map((node) => node.path)).toEqual(['notas', 'README.md'])
  })
})

describe('demo workspace writes', () => {
  it('reads back what it writes', async () => {
    await demoWorkspace.writeMarkdown(DEMO_ROOT, 'README.md', '# otra cosa')

    await expect(demoWorkspace.readMarkdown(DEMO_ROOT, 'README.md')).resolves.toBe('# otra cosa')
  })

  it('refuses to write a file that is not there', async () => {
    await expect(demoWorkspace.writeMarkdown(DEMO_ROOT, 'nope.md', 'x')).rejects.toThrow(
      'No existe',
    )
  })

  it('creates entries and the folders above them', async () => {
    await demoWorkspace.createEntry(DEMO_ROOT, 'docs/api/v1/rutas.md', 'file')
    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, null)

    expect(paths(tree)).toContain('docs/api')
    expect(paths(tree)).toContain('docs/api/v1/rutas.md')
  })

  it('refuses a name that only differs in case from a sibling', async () => {
    await expect(demoWorkspace.createEntry(DEMO_ROOT, 'readme.md', 'file')).rejects.toThrow(
      'ya existe',
    )
    await expect(demoWorkspace.createEntry(DEMO_ROOT, 'NOTAS', 'dir')).rejects.toThrow('ya existe')
  })

  it('refuses a nested path whose folder only differs in case', async () => {
    await expect(demoWorkspace.createEntry(DEMO_ROOT, 'NOTAS/nueva.md', 'file')).rejects.toThrow(
      'ya existe',
    )

    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, null)

    expect(paths(tree)).toContain('notas')
    expect(paths(tree)).toContain('notas/ideas.md')
    expect(paths(tree)).not.toContain('NOTAS')
    expect(paths(tree)).not.toContain('NOTAS/nueva.md')
  })

  it('refuses to turn a file into an ancestor', async () => {
    const before = await demoWorkspace.readMarkdown(DEMO_ROOT, 'README.md')

    await expect(
      demoWorkspace.createEntry(DEMO_ROOT, 'README.md/extra.md', 'file'),
    ).rejects.toThrow('ya existe')

    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, null)

    expect(paths(tree)).toContain('README.md')
    expect(paths(tree)).not.toContain('README.md/extra.md')
    await expect(demoWorkspace.readMarkdown(DEMO_ROOT, 'README.md')).resolves.toBe(before)
  })

  it('moves a folder with everything inside it', async () => {
    await demoWorkspace.moveEntry(DEMO_ROOT, 'notas', 'docs/notas', 'dir')
    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, null)

    expect(paths(tree)).toContain('docs/notas/ideas.md')
    expect(paths(tree)).not.toContain('notas/ideas.md')
  })

  it('refuses to move a folder inside itself', async () => {
    await expect(
      demoWorkspace.moveEntry(DEMO_ROOT, 'docs', 'docs/guia/docs', 'dir'),
    ).rejects.toThrow('dentro de sí misma')
  })

  it('renames a file and keeps its contents', async () => {
    const before = await demoWorkspace.readMarkdown(DEMO_ROOT, 'notas/ideas.md')
    await demoWorkspace.renameEntry(DEMO_ROOT, 'notas/ideas.md', 'notas/pendientes.md', 'file')

    await expect(demoWorkspace.readMarkdown(DEMO_ROOT, 'notas/pendientes.md')).resolves.toBe(before)
  })

  it('deletes a folder with its whole subtree', async () => {
    await demoWorkspace.deleteEntry(DEMO_ROOT, 'docs', 'dir')
    const tree = await demoWorkspace.listContextTree(DEMO_ROOT, null)

    expect(paths(tree)).toEqual(['notas', 'notas/ideas.md', 'notas/reunion.md', 'README.md'])
  })

  it('reports a delete of something that is gone', async () => {
    await expect(demoWorkspace.deleteEntry(DEMO_ROOT, 'nope.md', 'file')).rejects.toThrow(
      'No existe',
    )
  })
})
