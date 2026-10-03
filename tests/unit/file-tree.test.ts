import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  baseNameOf,
  canMoveEntry,
  createPathConflict,
  draftParentFor,
  draftParentForCommand,
  dropParentFor,
  flattenTree,
  folderNameOf,
  hasMarkdownExtension,
  isSameRowDoubleClick,
  joinTreePath,
  normalizeNewName,
  normalizeRenameName,
  parentDirOf,
  pathIsUnder,
  planMove,
  remapPathPrefix,
  revealPath,
  selectedTreePath,
  siblingExists,
  siblingExistsExcept,
  toggleExpanded,
  DOUBLE_CLICK_MS,
  type TreeRow,
} from '$lib/file-tree'
import type { TreeNode } from '$lib/workspace.svelte'

function dir(name: string, path: string, children: TreeNode[] = []): TreeNode {
  return { name, path, kind: 'dir', children }
}

function file(name: string, path: string): TreeNode {
  return { name, path, kind: 'file', children: [] }
}

/** docs/ (guia.md, sub/ (nota.md)), src/, README.md */
function tree(): TreeNode[] {
  return [
    dir('docs', 'docs', [
      dir('sub', 'docs/sub', [file('nota.md', 'docs/sub/nota.md')]),
      file('guia.md', 'docs/guia.md'),
    ]),
    dir('src', 'src'),
    file('README.md', 'README.md'),
  ]
}

function shape(rows: TreeRow[]): string[] {
  return rows.map((row) => `${row.depth}:${row.kind}:${row.name || row.draftKind}`)
}

describe('flattenTree', () => {
  it('shows root entries and keeps collapsed folders closed', () => {
    const rows = flattenTree(tree(), { expanded: new Set() })

    expect(shape(rows)).toEqual(['0:dir:docs', '0:dir:src', '0:file:README.md'])
    expect(rows.every((row) => !row.expanded)).toBe(true)
  })

  it('expands only the folders in the set', () => {
    const rows = flattenTree(tree(), { expanded: new Set(['docs']) })

    expect(shape(rows)).toEqual([
      '0:dir:docs',
      '1:dir:sub',
      '1:file:guia.md',
      '0:dir:src',
      '0:file:README.md',
    ])
    expect(rows[0].expanded).toBe(true)
    expect(rows[1].expanded).toBe(false)
  })

  it('nests deeper folders one level at a time', () => {
    const rows = flattenTree(tree(), { expanded: new Set(['docs', 'docs/sub']) })

    expect(shape(rows)).toEqual([
      '0:dir:docs',
      '1:dir:sub',
      '2:file:nota.md',
      '1:file:guia.md',
      '0:dir:src',
      '0:file:README.md',
    ])
  })

  it('does not expand a child whose parent is collapsed', () => {
    const rows = flattenTree(tree(), { expanded: new Set(['docs/sub']) })

    expect(shape(rows)).toEqual(['0:dir:docs', '0:dir:src', '0:file:README.md'])
  })

  it('puts a root draft first', () => {
    const rows = flattenTree(tree(), {
      expanded: new Set(),
      draft: { kind: 'file', parent: '' },
    })

    expect(shape(rows)[0]).toBe('0:draft:file')
    expect(rows[0].path).toBe('')
    expect(rows).toHaveLength(4)
  })

  it('puts a draft inside its expanded parent', () => {
    const rows = flattenTree(tree(), {
      expanded: new Set(['docs']),
      draft: { kind: 'dir', parent: 'docs' },
    })

    expect(shape(rows)).toEqual([
      '0:dir:docs',
      '1:draft:dir',
      '1:dir:sub',
      '1:file:guia.md',
      '0:dir:src',
      '0:file:README.md',
    ])
  })

  it('still shows a draft whose parent is collapsed', () => {
    const rows = flattenTree(tree(), {
      expanded: new Set(),
      draft: { kind: 'file', parent: 'docs' },
    })

    expect(shape(rows)).toEqual(['0:dir:docs', '1:draft:file', '0:dir:src', '0:file:README.md'])
  })

  it('falls back to the root when the draft parent is gone', () => {
    const rows = flattenTree(tree(), {
      expanded: new Set(),
      draft: { kind: 'file', parent: 'borrada' },
    })

    // The whole shape, so the fallback cannot reorder or drop the real entries.
    expect(shape(rows)).toEqual(['0:dir:docs', '0:dir:src', '0:file:README.md', '0:draft:file'])
    expect(rows.filter((row) => row.kind === 'draft')).toHaveLength(1)
  })

  it('still shows a draft whose parent hides under a collapsed folder', () => {
    const rows = flattenTree(tree(), {
      expanded: new Set(),
      draft: { kind: 'file', parent: 'docs/sub' },
    })

    expect(shape(rows)).toEqual(['0:dir:docs', '0:dir:src', '0:file:README.md', '0:draft:file'])
  })

  it('emits a single draft row even for a deeply nested parent', () => {
    const rows = flattenTree(tree(), {
      expanded: new Set(['docs', 'docs/sub']),
      draft: { kind: 'file', parent: 'docs/sub' },
    })

    expect(rows.filter((row) => row.kind === 'draft')).toHaveLength(1)
    expect(shape(rows)[2]).toBe('2:draft:file')
  })

  it('handles an empty tree with and without a draft', () => {
    expect(flattenTree([], { expanded: new Set() })).toEqual([])
    expect(
      shape(flattenTree([], { expanded: new Set(), draft: { kind: 'dir', parent: '' } })),
    ).toEqual(['0:draft:dir'])
  })

  it('shows folders that hold no markdown at all', () => {
    const rows = flattenTree([dir('assets', 'assets')], { expanded: new Set(['assets']) })

    expect(shape(rows)).toEqual(['0:dir:assets'])
    expect(rows[0].expanded).toBe(true)
  })
})

