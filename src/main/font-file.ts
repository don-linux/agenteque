import { open, type FileHandle } from 'node:fs/promises'

export interface FontFace {
  family: string
  monospace: boolean
}

const MAX_TABLES = 80
const MAX_TABLE_BYTES = 1024 * 1024
const MAX_TTC_FACES = 64

export function familyFromNameTable(table: Uint8Array): string | null {
  if (table.length < 6) return null
  const view = Buffer.from(table.buffer, table.byteOffset, table.byteLength)
  const count = view.readUInt16BE(2)
  const stringOffset = view.readUInt16BE(4)
  if (count === 0 || 6 + count * 12 > view.length) return null

  let best = ''
  let bestRank = -1
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 12
    const platform = view.readUInt16BE(at)
    const encoding = view.readUInt16BE(at + 2)
    const language = view.readUInt16BE(at + 4)
    const nameId = view.readUInt16BE(at + 6)
    const length = view.readUInt16BE(at + 8)
    const offset = view.readUInt16BE(at + 10)
    const rank = nameRank(platform, encoding, language, nameId)
    if (rank < 0 || rank < bestRank) continue
    const start = stringOffset + offset
    if (start + length > view.length) continue
    const family = decodeName(platform, view.subarray(start, start + length))
    if (family === '') continue
    best = family
    bestRank = rank
  }
  return best === '' ? null : best
}

export function monospaceFromTables(post: Uint8Array | null, os2: Uint8Array | null): boolean {
  if (post && post.length >= 16) {
    const view = Buffer.from(post.buffer, post.byteOffset, post.byteLength)
    if (view.readUInt32BE(12) !== 0) return true
  }
  if (os2 && os2.length >= 42) {
    const familyType = os2[32] ?? 0
    const proportion = os2[33] ?? 0
    if ((familyType === 2 || familyType === 3 || familyType === 4) && proportion === 9) return true
  }
  return false
}

export function parseFontBytes(bytes: Uint8Array): FontFace[] {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return facesFromBuffer(buffer)
}

export async function readFontFaces(file: string): Promise<FontFace[]> {
  const handle = await open(file, 'r')
  try {
    return await facesFromHandle(handle)
  } finally {
    await handle.close()
  }
}

function nameRank(platform: number, encoding: number, language: number, nameId: number): number {
  if (nameId !== 1 && nameId !== 16) return -1
  let score = nameId === 16 ? 200 : 100
  if (platform === 3 && (encoding === 1 || encoding === 10)) {
    score += language === 0x409 ? 30 : 20
  } else if (platform === 0) {
    score += 10
  } else if (platform === 1 && encoding === 0) {
    score += 5
  } else {
    return -1
  }
  return score
}

function decodeName(platform: number, bytes: Buffer): string {
  if (platform === 3 || platform === 0) {
    if (bytes.length < 2) return ''
    return new TextDecoder('utf-16be').decode(bytes).replaceAll('\u0000', '').trim()
  }
  return bytes.toString('latin1').replaceAll('\u0000', '').trim()
}

function facesFromBuffer(buffer: Buffer): FontFace[] {
  if (buffer.length < 12) return []
  const tag = buffer.toString('ascii', 0, 4)
  if (tag === 'ttcf') {
    const count = buffer.readUInt32BE(8)
    if (count === 0 || count > MAX_TTC_FACES || 12 + count * 4 > buffer.length) return []
    const faces: FontFace[] = []
    for (let index = 0; index < count; index += 1) {
      const face = faceAt(buffer, buffer.readUInt32BE(12 + index * 4))
      if (face) faces.push(face)
    }
    return faces
  }
  const version = buffer.readUInt32BE(0)
  if (tag !== 'OTTO' && tag !== 'true' && version !== 0x00010000) return []
  const face = faceAt(buffer, 0)
  return face ? [face] : []
}

function faceAt(buffer: Buffer, offset: number): FontFace | null {
  if (offset < 0 || offset + 12 > buffer.length) return null
  const numTables = buffer.readUInt16BE(offset + 4)
  if (numTables === 0 || numTables > MAX_TABLES) return null
  const directory = offset + 12
  if (directory + numTables * 16 > buffer.length) return null

  let name: Buffer | null = null
  let post: Buffer | null = null
  let os2: Buffer | null = null
  for (let index = 0; index < numTables; index += 1) {
    const at = directory + index * 16
    const tableTag = buffer.toString('ascii', at, at + 4)
    const tableOffset = buffer.readUInt32BE(at + 8)
    const length = buffer.readUInt32BE(at + 12)
    if (length > MAX_TABLE_BYTES || tableOffset + length > buffer.length) continue
    const slice = buffer.subarray(tableOffset, tableOffset + length)
    if (tableTag === 'name') name = slice
    else if (tableTag === 'post') post = slice
    else if (tableTag === 'OS/2') os2 = slice
  }
  if (!name) return null
  const family = familyFromNameTable(name)
  if (!family) return null
  return { family, monospace: monospaceFromTables(post, os2) }
}

async function facesFromHandle(handle: FileHandle): Promise<FontFace[]> {
  const header = await readAt(handle, 0, 12)
  if (!header) return []
  const tag = header.toString('ascii', 0, 4)
  if (tag === 'ttcf') {
    const count = header.readUInt32BE(8)
    if (count === 0 || count > MAX_TTC_FACES) return []
    const offsets = await readAt(handle, 12, count * 4)
    if (!offsets) return []
    const faces: FontFace[] = []
    for (let index = 0; index < count; index += 1) {
      const face = await faceFromHandle(handle, offsets.readUInt32BE(index * 4))
      if (face) faces.push(face)
    }
    return faces
  }
  const version = header.readUInt32BE(0)
  if (tag !== 'OTTO' && tag !== 'true' && version !== 0x00010000) return []
  const face = await faceFromHandle(handle, 0)
  return face ? [face] : []
}

async function faceFromHandle(handle: FileHandle, offset: number): Promise<FontFace | null> {
  const head = await readAt(handle, offset, 12)
  if (!head) return null
  const numTables = head.readUInt16BE(4)
  if (numTables === 0 || numTables > MAX_TABLES) return null
  const directory = await readAt(handle, offset + 12, numTables * 16)
  if (!directory) return null

  let name: Buffer | null = null
  let post: Buffer | null = null
  let os2: Buffer | null = null
  for (let index = 0; index < numTables; index += 1) {
    const at = index * 16
    const tableTag = directory.toString('ascii', at, at + 4)
    if (tableTag !== 'name' && tableTag !== 'post' && tableTag !== 'OS/2') continue
    const tableOffset = directory.readUInt32BE(at + 8)
    const length = directory.readUInt32BE(at + 12)
    const slice = await readAt(handle, tableOffset, length)
    if (!slice) continue
    if (tableTag === 'name') name = slice
    else if (tableTag === 'post') post = slice
    else os2 = slice
  }
  if (!name) return null
  const family = familyFromNameTable(name)
  if (!family) return null
  return { family, monospace: monospaceFromTables(post, os2) }
}

async function readAt(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer | null> {
  if (!Number.isInteger(position) || position < 0) return null
  if (!Number.isInteger(length) || length <= 0 || length > MAX_TABLE_BYTES) return null
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  if (bytesRead !== length) return null
  return buffer
}
