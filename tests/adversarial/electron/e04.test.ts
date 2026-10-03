/**
 * ADV-E04. A 302, a meta refresh, a form submit, and history must not move
 * the main window onto an external origin. There is no will-navigate or
 * will-redirect handler, so these cases leave the app today and stay
 * `it.fails` until the window remains on its page. When a case starts
 * passing, drop `it.fails` so the assertion guards the fix.
 */
import { setTimeout as delay } from 'node:timers/promises'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import type { AppVersions } from '../../../src/shared/ipc'
import {
  type HostileRequest,
  type HostileResponse,
  launchApp,
  startHostileServer,
} from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E04 = { id: 'ADV-E04' } as const
const SETTLE_MS = 3_000

interface Observation {
  home: string
  url: string
  showsApp: boolean
  showsMarker: boolean
  requests: string[]
  apiExposed: boolean
}

it.fails('ADV-E04 main window does not follow an HTTP 302', { meta: ADV_E04 }, async () => {
  const observed = await attack('landed-302', (page, origin) =>
    page.evaluate(assignLocation, `${origin}/redirect`),
  )
  expect(observed).toEqual(stayedOnApp(observed))
})

it.fails('ADV-E04 main window does not follow a meta refresh', { meta: ADV_E04 }, async () => {
  const observed = await attack('landed-meta', (page, origin) =>
    page.evaluate(installMetaRefresh, `${origin}/meta`),
  )
  expect(observed).toEqual(stayedOnApp(observed))
})

it.fails('ADV-E04 main window does not follow a form submit', { meta: ADV_E04 }, async () => {
  const observed = await attack('landed-form', (page, origin) =>
    page.evaluate(submitForm, `${origin}/form`),
  )
  expect(observed).toEqual(stayedOnApp(observed))
})

it.fails(
  'ADV-E04 main window does not follow history back to an external origin',
  { meta: ADV_E04 },
  async () => {
    const observed = await attackViaHistory()
    // loadURL already requested /history while planting the session entry.
    // The secure result is the final document, not an empty request log.
    expect(observed).toEqual({ ...stayedOnApp(observed), requests: observed.requests })
  },
)

function stayedOnApp(observed: Observation): Observation {
  return {
    home: observed.home,
    url: observed.home,
    showsApp: true,
    showsMarker: false,
    requests: [],
    apiExposed: true,
  }
}

function hostileResponse(request: HostileRequest): HostileResponse {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  if (path === '/redirect') {
    const host = request.headers.host
    if (!host?.startsWith('127.0.0.1:')) throw new Error(`unexpected host ${String(host)}`)
    return { status: 302, headers: { location: `http://${host}/landed-302` }, body: '' }
  }

  const marker = {
    '/landed-302': 'landed-302',
    '/meta': 'landed-meta',
    '/form': 'landed-form',
    '/history': 'landed-history',
  }[path]
  if (!marker) return { status: 404, body: 'not found' }
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><title>${marker}</title><p>${marker}</p>`,
  }
}

async function attack(
  marker: string,
  action: (page: Page, origin: string) => Promise<unknown>,
): Promise<Observation> {
  const server = await startHostileServer(hostileResponse)
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('app did not open a window')

  try {
    await page.locator('h1').waitFor()
    const home = await mainUrl(launched.app)
    if (!home.includes('/renderer/index.html')) throw new Error(`renderer did not load: ${home}`)

    try {
      await action(page, server.origin)
    } catch (error) {
      if (!isEvaluationContextGone(error)) throw error
    }

    const settled = await settle(launched.app, page, home, marker)
    return observe(home, settled, marker, server.requests, await readVersions(page))
  } finally {
    await launched.close()
  }
}

async function attackViaHistory(): Promise<Observation> {
  const server = await startHostileServer(hostileResponse)
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('app did not open a window')

  try {
    await page.locator('h1').waitFor()
    const home = await mainUrl(launched.app)
    if (!home.includes('/renderer/index.html')) throw new Error(`renderer did not load: ${home}`)

    // loadURL does not emit will-navigate. The external document is planted
    // behind the app, then history.back() is the navigation under test.
    const target = `${server.origin}/history`
    await loadInMainWindow(launched.app, target)
    const planted = await mainUrl(launched.app)
    if (planted !== target) throw new Error(`external entry was not planted: ${planted}`)
    await loadInMainWindow(launched.app, home)
    const restored = await mainUrl(launched.app)
    if (restored !== home) throw new Error(`did not return to the app: ${restored}`)

    try {
      await page.evaluate(historyBack)
    } catch (error) {
      if (!isEvaluationContextGone(error)) throw error
    }

    const settled = await settle(launched.app, page, home, 'landed-history')
    return observe(home, settled, 'landed-history', server.requests, await readVersions(page))
  } finally {
    await launched.close()
  }
}

function observe(
  home: string,
  settled: { url: string; body: string },
  marker: string,
  requests: readonly HostileRequest[],
  versions: AppVersions | null,
): Observation {
  return {
    home,
    url: settled.url,
    showsApp: settled.body.includes('agenteque'),
    showsMarker: settled.body.includes(marker),
    requests: requests.map((request) => request.url),
    apiExposed: versionsExposed(versions),
  }
}

async function settle(
  app: ElectronApplication,
  page: Page,
  home: string,
  marker: string,
): Promise<{ url: string; body: string }> {
  const deadline = Date.now() + SETTLE_MS
  let url = home
  let body = ''
  while (Date.now() < deadline) {
    url = await mainUrl(app)
    body = await readBody(page)
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

async function loadInMainWindow(app: ElectronApplication, url: string): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }, target: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('main window is missing')
    await win.loadURL(target)
  }, url)
}

async function readBody(page: Page): Promise<string> {
  try {
    return await page.locator('body').innerText({ timeout: 1_000 })
  } catch {
    return ''
  }
}

async function readVersions(page: Page): Promise<AppVersions | null> {
  try {
    return await page.evaluate(async () => {
      const view = globalThis as RendererGlobal
      const getVersions = view.api?.getVersions
      if (!getVersions) return null
      return getVersions()
    })
  } catch (error) {
    if (!isEvaluationContextGone(error)) throw error
    return null
  }
}

function versionsExposed(versions: AppVersions | null): boolean {
  if (!versions) return false
  return [versions.app, versions.electron, versions.chrome, versions.node].every(
    (value) => value.length > 0,
  )
}

function isEvaluationContextGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Execution context was destroyed|frame was detached|Target closed/i.test(message)
}

function assignLocation(target: string): void {
  const view = globalThis as RendererGlobal
  view.location.assign(target)
}

function installMetaRefresh(target: string): void {
  const view = globalThis as RendererGlobal
  const meta = view.document.createElement('meta')
  meta.httpEquiv = 'refresh'
  meta.content = `0;url=${target}`
  view.document.head.append(meta)
}

function submitForm(target: string): void {
  const view = globalThis as RendererGlobal
  const form = view.document.createElement('form')
  form.method = 'GET'
  form.action = target
  view.document.body.append(form)
  form.submit()
}

function historyBack(): void {
  const view = globalThis as RendererGlobal
  view.history.back()
}

type RendererGlobal = typeof globalThis & {
  location: { assign(url: string): void }
  history: { back(): void }
  document: {
    createElement(tag: string): {
      httpEquiv: string
      content: string
      method: string
      action: string
      append(node: unknown): void
      submit(): void
    }
    head: { append(node: unknown): void }
    body: { append(node: unknown): void }
  }
  api?: { getVersions?: () => Promise<AppVersions> }
}