describe('toggleExpanded', () => {
  it('adds a collapsed path and removes an expanded one', () => {
    const first = toggleExpanded(new Set(), 'docs')
    expect([...first]).toEqual(['docs'])

    const second = toggleExpanded(first, 'docs')
    expect([...second]).toEqual([])
  })

  it('does not mutate the input', () => {
    const original = new Set(['docs'])
    toggleExpanded(original, 'src')
    expect([...original]).toEqual(['docs'])
  })
})

describe('ancestorsOf / revealPath', () => {
  it('lists ancestors outermost first, excluding the entry itself', () => {
    expect(ancestorsOf('a/b/c.md')).toEqual(['a', 'a/b'])
    expect(ancestorsOf('README.md')).toEqual([])
    expect(ancestorsOf('')).toEqual([])
  })

  it('ignores empty segments instead of inventing a folder', () => {
    expect(ancestorsOf('a//b/c.md')).toEqual(['a', 'a/b'])
    expect(ancestorsOf('/a/b.md')).toEqual(['a'])
  })

  it('expands every ancestor and keeps what was open', () => {
    const next = revealPath(new Set(['otra']), 'a/b/c.md')
    expect([...next].toSorted()).toEqual(['a', 'a/b', 'otra'])
  })

  it('is a no-op for a root entry', () => {
    const next = revealPath(new Set(), 'README.md')
    expect([...next]).toEqual([])
  })
})

describe('parentDirOf / baseNameOf / joinTreePath', () => {
  it('splits a relative tree path', () => {
    expect(parentDirOf('a/b/c.md')).toBe('a/b')
    expect(parentDirOf('README.md')).toBe('')
    expect(baseNameOf('a/b/c.md')).toBe('c.md')
    expect(baseNameOf('README.md')).toBe('README.md')
  })

  it('joins without a leading slash at the root', () => {
    expect(joinTreePath('', 'nota.md')).toBe('nota.md')
    expect(joinTreePath('docs', 'nota.md')).toBe('docs/nota.md')
  })

  it('round trips', () => {
    const path = joinTreePath(parentDirOf('a/b/c.md'), baseNameOf('a/b/c.md'))
    expect(path).toBe('a/b/c.md')
  })
})

