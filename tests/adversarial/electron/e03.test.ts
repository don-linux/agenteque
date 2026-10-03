/**
 * ADV-E03. Assigning `location.href` must not navigate the main window.
 * There is no `will-navigate` handler, so these cases leave the app today
 * and stay `it.fails` until the window remains on its page with `window.api`.
 *
 * The file case loads a document this test writes. It does not read
 * `/etc/passwd`, whose `root:x:0:0` marker is a Linux passwd format.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import type { AppVersions } from '../../../src/shared/ipc'
import { launchApp, startHostileServer } from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E03 = { id: 'ADV-E03' } as const
const SETTLE_MS = 3_000
const FILE_MARKER = 'ADV-E03-LOCAL-FILE'

interface Observation {
  home: string
  url: string
  showsApp: boolean
  showsMarker: boolean
  requests: string[]
  apiExposed: boolean
}

it.fails('ADV-E03 main window does not load a remote origin', { meta: ADV_E03 }, async () => {
  const server = await startHostileServer()
  const observed = await navigate(`${server.origin}/e03`, 'hostile', () =>
    server.requests.map((request) => request.url),
  )
  expect(observed).toEqual({
    home: observed.home,
    url: observed.home,
    showsApp: true,
    showsMarker: false,
    requests: [],
    apiExposed: true,
  })
})

it.fails('ADV-E03 main window does not load a local file URL', { meta: ADV_E03 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenteque-e03-'))
  const file = join(dir, 'secret.html')
  writeFileSync(file, `<!doctype html><title>${FILE_MARKER}</title><p>${FILE_MARKER}</p>\n`)
  try {
    const observed = await navigate(pathToFileURL(file).href, FILE_MARKER, () => [])
    expect(observed).toEqual({
      home: observed.home,
      url: observed.home,
      showsApp: true,
      showsMarker: false,
      requests: [],
      apiExposed: true,
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function navigate(
  target: string,
  marker: string,
  requests: () => string[],
): Promise<Observation> {
  const launched = await launchApp()
  const window = launched.window
  if (!window) throw new Error('app did not open a window')

  try {
    await window.locator('h1').waitFor()
    const home = await mainUrl(launched.app)
    if (!home.includes('/renderer/index.html')) throw new Error(`renderer did not load: ${home}`)

    await assignLocation(window, target)
    const settled = await settle(launched.app, window, home, marker)
    const versions = await readVersions(window)
    return {
      home,
      url: settled.url,
      showsApp: settled.body.includes('agenteque'),
      showsMarker: settled.body.includes(marker),
      requests: requests(),
      apiExposed: versionsExposed(versions),
    }
  } finally {
    await launched.close()
  }
}

async function settle(
  app: ElectronApplication,
  window: Page,
  home: string,
  marker: string,
): Promise<{ url: string; body: string }> {
  const deadline = Date.now() + SETTLE_MS
  let url = home
  let body = ''
  while (Date.now() < deadline) {
    url = await mainUrl(app)
    body = await readBody(window)
    if (url !== home && body.includes(marker)) return { url, body }
    await delay(50)
  }
  return { url, body }
}

async function mainUrl(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0]?.webContents.getURL() ?? ''
  })
}

async function assignLocation(window: Page, url: string): Promise<void> {
  await window.evaluate((next: string) => {
    const view = globalThis as RendererGlobal
    view.location.href = next
  }, url)
}

async function readBody(window: Page): Promise<string> {
  try {
    return await window.locator('body').innerText({ timeout: 1_000 })
  } catch {
    return ''
  }
}

async function readVersions(window: Page): Promise<AppVersions | null> {
  return window.evaluate(async () => {
    const view = globalThis as RendererGlobal
    const getVersions = view.api?.getVersions
    if (!getVersions) return null
    return getVersions()
  })
}

function versionsExposed(versions: AppVersions | null): boolean {
  if (!versions) return false
  return [versions.app, versions.electron, versions.chrome, versions.node].every(
    (value) => value.length > 0,
  )
}

type RendererGlobal = typeof globalThis & {
  location: { href: string }
  api?: { getVersions?: () => Promise<AppVersions> }
}
