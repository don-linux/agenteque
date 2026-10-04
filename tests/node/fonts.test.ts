import { describe, expect, it } from 'vitest'
import { FontIndex } from '../../src/main/font-index'
import { parseWindowsFontRegistry } from '../../src/main/font-catalog'
import {
  familyFromNameTable,
  monospaceFromTables,
  parseFontBytes,
  readFontFaces,
} from '../../src/main/font-file'
import { FONT_PAGE_SIZE, parseFcListLine, sortFonts } from '../../src/shared/fonts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('fontconfig lines', () => {
  it('keeps the first family and marks mono spacing', () => {
    expect(parseFcListLine('Hack,Hack Regular\t100')).toEqual({
      family: 'Hack',
      monospace: true,
    })
    expect(parseFcListLine('Inter\t0')).toEqual({ family: 'Inter', monospace: false })
    expect(parseFcListLine('Noto Sans Mono\t110')).toEqual({
      family: 'Noto Sans Mono',
      monospace: true,
    })
    expect(parseFcListLine('')).toBeNull()
  })
})

describe('font pages', () => {
  it('sorts monospace first and pages the filtered list', () => {
    const index = new FontIndex()
    index.add('Inter', false)
    index.add('Hack', true)
    index.add('Hack', false)
    index.add('Zed Mono', true)
    index.finish()

    expect(sortFonts(index.page('', 0, 10).families).map((font) => font.family)).toEqual([
      'Hack',
      'Zed Mono',
      'Inter',
    ])
    expect(index.page('', 0, 10).families[0]).toEqual({ family: 'Hack', monospace: true })

    const page = index.page('mono', 0, FONT_PAGE_SIZE)
    expect(page.families.map((font) => font.family)).toEqual(['Zed Mono'])
    expect(page.total).toBe(1)
    expect(page.scanning).toBe(false)

    const first = index.page('', 0, 2)
    expect(first.families).toHaveLength(2)
    expect(first.total).toBe(3)
    expect(index.page('', 2, 2).families.map((font) => font.family)).toEqual(['Inter'])
  })
})

describe('windows registry fonts', () => {
  it('resolves bare file names against the fonts directory', () => {
    const stdout = [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      '    Arial (TrueType)    REG_SZ    arial.ttf',
      '    Custom (TrueType)    REG_SZ    D:\\Fonts\\Custom.otf',
    ].join('\r\n')
    expect(parseWindowsFontRegistry(stdout, 'C:\\Windows\\Fonts')).toEqual([
      'C:\\Windows\\Fonts\\arial.ttf',
      'D:\\Fonts\\Custom.otf',
    ])
  })
})

function utf16be(text: string): Buffer {
  return Buffer.from(text, 'utf16le').swap16()
}

function nameTable(family: string): Buffer {
  const text = utf16be(family)
  const header = Buffer.alloc(6)
  header.writeUInt16BE(0, 0)
  header.writeUInt16BE(1, 2)
  header.writeUInt16BE(18, 4)
  const record = Buffer.alloc(12)
  record.writeUInt16BE(3, 0)
  record.writeUInt16BE(1, 2)
  record.writeUInt16BE(0x409, 4)
  record.writeUInt16BE(16, 6)
  record.writeUInt16BE(text.length, 8)
  record.writeUInt16BE(0, 10)
  return Buffer.concat([header, record, text])
}

function postTable(fixed: boolean): Buffer {
  const table = Buffer.alloc(16)
  table.writeUInt32BE(0x00030000, 0)
  table.writeUInt32BE(fixed ? 1 : 0, 12)
  return table
}

function os2Table(familyType: number, proportion: number): Buffer {
  const table = Buffer.alloc(42)
  table[32] = familyType
  table[33] = proportion
  return table
}

function sfnt(tables: Record<string, Buffer>): Buffer {
  const entries = Object.entries(tables)
  const directory = 12 + entries.length * 16
  let cursor = directory
  const placed = entries.map(([tag, data]) => {
    const offset = cursor
    cursor += data.length
    return { tag, data, offset }
  })
  const header = Buffer.alloc(directory)
  header.writeUInt32BE(0x00010000, 0)
  header.writeUInt16BE(entries.length, 4)
  for (let index = 0; index < placed.length; index += 1) {
    const row = placed[index]
    if (!row) continue
    const at = 12 + index * 16
    header.write(row.tag, at, 4, 'ascii')
    header.writeUInt32BE(row.offset, at + 8)
    header.writeUInt32BE(row.data.length, at + 12)
  }
  return Buffer.concat([header, ...placed.map((row) => row.data)])
}

describe('font files', () => {
  it('reads the typographic family and the monospace bit', () => {
    const bytes = sfnt({
      name: nameTable('JetBrains Mono'),
      post: postTable(true),
      'OS/2': os2Table(2, 0),
    })
    expect(parseFontBytes(bytes)).toEqual([{ family: 'JetBrains Mono', monospace: true }])
    expect(familyFromNameTable(nameTable('Hack'))).toBe('Hack')
    expect(monospaceFromTables(postTable(false), os2Table(2, 9))).toBe(true)
    expect(monospaceFromTables(postTable(false), os2Table(2, 0))).toBe(false)
  })

  it('reads the same face back from disk', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agenteque-font-'))
    try {
      const file = join(root, 'Demo.ttf')
      writeFileSync(
        file,
        sfnt({ name: nameTable('Demo Mono'), post: postTable(false), 'OS/2': os2Table(2, 9) }),
      )
      await expect(readFontFaces(file)).resolves.toEqual([{ family: 'Demo Mono', monospace: true }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