const isDirectory = (path: string): boolean => path === 'docs' || path === 'docs/sub'

describe('draftParentFor', () => {
  it('uses the root when nothing is selected', () => {
    expect(draftParentFor(null, isDirectory)).toBe('')
  })

  it('creates inside the selected folder', () => {
    expect(draftParentFor('docs', isDirectory)).toBe('docs')
    expect(draftParentFor('docs/sub', isDirectory)).toBe('docs/sub')
  })

  it('creates next to the selected file', () => {
    expect(draftParentFor('docs/guia.md', isDirectory)).toBe('docs')
    expect(draftParentFor('README.md', isDirectory)).toBe('')
  })

  it('does not treat a longer name that starts the same as a folder', () => {
    expect(draftParentFor('docs-viejos', isDirectory)).toBe('')
    expect(draftParentFor('docs-viejos/guia.md', isDirectory)).toBe('docs-viejos')
  })
})

describe('selectedTreePath', () => {
  it('uses the tree focus and never the open editor file', () => {
    expect(selectedTreePath('docs')).toBe('docs')
    expect(selectedTreePath('docs/guia.md')).toBe('docs/guia.md')
  })

  it('is null when the root is focused', () => {
    expect(selectedTreePath(null)).toBeNull()
  })
})

describe('draftParentForCommand', () => {
  it('creates inside a focused folder', () => {
    expect(draftParentForCommand('toolbar', 'docs', isDirectory)).toBe('docs')
    expect(draftParentForCommand('toolbar', 'docs/sub', isDirectory)).toBe('docs/sub')
  })

  it('creates next to a focused file', () => {
    expect(draftParentForCommand('toolbar', 'docs/guia.md', isDirectory)).toBe('docs')
    expect(draftParentForCommand('toolbar', 'README.md', isDirectory)).toBe('')
  })

  it('creates at the root when the tree focus is the root', () => {
    expect(draftParentForCommand('toolbar', null, isDirectory)).toBe('')
  })

  it('creates at the root from the blank menu even with a folder focused', () => {
    expect(draftParentForCommand('blank', 'docs', isDirectory)).toBe('')
    expect(draftParentForCommand('blank', 'docs/sub', isDirectory)).toBe('')
    expect(draftParentForCommand('blank', null, isDirectory)).toBe('')
  })

  it('does not treat docs-viejos as docs just because the name starts the same', () => {
    expect(draftParentForCommand('toolbar', 'docs-viejos', isDirectory)).toBe('')
  })
})

