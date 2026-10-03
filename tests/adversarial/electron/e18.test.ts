/**
 * ADV-E18. The renderer must not read the OS clipboard without a grant, and an
 * `<a download>` must not write a file on a path this test did not expect.
 * There is no `setPermissionRequestHandler` and no `will-download` handler.
 * Clipboard read is granted today, and `<a download>` spools bytes into the
 * home directory before any save dialog is confirmed. Those cases stay
 * `it.fails` until the read is denied and the download writes nothing.
 */
import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E18 = { id: 'ADV-E18' } as const
const SETTLE_MS = 2_000
const MAX_FILE_BYTES = 256 * 1024

/**
 * The test never chooses a save directory and never confirms a dialog.
 * Any path that actually receives the download is unexpected.
 */
const EXPECTED_SAVE_PATHS: readonly string[] = []

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  '.config',
  '.cache',
  '.cursor',
  '.local',
  '.npm',
  '.nvm',
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
])

it.fails(
  'ADV-E18 renderer does not read the OS clipboard without a grant',
  { meta: ADV_E18 },
  async () => {
    const secret = `ADV-E18-${randomUUID()}`
    const launched = await launchApp()
    const window = launched.window
    if (!window) throw new Error('app did not open a window')

    try {
      await window.locator('h1').waitFor()
      await launched.app.evaluate(({ clipboard }, text) => {
        clipboard.writeText(text)
      }, secret)

      const observed = await readClipboard(window, secret)
      expect(
        {
          permissionGranted: observed.permission === 'granted',
          readSecret: observed.readSecret,
          pastedSecret: observed.pastedSecret,
        },
        `permission=${observed.permission} read=${observed.readName}`,
      ).toEqual({
        permissionGranted: false,
        readSecret: false,
        pastedSecret: false,
      })
    } finally {
      await launched.app
        .evaluate(({ clipboard }) => {
          clipboard.clear()
        })
        .catch(() => undefined)
      await launched.close()
    }
  },
)

it.fails(
  'ADV-E18 <a download> blob does not write an unexpected file',
  { meta: ADV_E18 },
  async () => {
    const id = randomUUID()
    const payload = `ADV-E18-${id}`
    const filename = `adv-e18-${id}.txt`
    const launched = await launchApp()
    const window = launched.window
    if (!window) throw new Error('app did not open a window')

    let files: string[] = []
    try {
      await window.locator('h1').waitFor()
      const observed = await triggerDownload(launched, window, id, async () => {
        await window.evaluate(
          ({ body, name }) => {
            const view = globalThis as BlobPage
            const blob = new view.Blob([body], { type: 'text/plain' })
            const anchor = view.document.createElement('a')
            anchor.id = 'e18-download'
            anchor.href = view.URL.createObjectURL(blob)
            anchor.download = `../../${name}`
            anchor.textContent = 'download'
            view.document.body.append(anchor)
          },
          { body: payload, name: filename },
        )
      })
      files = observed.files
      expect(downloadViolations(observed, id), describeDownload(observed)).toEqual([])
    } finally {
      await rmFound(files)
      await launched.close()
    }
  },
)

