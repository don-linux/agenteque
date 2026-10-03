/**
 * ADV-E13. The packaged binary must ignore ELECTRON_RENDERER_URL.
 * A hostile http origin in that variable must not be requested, and the
 * window must stay on the built file page inside app.asar.
 */
import { setTimeout as delay } from 'node:timers/promises'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import { launchPackagedApp, startHostileServer } from '../helpers/electron'

const MARKER = 'adv-e13-hostile'
const SETTLE_MS = 15_000
const QUIET_MS = 1_000

interface Snapshot {
  packaged: boolean
  rendererUrl: string
  url: string
  body: string
  heading: string
  title: string
}

it('packaged app does not load ELECTRON_RENDERER_URL', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><title>${MARKER}</title><p>${MARKER}</p>`,
  }))
  if (!server.origin.startsWith('http://127.0.0.1:')) {
    throw new Error(`hostile origin must stay on 127.0.0.1: ${server.origin}`)
  }

  const launched = await launchPackagedApp({
    env: { ELECTRON_RENDERER_URL: server.origin },
  })
  const window = launched.window
  if (!window) throw new Error('packaged app did not open a window')

  try {
    const observed = await observe(launched.app, window, () => server.requests.length)
    const requests = server.requests.map((request) => `${request.method} ${request.url}`)

    expect({
      packaged: observed.packaged,
      rendererUrl: observed.rendererUrl,
      protocol: pageProtocol(observed.url),
      url: observed.url,
      requests,
      showsApp: observed.body.includes('agenteque'),
      showsHostile: observed.body.includes(MARKER) || observed.title === MARKER,
      heading: observed.heading,
      title: observed.title,
    }).toEqual({
      packaged: true,
      rendererUrl: server.origin,
      protocol: 'file:',
      url: expect.stringMatching(/\/app\.asar\/out\/renderer\/index\.html$/),
      requests: [],
      showsApp: true,
      showsHostile: false,
      heading: 'agenteque',
      title: 'agenteque',
    })
  } finally {
    await launched.close()
  }
})

async function observe(
  app: ElectronApplication,
  window: Page,
  requestCount: () => number,
): Promise<Snapshot> {
  const deadline = Date.now() + SETTLE_MS
  let snapshot = await readSnapshot(app, window)
  while (Date.now() < deadline && !landed(snapshot, requestCount())) {
    await delay(50)
    snapshot = await readSnapshot(app, window)
  }
  await delay(QUIET_MS)
  return readSnapshot(app, window)
}

function landed(snapshot: Snapshot, requestCount: number): boolean {
  if (requestCount > 0) return true
  if (snapshot.url.startsWith('http://') || snapshot.url.startsWith('https://')) return true
  if (snapshot.body.includes(MARKER) || snapshot.title === MARKER) return true
  return snapshot.url.includes('/renderer/index.html') && snapshot.body.includes('agenteque')
}

async function readSnapshot(app: ElectronApplication, window: Page): Promise<Snapshot> {
  const [main, body, title, heading] = await Promise.all([
    readMain(app),
    readBody(window),
    window.title().catch(() => ''),
    readHeading(window),
  ])
  return { ...main, body, title, heading }
}

async function readMain(app: ElectronApplication): Promise<{
  packaged: boolean
  rendererUrl: string
  url: string
}> {
  return app.evaluate(({ app: electronApp, BrowserWindow }) => {
    return {
      packaged: electronApp.isPackaged,
      rendererUrl: process.env.ELECTRON_RENDERER_URL ?? '',
      url: BrowserWindow.getAllWindows()[0]?.webContents.getURL() ?? '',
    }
  })
}

async function readBody(window: Page): Promise<string> {
  try {
    return await window.locator('body').innerText({ timeout: 250 })
  } catch {
    return ''
  }
}

async function readHeading(window: Page): Promise<string> {
  try {
    const text = await window.locator('h1').textContent({ timeout: 250 })
    return text?.trim() ?? ''
  } catch {
    return ''
  }
}

function pageProtocol(url: string): string {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}