describe('normalizeNewName', () => {
  it('adds .md to files only', () => {
    expect(normalizeNewName('nota', 'file')).toEqual({ ok: true, name: 'nota.md' })
    expect(normalizeNewName('nota.md', 'file')).toEqual({ ok: true, name: 'nota.md' })
    expect(normalizeNewName('nota.MD', 'file')).toEqual({ ok: true, name: 'nota.MD' })
    expect(normalizeNewName('notas', 'dir')).toEqual({ ok: true, name: 'notas' })
  })

  it('keeps other extensions and appends .md', () => {
    expect(normalizeNewName('script.ts', 'file')).toEqual({ ok: true, name: 'script.ts.md' })
    expect(normalizeNewName('nota.md.txt', 'file')).toEqual({ ok: true, name: 'nota.md.txt.md' })
  })

  it('trims spaces and surrounding slashes', () => {
    expect(normalizeNewName('  nota  ', 'file')).toEqual({ ok: true, name: 'nota.md' })
    expect(normalizeNewName('/notas/', 'dir')).toEqual({ ok: true, name: 'notas' })
  })

  it('allows a nested name', () => {
    expect(normalizeNewName('2026/enero', 'dir')).toEqual({ ok: true, name: '2026/enero' })
    expect(normalizeNewName('sub/nota', 'file')).toEqual({ ok: true, name: 'sub/nota.md' })
  })

  it('rejects empty names', () => {
    expect(normalizeNewName('', 'file').ok).toBe(false)
    expect(normalizeNewName('   ', 'dir').ok).toBe(false)
    expect(normalizeNewName('///', 'dir').ok).toBe(false)
    expect(normalizeNewName('.md', 'file').ok).toBe(false)
  })

  it('rejects traversal and empty segments', () => {
    expect(normalizeNewName('..', 'dir').ok).toBe(false)
    expect(normalizeNewName('../fuera', 'file').ok).toBe(false)
    expect(normalizeNewName('docs/../fuera', 'file').ok).toBe(false)
    expect(normalizeNewName('.', 'dir').ok).toBe(false)
    expect(normalizeNewName('a/./b', 'dir').ok).toBe(false)
    expect(normalizeNewName('a//b', 'dir').ok).toBe(false)
    expect(normalizeNewName('a/ /b', 'dir').ok).toBe(false)
  })

  it('treats a backslash as a filename character, not a separator', () => {
    expect(normalizeNewName('a\\b', 'dir')).toEqual({ ok: true, name: 'a\\b' })
    expect(normalizeNewName('foo\\bar', 'file')).toEqual({ ok: true, name: 'foo\\bar.md' })
  })

  it('keeps dotfiles, which the tree does show', () => {
    expect(normalizeNewName('.cursor', 'dir')).toEqual({ ok: true, name: '.cursor' })
    expect(normalizeNewName('.agents/persona', 'file')).toEqual({
      ok: true,
      name: '.agents/persona.md',
    })
  })
})

describe('folderNameOf', () => {
  it('keeps only the last segment', () => {
    expect(folderNameOf('/home/fernando/carpeta/subcarpeta')).toBe('subcarpeta')
    expect(folderNameOf('/home/fernando')).toBe('fernando')
    expect(folderNameOf('proyecto')).toBe('proyecto')
  })

  it('ignores trailing separators', () => {
    expect(folderNameOf('/home/fernando/carpeta/')).toBe('carpeta')
    expect(folderNameOf('/home/fernando/carpeta///')).toBe('carpeta')
  })

  it('does not treat a backslash as a path separator', () => {
    expect(folderNameOf('C:\\Users\\fernando\\notas')).toBe('C:\\Users\\fernando\\notas')
  })

  it('falls back to the path itself at a filesystem root', () => {
    expect(folderNameOf('/')).toBe('/')
  })
})

describe('hasMarkdownExtension', () => {
  it('ignores case', () => {
    expect(hasMarkdownExtension('a.md')).toBe(true)
    expect(hasMarkdownExtension('a.MD')).toBe(true)
    expect(hasMarkdownExtension('a.markdown')).toBe(false)
    expect(hasMarkdownExtension('md')).toBe(false)
  })

  it('looks at the end of the name, not anywhere in it', () => {
    expect(hasMarkdownExtension('a.md.txt')).toBe(false)
    expect(hasMarkdownExtension('.md.old')).toBe(false)
  })
})

