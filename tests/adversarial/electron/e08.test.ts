import type { ElectronApplication, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

/**
 * E08: an iframe must not receive the preload bridge as its own `window.api`.
 * When CSP refuses the navigation, the secure outcome is an enforced frame-src
 * violation, inspected from the frame with webFrameMain rather than skipped.
 */

const SETTLE_MS = 20_000
const REQUEST_GRACE_MS = 300

const SRCDOC_HTML = [
  '<!doctype html><html><head><title>e08-srcdoc</title></head><body>',
  '<script>document.documentElement.dataset.e08Seen=String(typeof window.api)</script>',
  '</body></html>',
].join('')

const BLOB_HTML = '<!doctype html><title>e08-blob</title><p>blob</p>'

const FRAME_PROBE = [
  '(() => {',
  '  let own = false',
  '  try { own = Object.prototype.hasOwnProperty.call(window, "api") } catch { own = true }',
  '  let inWindow = false',
  '  try { inWindow = "api" in window } catch { inWindow = true }',
  '  let onProto = false',
  '  try {',
  '    let proto = Object.getPrototypeOf(window)',
  '    let depth = 0',
  '    while (proto && depth < 10) {',
  '      if (Object.prototype.hasOwnProperty.call(proto, "api")) { onProto = true; break }',
  '      proto = Object.getPrototypeOf(proto)',
  '      depth += 1',
  '    }',
  '  } catch { onProto = true }',
  '  let type = "undefined"',
  '  let callable = false',
  '  try {',
  '    const value = window.api',
  '    type = typeof value',
  '    if (type === "function") callable = true',
  '    else if (value !== null && type === "object") {',
  '      const versions = typeof value.getVersions === "function"',
  '      const notify = typeof value.notifyRendererReady === "function"',
  '      callable = versions || notify',
  '    }',
  '  } catch { type = "thrown"; callable = true }',
  '  let seen = null',
  '  try {',
  '    const element = document.documentElement',
  '    const value = element && element.dataset ? element.dataset.e08Seen : null',
  '    seen = value == null || value === "" ? null : String(value)',
  '  } catch { seen = "thrown" }',
  '  let parentApi = "missing"',
  '  try {',
  '    if (!window.parent || window.parent === window) parentApi = "no-parent"',
  '    else {',
  '      const parentValue = window.parent.api',
  '      parentApi = typeof parentValue',
  '      const callableParent = parentValue !== null && typeof parentValue === "object"',
  '      if (callableParent && typeof parentValue.getVersions === "function") parentApi = "callable"',
  '    }',
  '  } catch { parentApi = "thrown" }',
  '  return { href: location.href, origin: location.origin, own, inWindow, onProto, type, callable, seen, parentApi }',
  '})()',
].join('\n')

interface ApiProbe {
  href: string
  origin: string
  own: boolean
  inWindow: boolean
  onProto: boolean
  type: string
  callable: boolean
  seen: string | null
  parentApi: string
}

interface CspViolation {
  effectiveDirective: string
  violatedDirective: string
  blockedURI: string
  disposition: string
}

interface RawFrame {
  name: string
  url: string
  origin: string
  probe: unknown
  probeError: string | null
}

interface FrameView {
  name: string
  url: string
  origin: string
  probe?: ApiProbe
  probeError?: string
}

interface Observation {
  frames: FrameView[]
  violations: CspViolation[]
}

interface MountRequest {
  name: string
  kind: 'srcdoc' | 'blob' | 'file' | 'cross'
  html: string
  src: string
}

interface PageWorld {
  document: {
    createElement(tag: 'iframe'): { name: string; src: string; srcdoc: string }
    body: { appendChild(node: unknown): void }
  }
  location: { href: string }
  Blob: new (parts: string[], options: { type: string }) => Blob
  URL: { createObjectURL(blob: Blob): string }
  addEventListener(type: 'securitypolicyviolation', listener: (event: CspViolation) => void): void
  e08Violations?: CspViolation[]
}

let launched: LaunchedElectronApp | undefined

describe('E08 iframe window.api', () => {
  beforeAll(async () => {
    launched = await launchApp()
    const { page } = session()
    await page.locator('h1').waitFor()
    await installViolationListener(page)
  })

  afterAll(async () => {
    await launched?.close()
  })

  it('exposes window.api on the main frame', async () => {
    const { app } = session()
    const versions: unknown = await executeInMain(app, 'window.api.getVersions()')
    expect(versions).toEqual({
      app: expect.any(String),
      electron: expect.any(String),
      chrome: expect.any(String),
      node: expect.any(String),
    })

    const surface: unknown = await executeInMain(
      app,
      '({ getVersions: typeof window.api.getVersions, notifyRendererReady: typeof window.api.notifyRendererReady })',
    )
    expect(surface).toEqual({ getVersions: 'function', notifyRendererReady: 'function' })

    const probe = asProbe(await executeInMain(app, FRAME_PROBE))
    expect(probe).toMatchObject({ own: true, inWindow: true, type: 'object', callable: true })
  })

  it('does not give a srcdoc iframe its own window.api', async () => {
    await mountFrame({ name: 'e08-srcdoc', kind: 'srcdoc', html: SRCDOC_HTML, src: '' })
    const observation = await until(
      observe,
      (current) => frameByName(current.frames, 'e08-srcdoc')?.probe?.href === 'about:srcdoc',
      SETTLE_MS,
    )
    const frame = requireProbe(observation, 'e08-srcdoc')
    expect(frame.url).toBe('about:srcdoc')
    // Browser-side origin follows the file parent. location.origin in the srcdoc is opaque.
    expect(frame.origin).toBe('file://')
    expect(frame.probe.href).toBe('about:srcdoc')
    expect(frame.probe.origin).toBe('null')
    // script-src 'self' blocks the srcdoc inline script, so the marker stays unset.
    expect(frame.probe.seen).toBeNull()
    assertNoOwnApi(frame.probe)
  })

  it('does not give a same-origin file iframe its own window.api', async () => {
    const parentUrl = session().page.url()
    await mountFrame({ name: 'e08-file', kind: 'file', html: '', src: '' })
    const observation = await until(
      observe,
      (current) => {
        const probe = frameByName(current.frames, 'e08-file')?.probe
        return probe !== undefined && sameUrl(probe.href, parentUrl)
      },
      SETTLE_MS,
    )
    const frame = requireProbe(observation, 'e08-file')
    expect(sameUrl(frame.url, parentUrl)).toBe(true)
    expect(sameUrl(frame.probe.href, parentUrl)).toBe(true)
    expect(frame.probe.origin).toBe('file://')
    assertNoOwnApi(frame.probe)
  })

  it('blocks a blob iframe with frame-src and does not expose window.api', async () => {
    await mountFrame({ name: 'e08-blob', kind: 'blob', html: BLOB_HTML, src: '' })
    const observation = await until(
      observe,
      (current) => {
        const href = frameByName(current.frames, 'e08-blob')?.probe?.href ?? ''
        const blocked = current.violations.some(
          (violation) =>
            violation.effectiveDirective === 'frame-src' && isBlobBlocked(violation.blockedURI),
        )
        return (blocked && href.startsWith('chrome-error:')) || href.startsWith('blob:')
      },
      SETTLE_MS,
    )
    const frame = requireProbe(observation, 'e08-blob')
    const violation = observation.violations.find(
      (item) => item.effectiveDirective === 'frame-src' && isBlobBlocked(item.blockedURI),
    )
    expect(violation, JSON.stringify(observation.violations)).toMatchObject({
      effectiveDirective: 'frame-src',
      disposition: 'enforce',
    })
    expect(violation?.blockedURI).toBe('blob')
    expect(frame.url.startsWith('blob:')).toBe(true)
    expect(frame.probe.href).toBe('chrome-error://chromewebdata/')
    expect(frame.probe.parentApi).toBe('thrown')
    assertNoOwnApi(frame.probe)
  })

  it('blocks a cross-origin iframe with frame-src and does not expose window.api', async () => {
    const server = await startHostileServer(() => ({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><title>e08-hostile</title><p>hostile</p>',
    }))
    await mountFrame({
      name: 'e08-cross',
      kind: 'cross',
      html: '',
      src: `${server.origin}/e08.html`,
    })
    const observation = await until(
      observe,
      (current) => {
        const href = frameByName(current.frames, 'e08-cross')?.probe?.href ?? ''
        const blocked = current.violations.some(
          (violation) =>
            violation.effectiveDirective === 'frame-src' &&
            blocksOrigin(violation.blockedURI, server.origin),
        )
        return (blocked && href.startsWith('chrome-error:')) || href.startsWith(server.origin)
      },
      SETTLE_MS,
    )
    const frame = requireProbe(observation, 'e08-cross')
    const violation = observation.violations.find(
      (item) =>
        item.effectiveDirective === 'frame-src' && blocksOrigin(item.blockedURI, server.origin),
    )
    expect(violation, JSON.stringify(observation.violations)).toMatchObject({
      effectiveDirective: 'frame-src',
      disposition: 'enforce',
    })
    expect(violation?.blockedURI).toBe(`${server.origin}/`)
    expect(frame.url).toBe(`${server.origin}/e08.html`)
    expect(frame.origin).toBe('null')
    expect(frame.probe.href).toBe('chrome-error://chromewebdata/')
    expect(frame.probe.origin).toBe('null')
    expect(frame.probe.parentApi).toBe('thrown')
    assertNoOwnApi(frame.probe)
    await delay(REQUEST_GRACE_MS)
    expect(server.requests.filter((request) => request.url.includes('e08'))).toEqual([])
  })
})

function session(): { app: ElectronApplication; page: Page } {
  if (!launched?.window) throw new Error('built app did not open a window')
  return { app: launched.app, page: launched.window }
}

function assertNoOwnApi(probe: ApiProbe): void {
  expect(probe).toMatchObject({
    own: false,
    inWindow: false,
    onProto: false,
    type: 'undefined',
    callable: false,
  })
}

function requireProbe(observation: Observation, name: string): FrameView & { probe: ApiProbe } {
  const frame = frameByName(observation.frames, name)
  if (!frame?.probe) throw new Error(`missing ${name}: ${JSON.stringify(observation)}`)
  return { ...frame, probe: frame.probe }
}

function frameByName(frames: FrameView[], name: string): FrameView | undefined {
  return frames.find((frame) => frame.name === name)
}

function isBlobBlocked(blockedURI: string): boolean {
  return blockedURI === 'blob' || blockedURI.startsWith('blob:')
}

function blocksOrigin(blockedURI: string, origin: string): boolean {
  return blockedURI === origin || blockedURI.startsWith(`${origin}/`)
}

function sameUrl(left: string, right: string): boolean {
  try {
    return new URL(left).href === new URL(right).href
  } catch {
    return left === right
  }
}

function asProbe(value: unknown): ApiProbe {
  if (!isApiProbe(value)) throw new Error(`unexpected probe ${JSON.stringify(value)}`)
  return value
}

function isApiProbe(value: unknown): value is ApiProbe {
  if (value === null || typeof value !== 'object') return false
  const probe = value as Record<string, unknown>
  return (
    typeof probe.href === 'string' &&
    typeof probe.origin === 'string' &&
    typeof probe.own === 'boolean' &&
    typeof probe.inWindow === 'boolean' &&
    typeof probe.onProto === 'boolean' &&
    typeof probe.type === 'string' &&
    typeof probe.callable === 'boolean' &&
    (probe.seen === null || typeof probe.seen === 'string') &&
    typeof probe.parentApi === 'string'
  )
}

function isCspViolation(value: unknown): value is CspViolation {
  if (value === null || typeof value !== 'object') return false
  const violation = value as Record<string, unknown>
  return (
    typeof violation.effectiveDirective === 'string' &&
    typeof violation.violatedDirective === 'string' &&
    typeof violation.blockedURI === 'string' &&
    typeof violation.disposition === 'string'
  )
}

function parseFrame(raw: RawFrame): FrameView {
  if (raw.probeError) {
    return { name: raw.name, url: raw.url, origin: raw.origin, probeError: raw.probeError }
  }
  if (!isApiProbe(raw.probe)) {
    return {
      name: raw.name,
      url: raw.url,
      origin: raw.origin,
      probeError: `unexpected probe ${JSON.stringify(raw.probe)}`,
    }
  }
  return { name: raw.name, url: raw.url, origin: raw.origin, probe: raw.probe }
}

async function observe(): Promise<Observation> {
  const { app, page } = session()
  const [rawFrames, violations] = await Promise.all([
    readChildFrames(app, FRAME_PROBE),
    readViolations(page),
  ])
  return { frames: rawFrames.map(parseFrame), violations }
}

async function until(
  read: () => Promise<Observation>,
  ready: (observation: Observation) => boolean,
  timeoutMs: number,
): Promise<Observation> {
  const deadline = Date.now() + timeoutMs
  let last: Observation | undefined
  while (Date.now() < deadline) {
    last = await read()
    if (ready(last)) return last
    await delay(50)
  }
  throw new Error(`frame did not settle: ${JSON.stringify(last)}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function executeInMain(app: ElectronApplication, source: string): Promise<unknown> {
  return app.evaluate(async ({ webContents }, code: string) => {
    const contents = webContents
      .getAllWebContents()
      .filter((item) => item.getType() === 'window')
      .find((item) => item.mainFrame.url.startsWith('file:'))
    if (!contents) throw new Error('no window webContents')
    return contents.mainFrame.executeJavaScript(code)
  }, source)
}

async function readChildFrames(app: ElectronApplication, source: string): Promise<RawFrame[]> {
  return app.evaluate(async ({ webContents }, code: string) => {
    const contents = webContents
      .getAllWebContents()
      .filter((item) => item.getType() === 'window')
      .find((item) => item.mainFrame.url.startsWith('file:'))
    if (!contents) throw new Error('no window webContents')
    const snapshots: RawFrame[] = []
    for (const frame of contents.mainFrame.framesInSubtree) {
      if (frame.isDestroyed() || frame.parent === null) continue
      if (frame.detached) {
        snapshots.push({
          name: frame.name,
          url: frame.url,
          origin: frame.origin,
          probe: null,
          probeError: 'detached',
        })
        continue
      }
      try {
        const probe: unknown = await frame.executeJavaScript(code)
        snapshots.push({
          name: frame.name,
          url: frame.url,
          origin: frame.origin,
          probe,
          probeError: null,
        })
      } catch (error) {
        snapshots.push({
          name: frame.name,
          url: frame.url,
          origin: frame.origin,
          probe: null,
          probeError: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return snapshots
  }, source)
}

async function installViolationListener(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = globalThis as unknown as PageWorld
    if (world.e08Violations) return
    const violations: CspViolation[] = []
    world.e08Violations = violations
    world.addEventListener('securitypolicyviolation', (event) => {
      violations.push({
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition,
      })
    })
  })
}

async function readViolations(page: Page): Promise<CspViolation[]> {
  const value: unknown = await page.evaluate(() => {
    const world = globalThis as unknown as { e08Violations?: unknown }
    return world.e08Violations ?? []
  })
  if (!Array.isArray(value)) throw new Error('CSP violation log is missing')
  return value.map((item) => {
    if (!isCspViolation(item)) throw new Error(`unexpected violation ${JSON.stringify(item)}`)
    return item
  })
}

async function mountFrame(request: MountRequest): Promise<void> {
  await session().page.evaluate((input: MountRequest) => {
    const world = globalThis as unknown as PageWorld
    const iframe = world.document.createElement('iframe')
    iframe.name = input.name
    if (input.kind === 'srcdoc') iframe.srcdoc = input.html
    else if (input.kind === 'blob') {
      iframe.src = world.URL.createObjectURL(new world.Blob([input.html], { type: 'text/html' }))
    } else if (input.kind === 'file') iframe.src = world.location.href
    else iframe.src = input.src
    world.document.body.appendChild(iframe)
  }, request)
}
