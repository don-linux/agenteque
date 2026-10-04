import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEntry,
  listContextTree,
  listWorkspaceDirs,
  readMarkdown,
  stopWatching,
  writeMarkdown,
} from '../../src/main/workspace-fs'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'agenteque-fs-'))
  roots.push(root)
  return root
}

afterEach(() => {
  stopWatching()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('workspace filesystem', () => {
  it('lists markdown, skips blacklisted directories and symlinks', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'notas'))
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'README.md'), '# hola\n')
    writeFileSync(join(root, 'notas', 'ideas.md'), 'uno\n')
    writeFileSync(join(root, 'node_modules', 'leeme.md'), 'no\n')
    writeFileSync(join(root, 'notas.txt'), 'no\n')
    symlinkSync(join(root, 'README.md'), join(root, 'enlace.md'))

    const listed = listWorkspaceDirs(root)
    expect(listed.dirs).toEqual(['notas'])
    const tree = listContextTree(listed.root, null)
    expect(tree.map((node) => node.path)).toEqual(['notas', 'README.md'])
    expect(tree[0]?.children.map((node) => node.path)).toEqual(['notas/ideas.md'])
  })

  it('rejects paths that leave the workspace and preserves CRLF', () => {
    const root = tempRoot()
    writeFileSync(join(root, 'README.md'), 'uno\r\ndos\r\n')
    expect(() => readMarkdown(root, '../README.md')).toThrow('Ruta inválida')
    expect(readMarkdown(root, 'README.md')).toBe('uno\ndos\n')
    writeMarkdown(root, 'README.md', 'uno\ndos\ntres\n')
    expect(readMarkdown(root, 'README.md')).toBe('uno\ndos\ntres\n')
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('uno\r\ndos\r\ntres\r\n')
  })

  it('creates a nested markdown file and rejects a case collision', () => {
    const root = tempRoot()
    createEntry(root, 'docs/guia.md', 'file')
    expect(readMarkdown(root, 'docs/guia.md')).toBe('')
    expect(() => createEntry(root, 'Docs/guia.md', 'file')).toThrow('ya existe')
  })
})