describe('siblingExists', () => {
  it('finds collisions at the root and inside folders', () => {
    expect(siblingExists(tree(), '', 'README.md')).toBe(true)
    expect(siblingExists(tree(), '', 'docs')).toBe(true)
    expect(siblingExists(tree(), '', 'otro.md')).toBe(false)
    expect(siblingExists(tree(), 'docs', 'guia.md')).toBe(true)
    expect(siblingExists(tree(), 'docs/sub', 'nota.md')).toBe(true)
    expect(siblingExists(tree(), 'docs/sub', 'otra.md')).toBe(false)
  })

  // En Windows y macOS `Notas.md` y `notas.md` son el mismo fichero, así que la
  // comprobación es insensible a mayúsculas en todas las plataformas.
  it('treats names that differ only in case as taken', () => {
    expect(siblingExists(tree(), '', 'readme.md')).toBe(true)
    expect(siblingExists(tree(), 'docs', 'GUIA.MD')).toBe(true)
    expect(siblingExists(tree(), '', 'README.md')).toBe(true)
    expect(siblingExists(tree(), '', 'LEEME.md')).toBe(false)
  })

  it('lets a rename keep its own name whatever the casing', () => {
    expect(siblingExistsExcept(tree(), '', 'ReadMe.md', 'README.md')).toBe(false)
    expect(siblingExistsExcept(tree(), '', 'ReadMe.md', 'docs')).toBe(true)
  })

  it('reports no collision for an unknown parent', () => {
    expect(siblingExists(tree(), 'nueva', 'nota.md')).toBe(false)
    expect(siblingExists(tree(), 'src', 'nota.md')).toBe(false)
  })

  it('does not answer for a parent with the children of another folder', () => {
    // Names that do exist, but somewhere else: a fallback to the root entries
    // would block a perfectly free name.
    expect(siblingExists(tree(), 'nueva', 'README.md')).toBe(false)
    expect(siblingExists(tree(), 'nueva', 'docs')).toBe(false)
    expect(siblingExists(tree(), 'src', 'README.md')).toBe(false)
    expect(siblingExists(tree(), 'docs/sub', 'guia.md')).toBe(false)
  })

  it('does not confuse a folder with a longer name that starts the same', () => {
    const nodes = [
      dir('docs', 'docs', [file('guia.md', 'docs/guia.md')]),
      dir('docs-viejos', 'docs-viejos', [file('antiguo.md', 'docs-viejos/antiguo.md')]),
    ]

    expect(siblingExists(nodes, 'docs-viejos', 'antiguo.md')).toBe(true)
    expect(siblingExists(nodes, 'docs-viejos', 'guia.md')).toBe(false)
    expect(siblingExists(nodes, 'docs', 'antiguo.md')).toBe(false)
  })
})

describe('createPathConflict', () => {
  it('rejects a nested path whose folder only differs in case', () => {
    const nodes = [dir('notas', 'notas', [file('ideas.md', 'notas/ideas.md')])]

    expect(createPathConflict(nodes, 'NOTAS/nueva.md')).toBe('`NOTAS` ya existe')
    expect(createPathConflict(tree(), 'docs/SUB/extra.md')).toBe('`SUB` ya existe')
    expect(createPathConflict(nodes, 'notas/nueva.md')).toBeNull()
  })

  it('rejects turning a file into an ancestor', () => {
    expect(createPathConflict(tree(), 'README.md/extra.md')).toBe('`README.md` ya existe')
    expect(createPathConflict(tree(), 'docs/guia.md/extra.md')).toBe('`guia.md` ya existe')
    expect(createPathConflict(tree(), 'docs/api/v1/rutas.md')).toBeNull()
  })
})

describe('siblingExistsExcept', () => {
  it('lets a rename keep its own name', () => {
    expect(siblingExistsExcept(tree(), '', 'README.md', 'README.md')).toBe(false)
    expect(siblingExistsExcept(tree(), 'docs', 'guia.md', 'docs/guia.md')).toBe(false)
  })

  it('still reports a different sibling', () => {
    expect(siblingExistsExcept(tree(), '', 'docs', 'README.md')).toBe(true)
    expect(siblingExistsExcept(tree(), 'docs', 'guia.md', 'docs/otra.md')).toBe(true)
  })
})

