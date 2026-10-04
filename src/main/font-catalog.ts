import { spawn } from 'node:child_process'
import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, win32 } from 'node:path'
import { FONT_LIST_FAILED_MESSAGE } from '../shared/messages'
import { parseFcListLine } from '../shared/fonts'
import type { FontPageResult } from '../shared/ipc'
import { readFontFaces } from './font-file'
import { FontIndex } from './font-index'

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc'])

const WINDOWS_FONT_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
] as const

let catalog: FontIndex | null = null

export function readFontPage(query: string, offset: number, limit: number): FontPageResult {
  if (!catalog) {
    catalog = new FontIndex()
    void scan(catalog)
  }
  return catalog.page(typeof query === 'string' ? query : '', offset, limit)
}

export function parseWindowsFontRegistry(stdout: string, fontsDir: string): string[] {
  const paths: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s+.+?\s+REG_SZ\s+(.+?)\s*$/.exec(line)
    const data = match?.[1]?.trim() ?? ''
    if (data === '') continue
    paths.push(win32.isAbsolute(data) ? data : win32.join(fontsDir, data))
  }
  return paths
}

async function scan(target: FontIndex): Promise<void> {
  try {
    if (process.platform === 'linux') {
      const error = await scanFontconfig(target)
      target.finish(error)
      return
    }
    await scanFontFiles(target)
    target.finish()
  } catch {
    target.finish(FONT_LIST_FAILED_MESSAGE)
  }
}

function scanFontconfig(target: FontIndex): Promise<string | undefined> {
  return new Promise((resolve) => {
    let failed = false
    let buffer = ''
    const child = spawn('fc-list', ['-f', '%{family}\t%{spacing}\n'], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const face = parseFcListLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        if (face) target.add(face.family, face.monospace)
        newline = buffer.indexOf('\n')
      }
    })
    child.on('error', () => {
      failed = true
    })
    child.on('close', (code) => {
      const tail = parseFcListLine(buffer)
      if (tail) target.add(tail.family, tail.monospace)
      const empty = target.page('', 0, 1).total === 0
      resolve(failed || (code !== 0 && empty) ? FONT_LIST_FAILED_MESSAGE : undefined)
    })
  })
}

function fontDirectories(): string[] {
  if (process.platform === 'darwin') {
    return ['/System/Library/Fonts', '/Library/Fonts', join(homedir(), 'Library', 'Fonts')]
  }
  if (process.platform === 'win32') {
    const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
    const dirs = [join(windir, 'Fonts')]
    if (process.env.LOCALAPPDATA) {
      dirs.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'))
    }
    return dirs
  }
  return []
}

async function scanFontFiles(target: FontIndex): Promise<void> {
  const seen = new Set<string>()
  for (const root of fontDirectories()) await walk(root, seen, target)
  if (process.platform !== 'win32') return
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const fontsDir = win32.join(windir, 'Fonts')
  for (const key of WINDOWS_FONT_KEYS) {
    const listed = parseWindowsFontRegistry(await regQuery(key), fontsDir)
    for (const file of listed) await readOne(file, seen, target)
  }
}

async function walk(directory: string, seen: Set<string>, target: FontIndex): Promise<void> {
  let resolved: string
  try {
    resolved = await realpath(directory)
  } catch {
    return
  }
  if (seen.has(resolved)) return
  seen.add(resolved)

  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      await follow(full, seen, target)
      continue
    }
    if (entry.isDirectory()) {
      await walk(full, seen, target)
      continue
    }
    if (entry.isFile() && FONT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      await readOne(full, seen, target)
    }
  }
}

async function follow(full: string, seen: Set<string>, target: FontIndex): Promise<void> {
  let info
  try {
    info = await stat(full)
  } catch {
    return
  }
  if (info.isDirectory()) await walk(full, seen, target)
  else if (info.isFile() && FONT_EXTENSIONS.has(extname(full).toLowerCase())) {
    await readOne(full, seen, target)
  }
}

async function readOne(file: string, seen: Set<string>, target: FontIndex): Promise<void> {
  let resolved: string
  try {
    resolved = await realpath(file)
  } catch {
    return
  }
  if (seen.has(resolved)) return
  seen.add(resolved)
  try {
    const faces = await readFontFaces(resolved)
    for (const face of faces) target.add(face.family, face.monospace)
  } catch {
    // Un archivo ilegible no tumba el inventario.
  }
}

function regQuery(key: string): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    const child = spawn('reg.exe', ['query', key], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}
