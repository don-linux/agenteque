/**
 * ADV-E20. A local writer must not replace the packaged app.
 *
 * Electron's default search is `app.asar`, then `resources/app`, then
 * `default_app.asar`. `onlyLoadAppFromAsar` drops the unpacked directory.
 * `enableEmbeddedAsarIntegrityValidation` rejects a modified archive on
 * macOS and Windows. This package sets both fuses.
 *
 * The intact-archive case stays a normal `it`: a sibling `resources/app`
 * must not win while `app.asar` still opens. Withholding `app.asar` is also
 * a normal `it`: the directory fallback must not load. The byte-edit case
 * stays `it.fails` on Linux: Electron compiles the integrity check out of
 * Linux builds.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import {
  launchPackagedApp,
  packagedExecutable,
  type LaunchedElectronApp,
} from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E20 = { id: 'ADV-E20' } as const

const TAGLINE = 'Abre una carpeta para ver y editar sus archivos markdown.'
// `replaceAsarPayload` edita bytes en sitio, así que el relleno iguala el largo.
const TAMPERED_TAGLINE = 'E20 TAMPERED ASAR PAYLOAD'.padEnd(TAGLINE.length, '!')
const HOSTILE_MARKER = 'E20-HOSTILE-APP-DIR'
const HOSTILE_VERSION = '9.9.9'
const REAL_VERSION = '0.0.1'

interface PackagedSnapshot {
  appPath: string
  version: string
  heading: string
  body: string
  url: string
}

type LaunchResult =
  | { status: 'window'; snap: PackagedSnapshot; logs: string }
  | { status: 'refused'; message: string }

it('does not prefer resources/app over an intact app.asar', async () => {
  await withHostileApp(async () => {
    const result = await launchPackaged()
    if (result.status === 'refused') {
      throw new Error(`intact app.asar refused to launch:\n${result.message}`)
    }
    expect(result.snap).toMatchObject({
      heading: 'agenteque',
      version: REAL_VERSION,
    })
    expect(result.snap.appPath).toMatch(/\/app\.asar$/)
    expect(result.snap.url).toMatch(/\/app\.asar\/out\/renderer\/index\.html$/)
    expect(result.snap.body).toContain(TAGLINE)
    expect(result.snap.body).not.toContain(HOSTILE_MARKER)
    expect(result.snap.body).not.toContain(TAMPERED_TAGLINE)
  })
})

it('ADV-E20 does not load resources/app when app.asar is withheld', { meta: ADV_E20 }, async () => {
  await withoutAppAsar(async () => {
    await withHostileApp(async () => {
      const result = await launchPackaged()
      const snap = result.status === 'window' ? result.snap : undefined
      const message = result.status === 'refused' ? result.message : ''
      expect({
        refused: result.status === 'refused',
        messageMentionsHostile:
          message.includes(HOSTILE_MARKER) || message.includes(HOSTILE_VERSION),
        appPath: snap?.appPath ?? '',
        heading: snap?.heading ?? '',
        version: snap?.version ?? '',
        bodyHasHostile: snap?.body.includes(HOSTILE_MARKER) ?? false,
        bodyHasTagline: snap?.body.includes(TAGLINE) ?? false,
      }).toEqual({
        refused: true,
        messageMentionsHostile: false,
        appPath: '',
        heading: '',
        version: '',
        bodyHasHostile: false,
        bodyHasTagline: false,
      })
    })
  })
})

it.fails('ADV-E20 does not execute a modified app.asar', { meta: ADV_E20 }, async () => {
  await withTamperedAsar(async () => {
    const result = await launchPackaged()
    const body = result.status === 'window' ? result.snap.body : ''
    const heading = result.status === 'window' ? result.snap.heading : ''
    const evidence = result.status === 'window' ? `${result.logs}\n${body}` : result.message
    expect({
      showedTamper: body.includes(TAMPERED_TAGLINE) || evidence.includes(TAMPERED_TAGLINE),
      showedOriginalTagline: body.includes(TAGLINE),
      headingOk: heading === '' || heading === 'agenteque',
      integrity: /integrity/i.test(evidence),
    }).toEqual({
      showedTamper: false,
      showedOriginalTagline: false,
      headingOk: true,
      integrity: true,
    })
  })
})

function resourcesDir(): string {
  return join(dirname(packagedExecutable()), 'resources')
}

async function withHostileApp(run: () => Promise<void>): Promise<void> {
  const appDir = join(resourcesDir(), 'app')
  if (existsSync(appDir)) throw new Error(`${appDir} already exists`)
  mkdirSync(appDir)
  writeFileSync(
    join(appDir, 'package.json'),
    `${JSON.stringify({ name: 'e20-hostile-app-dir', version: HOSTILE_VERSION, main: 'index.js' })}\n`,
  )
  writeFileSync(
    join(appDir, 'index.html'),
    `<!doctype html><title>${HOSTILE_MARKER}</title><h1>${HOSTILE_MARKER}</h1>\n`,
  )
  writeFileSync(
    join(appDir, 'index.js'),
    [
      "const { app, BrowserWindow } = require('electron')",
      "const { join } = require('node:path')",
      'app.whenReady().then(() => {',
      '  const win = new BrowserWindow({',
      '    show: true,',
      '    width: 480,',
      '    height: 320,',
      '    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },',
      '  })',
      "  win.loadFile(join(__dirname, 'index.html'))",
      '})',
      '',
    ].join('\n'),
  )
  try {
    await run()
  } finally {
    rmSync(appDir, { recursive: true, force: true })
  }
}

async function withoutAppAsar(run: () => Promise<void>): Promise<void> {
  const asarPath = join(resourcesDir(), 'app.asar')
  const held = `${asarPath}.e20-held`
  if (!existsSync(asarPath)) throw new Error(`${asarPath} is missing`)
  if (existsSync(held)) throw new Error(`${held} already exists`)
  renameSync(asarPath, held)
  try {
    await run()
  } finally {
    if (existsSync(asarPath)) rmSync(asarPath, { force: true })
    renameSync(held, asarPath)
  }
}

async function withTamperedAsar(run: () => Promise<void>): Promise<void> {
  const asarPath = join(resourcesDir(), 'app.asar')
  const original = readFileSync(asarPath)
  const tampered = replaceAsarPayload(original, TAGLINE, TAMPERED_TAGLINE)
  if (tampered.equals(original)) throw new Error('tamper did not change app.asar')
  writeFileSync(asarPath, tampered)
  try {
    await run()
  } finally {
    writeFileSync(asarPath, original)
  }
}

function replaceAsarPayload(archive: Buffer, from: string, to: string): Buffer {
  if (Buffer.byteLength(from) !== Buffer.byteLength(to)) {
    throw new Error('asar replacement must keep the same byte length')
  }
  if (archive.readUInt32LE(0) !== 4) {
    throw new Error(`unexpected asar size pickle ${archive.readUInt32LE(0)}`)
  }
  const headerBytes = archive.readUInt32LE(4)
  const payloadStart = 8 + headerBytes
  if (payloadStart <= 16 || payloadStart >= archive.length) {
    throw new Error(`asar payload start ${payloadStart} is outside ${archive.length} bytes`)
  }
  const header = archive.subarray(8, payloadStart).toString('utf8')
  if (!header.includes('"files"')) throw new Error('asar header has no files table')
  if (header.includes(from)) throw new Error('replacement text sits in the asar header')

  const needle = Buffer.from(from)
  const payload = archive.subarray(payloadStart)
  const hits: number[] = []
  let cursor = 0
  while (cursor < payload.length) {
    const at = payload.indexOf(needle, cursor)
    if (at < 0) break
    hits.push(at)
    cursor = at + needle.length
  }
  if (hits.length === 0) throw new Error(`"${from}" was not found in the app.asar payload`)

  const tampered = Buffer.from(archive)
  const replacement = Buffer.from(to)
  for (const at of hits) replacement.copy(tampered, payloadStart + at)
  return tampered
}

async function launchPackaged(): Promise<LaunchResult> {
  let launched: LaunchedElectronApp
  try {
    launched = await launchPackagedApp({ timeout: 30_000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('is missing')) throw error
    return { status: 'refused', message }
  }

  try {
    const snap = await readPackaged(launched)
    return { status: 'window', snap, logs: `${launched.stdout}\n${launched.stderr}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'refused', message: `${message}\n${launched.stdout}\n${launched.stderr}` }
  } finally {
    await launched.close()
  }
}

async function readPackaged(launched: LaunchedElectronApp): Promise<PackagedSnapshot> {
  const main = await launched.app.evaluate(({ app }) => ({
    appPath: app.getAppPath(),
    version: app.getVersion(),
  }))
  const window = launched.window
  if (!window) throw new Error('packaged app did not open a window')
  await window.locator('h1').waitFor({ timeout: 15_000 })
  const [heading, body] = await Promise.all([
    window.locator('h1').innerText(),
    window.locator('body').innerText(),
  ])
  return {
    appPath: main.appPath.replaceAll('\\', '/'),
    version: main.version,
    heading: heading.trim(),
    body,
    url: window.url(),
  }
}