describe('normalizeRenameName', () => {
  it('adds .md to files and leaves folders alone', () => {
    expect(normalizeRenameName('nota', 'file')).toEqual({ ok: true, name: 'nota.md' })
    expect(normalizeRenameName('nota.md', 'file')).toEqual({ ok: true, name: 'nota.md' })
    expect(normalizeRenameName('notas', 'dir')).toEqual({ ok: true, name: 'notas' })
  })

  it('refuses slashes so a rename cannot become a move', () => {
    expect(normalizeRenameName('sub/nota', 'file').ok).toBe(false)
    expect(normalizeRenameName('2026/enero', 'dir').ok).toBe(false)
    expect(normalizeRenameName('a\\b', 'dir')).toEqual({ ok: true, name: 'a\\b' })
  })

  it('rejects empty names and traversal', () => {
    expect(normalizeRenameName('   ', 'file').ok).toBe(false)
    expect(normalizeRenameName('.', 'dir').ok).toBe(false)
    expect(normalizeRenameName('..', 'file').ok).toBe(false)
    expect(normalizeRenameName('.md', 'file').ok).toBe(false)
  })
})

describe('remapPathPrefix', () => {
  it('rewrites the folder and every path under it', () => {
    expect(remapPathPrefix('docs', 'docs', 'notas')).toBe('notas')
    expect(remapPathPrefix('docs/guia.md', 'docs', 'notas')).toBe('notas/guia.md')
    expect(remapPathPrefix('docs/sub/nota.md', 'docs', 'notas')).toBe('notas/sub/nota.md')
  })

  it('does not rewrite a sibling that only starts the same', () => {
    expect(remapPathPrefix('docs-viejos/guia.md', 'docs', 'notas')).toBe('docs-viejos/guia.md')
    expect(remapPathPrefix('README.md', 'docs', 'notas')).toBe('README.md')
  })

  it('rewrites open tabs and focus when a folder is moved, not a prefix sibling', () => {
    const tabs = ['docs/guia.md', 'docs-viejos/x.md', 'README.md']
    const remapped = tabs.map((path) => remapPathPrefix(path, 'docs', 'src/docs'))

    expect(remapped).toEqual(['src/docs/guia.md', 'docs-viejos/x.md', 'README.md'])
    expect(remapPathPrefix('docs', 'docs', 'src/docs')).toBe('src/docs')
    expect(remapPathPrefix('docs/sub', 'docs', 'src/docs')).toBe('src/docs/sub')
  })
})

describe('pathIsUnder', () => {
  it('includes the folder itself and its children', () => {
    expect(pathIsUnder('docs', 'docs')).toBe(true)
    expect(pathIsUnder('docs/guia.md', 'docs')).toBe(true)
    expect(pathIsUnder('docs-viejos', 'docs')).toBe(false)
  })
})

describe('dropParentFor', () => {
  it('drops into a folder, next to a file, or at the root', () => {
    expect(dropParentFor({ kind: 'dir', path: 'docs' })).toBe('docs')
    expect(dropParentFor({ kind: 'dir', path: 'docs/sub' })).toBe('docs/sub')
    expect(dropParentFor({ kind: 'file', path: 'docs/guia.md' })).toBe('docs')
    expect(dropParentFor({ kind: 'file', path: 'README.md' })).toBe('')
    expect(dropParentFor({ kind: 'root' })).toBe('')
  })

  it("uses the nested file's parent, not an ancestor further up", () => {
    expect(dropParentFor({ kind: 'file', path: 'docs/sub/nota.md' })).toBe('docs/sub')
    expect(dropParentFor({ kind: 'file', path: 'docs/sub/nota.md' })).not.toBe('docs')
  })
})

describe('canMoveEntry', () => {
  it('moves a file into another folder', () => {
    expect(canMoveEntry('docs/guia.md', 'file', 'src')).toEqual({
      ok: true,
      to: 'src/guia.md',
    })
  })

  it('treats the same parent as a no-op', () => {
    expect(canMoveEntry('docs/guia.md', 'file', 'docs')).toEqual({
      ok: false,
      reason: 'noop',
    })
    expect(canMoveEntry('README.md', 'file', '')).toEqual({ ok: false, reason: 'noop' })
    expect(canMoveEntry('docs/sub', 'dir', 'docs')).toEqual({ ok: false, reason: 'noop' })
  })

  it('refuses to nest a folder inside itself', () => {
    expect(canMoveEntry('docs', 'dir', 'docs')).toEqual({ ok: false, reason: 'self' })
    expect(canMoveEntry('docs', 'dir', 'docs/sub')).toEqual({ ok: false, reason: 'self' })
  })

  it('does not treat a prefix sibling as nesting inside itself', () => {
    expect(canMoveEntry('docs', 'dir', 'docs-viejos')).toEqual({
      ok: true,
      to: 'docs-viejos/docs',
    })
  })

  it('allows moving a folder to the root or a sibling', () => {
    expect(canMoveEntry('docs/sub', 'dir', '')).toEqual({ ok: true, to: 'sub' })
    expect(canMoveEntry('docs', 'dir', 'src')).toEqual({ ok: true, to: 'src/docs' })
  })
})