it.fails(
  'ADV-E18 <a download> from 127.0.0.1 does not write an unexpected file',
  { meta: ADV_E18 },
  async () => {
    const id = randomUUID()
    const payload = `ADV-E18-${id}`
    const filename = `adv-e18-${id}.txt`
    const server = await startHostileServer(() => ({
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="../../${filename}"`,
      },
      body: payload,
    }))
    const launched = await launchApp()
    const window = launched.window
    if (!window) throw new Error('app did not open a window')

    let files: string[] = []
    try {
      await window.locator('h1').waitFor()
      const observed = await triggerDownload(launched, window, id, async () => {
        await window.evaluate(
          ({ href, name }) => {
            const view = globalThis as AnchorPage
            const anchor = view.document.createElement('a')
            anchor.id = 'e18-download'
            anchor.href = href
            anchor.download = `../../${name}`
            anchor.textContent = 'download'
            view.document.body.append(anchor)
          },
          { href: `${server.origin}/e18`, name: filename },
        )
      })
      files = observed.files
      expect(downloadViolations(observed, id), describeDownload(observed)).toEqual([])
    } finally {
      await rmFound(files)
      await launched.close()
      await server.close()
    }
  },
)

interface ClipboardObservation {
  permission: string
  readSecret: boolean
  readName: string
  pastedSecret: boolean
}

interface DownloadRecord {
  filename: string
  url: string
  savePath: string
  state: string
}

interface DownloadObservation {
  records: DownloadRecord[]
  files: string[]
}

interface Places {
  downloads: string
  desktop: string
  documents: string
  home: string
  temp: string
  userData: string
  cwd: string
}

async function readClipboard(window: Page, secret: string): Promise<ClipboardObservation> {
  return window.evaluate(async (secretText) => {
    // Kept inside the page callback. Playwright evaluates this function by source,
    // so a helper from the test module is not in scope there.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const nameOf = (error: unknown): string => {
      if (typeof error === 'object' && error !== null && 'name' in error) {
        const named = error as { name?: unknown }
        return typeof named.name === 'string' ? named.name : 'Error'
      }
      return 'Error'
    }
    const view = globalThis as ClipboardPage
    let permission = 'unavailable'
    try {
      const status = await view.navigator.permissions.query({ name: 'clipboard-read' })
      permission = status.state
    } catch (error) {
      permission = `error:${nameOf(error)}`
    }

    const area = view.document.createElement('textarea')
    area.value = ''
    view.document.body.append(area)
    area.focus()
    let pasted = ''
    try {
      view.document.execCommand('paste')
      pasted = area.value
    } catch {
      pasted = ''
    }
    area.remove()

    try {
      const text = await view.navigator.clipboard.readText()
      return {
        permission,
        readSecret: text === secretText,
        readName: 'ok',
        pastedSecret: pasted === secretText,
      }
    } catch (error) {
      return {
        permission,
        readSecret: false,
        readName: nameOf(error),
        pastedSecret: pasted === secretText,
      }
    }
  }, secret)
}

async function triggerDownload(
  launched: LaunchedElectronApp,
  window: Page,
  id: string,
  arm: () => Promise<void>,
): Promise<DownloadObservation> {
  await watchDownloads(launched.app)
  const places = await readPlaces(launched.app)
  await arm()
  const startedAt = Date.now() - 2_000
  await window.locator('#e18-download').click({ noWaitAfter: true, timeout: 10_000 })

  const deadline = Date.now() + SETTLE_MS
  let records: DownloadRecord[] = []
  while (Date.now() < deadline) {
    records = await readDownloads(launched.app)
    if (records.length > 0) break
    await delay(50)
  }
  if (records.length === 0) throw new Error('<a download> did not start a download')

  const fileDeadline = Date.now() + 1_000
  let files: string[] = []
  while (Date.now() < fileDeadline) {
    files = await findPayload(places, id, records, startedAt)
    records = await readDownloads(launched.app)
    if (landings(records, files).length > 0) break
    await delay(100)
  }
  return { records, files }
}

function downloadViolations(observed: DownloadObservation, id: string): string[] {
  const violations: string[] = []
  for (const record of observed.records) {
    if (record.filename.includes('/') || record.filename.includes('\\')) {
      violations.push(`filename:${record.filename}`)
    }
    if (!record.filename.includes(id)) violations.push(`foreign:${record.filename}`)
  }
  for (const path of landings(observed.records, observed.files)) {
    if (!EXPECTED_SAVE_PATHS.includes(path)) violations.push(path)
  }
  return violations
}

function landings(records: readonly DownloadRecord[], files: readonly string[]): string[] {
  const paths = new Set<string>()
  for (const record of records) {
    if (record.savePath !== '') paths.add(record.savePath)
    else if (record.state === 'completed') paths.add(`completed:${record.filename}`)
  }
  for (const file of files) paths.add(file)
  return [...paths]
}

function describeDownload(observed: DownloadObservation): string {
  const events = observed.records.map((record) => {
    const savePath = record.savePath === '' ? '(empty)' : record.savePath
    return `${record.filename} state=${record.state} savePath=${savePath} url=${record.url}`
  })
  const files = observed.files.length === 0 ? 'files=none' : `files=${observed.files.join(',')}`
  return [...events, files].join('; ')
}

async function watchDownloads(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ session }) => {
    const bucket = globalThis as { advE18Downloads?: DownloadRecord[] }
    const records: DownloadRecord[] = []
    bucket.advE18Downloads = records
    session.defaultSession.on('will-download', (_event, item) => {
      const record: DownloadRecord = {
        filename: item.getFilename(),
        url: item.getURL().slice(0, 180),
        savePath: item.getSavePath(),
        state: item.getState(),
      }
      records.push(record)
      const sync = (): void => {
        record.savePath = item.getSavePath()
        record.state = item.getState()
      }
      item.on('updated', sync)
      item.on('done', (_done, state) => {
        record.state = state
        record.savePath = item.getSavePath()
      })
    })
  })
}

async function readDownloads(app: ElectronApplication): Promise<DownloadRecord[]> {
  return app.evaluate(() => {
    const bucket = globalThis as { advE18Downloads?: DownloadRecord[] }
    return bucket.advE18Downloads ?? []
  })
}

async function readPlaces(app: ElectronApplication): Promise<Places> {
  return app.evaluate(({ app: electronApp }) => ({
    downloads: electronApp.getPath('downloads'),
    desktop: electronApp.getPath('desktop'),
    documents: electronApp.getPath('documents'),
    home: electronApp.getPath('home'),
    temp: electronApp.getPath('temp'),
    userData: electronApp.getPath('userData'),
    cwd: process.cwd(),
  }))
}

async function findPayload(
  places: Places,
  id: string,
  records: readonly DownloadRecord[],
  startedAt: number,
): Promise<string[]> {
  const found = new Set<string>()
  const seen = new Set<string>()
  for (const root of scanRoots(places)) {
    await walkNames(root.dir, root.depth, id, found, seen)
  }
  const shallow = [
    places.downloads,
    places.desktop,
    places.documents,
    places.home,
    places.temp,
    places.cwd,
    tmpdir(),
  ]
  for (const dir of shallow) await readNewFiles(dir, id, startedAt, found)
  for (const record of records) {
    if (record.savePath === '') continue
    try {
      const info = await stat(record.savePath)
      if (info.isFile()) found.add(record.savePath)
    } catch {
      // The save path was chosen and the file is not there yet.
    }
  }
  return [...found]
}

function scanRoots(places: Places): { dir: string; depth: number }[] {
  const roots = [
    { dir: places.downloads, depth: 2 },
    { dir: places.desktop, depth: 2 },
    { dir: places.documents, depth: 2 },
    { dir: places.home, depth: 2 },
    { dir: places.temp, depth: 3 },
    { dir: places.userData, depth: 3 },
    { dir: places.cwd, depth: 2 },
    { dir: tmpdir(), depth: 2 },
  ]
  const seen = new Set<string>()
  return roots.filter((root) => {
    if (seen.has(root.dir)) return false
    seen.add(root.dir)
    return true
  })
}

async function walkNames(
  dir: string,
  depth: number,
  id: string,
  found: Set<string>,
  seen: Set<string>,
): Promise<void> {
  if (depth < 0 || seen.has(dir)) return
  seen.add(dir)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walkNames(path, depth - 1, id, found, seen)
      continue
    }
    if (entry.isFile() && entry.name.includes(id)) found.add(path)
  }
}

async function readNewFiles(
  dir: string,
  id: string,
  startedAt: number,
  found: Set<string>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const needle = Buffer.from(id)
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || entry.name.includes(id)) continue
    const path = join(dir, entry.name)
    let info
    try {
      info = await stat(path)
    } catch {
      continue
    }
    if (
      !info.isFile() ||
      info.mtimeMs < startedAt ||
      info.size > MAX_FILE_BYTES ||
      info.size === 0
    ) {
      continue
    }
    let data: Buffer
    try {
      data = await readFile(path)
    } catch {
      continue
    }
    if (data.includes(needle)) found.add(path)
  }
}

async function rmFound(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map(async (path) => rm(path, { force: true })))
}

interface TextArea {
  value: string
  focus(): void
  remove(): void
}

type ClipboardPage = typeof globalThis & {
  document: {
    body: { append(node: TextArea): void }
    createElement(tag: string): TextArea
    execCommand(command: string): boolean
  }
  navigator: {
    clipboard: { readText(): Promise<string> }
    permissions: { query(query: { name: string }): Promise<{ state: string }> }
  }
}

interface Anchor {
  id: string
  href: string
  download: string
  textContent: string
}

type AnchorPage = typeof globalThis & {
  document: {
    body: { append(node: Anchor): void }
    createElement(tag: string): Anchor
  }
}

type BlobPage = AnchorPage & {
  Blob: new (parts: string[], options: { type: string }) => object
  URL: { createObjectURL(blob: object): string }
}