describe('planMove', () => {
  it('moves a file when the destination name is free', () => {
    expect(planMove(tree(), 'docs/guia.md', 'file', 'src')).toEqual({
      ok: true,
      to: 'src/guia.md',
    })
  })

  it('reports a collision for a destination name that only differs in case', () => {
    const nodes = [
      dir('docs', 'docs', [file('guia.md', 'docs/guia.md')]),
      dir('src', 'src', [file('GUIA.md', 'src/GUIA.md')]),
      dir('other', 'other', [file('readme.md', 'other/readme.md')]),
    ]

    expect(planMove(nodes, 'docs/guia.md', 'file', 'src')).toEqual({
      ok: false,
      reason: 'exists',
    })
    expect(planMove(nodes, 'docs/guia.md', 'file', 'other')).toEqual({
      ok: true,
      to: 'other/guia.md',
    })
    expect(planMove([...tree(), ...nodes.slice(2)], 'other/readme.md', 'file', '')).toEqual({
      ok: false,
      reason: 'exists',
    })
  })

  it('keeps a same-folder drop as a no-op, not a collision with itself', () => {
    expect(planMove(tree(), 'README.md', 'file', '')).toEqual({
      ok: false,
      reason: 'noop',
    })
    expect(planMove(tree(), 'docs/guia.md', 'file', 'docs')).toEqual({
      ok: false,
      reason: 'noop',
    })
  })

  it('still refuses to nest a folder inside itself', () => {
    expect(planMove(tree(), 'docs', 'dir', 'docs/sub')).toEqual({
      ok: false,
      reason: 'self',
    })
  })

  it('moves a folder into a prefix sibling, a real sibling, or the root', () => {
    const nodes = [...tree(), dir('docs-viejos', 'docs-viejos')]

    expect(planMove(nodes, 'docs', 'dir', 'docs-viejos')).toEqual({
      ok: true,
      to: 'docs-viejos/docs',
    })
    expect(planMove(tree(), 'docs', 'dir', 'src')).toEqual({
      ok: true,
      to: 'src/docs',
    })
    expect(planMove(tree(), 'docs/sub', 'dir', '')).toEqual({
      ok: true,
      to: 'sub',
    })
  })

  it('moves a file to the root when the name is free', () => {
    expect(planMove(tree(), 'docs/guia.md', 'file', '')).toEqual({
      ok: true,
      to: 'guia.md',
    })
  })
})

describe('isSameRowDoubleClick', () => {
  const first = { path: 'docs/guia.md', at: 1_000 }

  it('treats the first click as a single click', () => {
    expect(isSameRowDoubleClick(null, 'docs/guia.md', 1_000)).toBe(false)
  })

  it('detects a second click on the same row inside the window', () => {
    expect(isSameRowDoubleClick(first, 'docs/guia.md', 1_000 + DOUBLE_CLICK_MS - 1)).toBe(true)
  })

  it('lets a later click on the same row activate again', () => {
    expect(isSameRowDoubleClick(first, 'docs/guia.md', 1_000 + DOUBLE_CLICK_MS)).toBe(false)
  })

  it('does not treat a fast click on another row as a double-click', () => {
    expect(isSameRowDoubleClick(first, 'docs', 1_050)).toBe(false)
  })
})
