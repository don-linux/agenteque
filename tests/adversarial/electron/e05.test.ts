// Helpers below stay nested: Playwright serializes only the function passed to
// `evaluate`, so moving them to module scope would break the renderer and main probes.
/* oxlint-disable unicorn/consistent-function-scoping */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import type { ConsoleMessage, Page } from 'playwright'
import { expect, it } from 'vitest'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

/**
 * Absence is the secure result, so the probes wait long enough for a guest
 * navigation or a webview attach to show up if the product allowed it.
 */
const SETTLE_MS = 3_000

const HOSTILE_DOCUMENT =
  '<!doctype html><html><head><title>hostile</title></head><body><p id="marker">HOSTILE_DOCUMENT</p></body></html>'

interface ViolationRecord {
  effectiveDirective: string
  violatedDirective: string
  blockedURI: string
  disposition: string
  originalPolicy: string
}

interface FrameRecord {
  id: string
  src: string | null
  href: string | null
  crossOrigin: boolean
  marker: string | null
  missing: boolean
}

interface IframeAttackInput {
  remote: string
  scheme: string
  html: string
  nested: string
  data: string
  settleMs: number
}

interface IframeAttackResult {
  policies: string[]
  violations: ViolationRecord[]
  srcdocText: string | null
  frames: FrameRecord[]
}

interface WebviewAttackInput {
  remote: string
  fileUrl: string
  preloadUrl: string
  settleMs: number
}

interface WebviewElementState {
  id: string
  inDocument: boolean
  attributeSrc: string | null
  preload: string | null
  nodeIntegration: string | null
  hasGetWebContentsId: boolean
  lifecycle: boolean
}

interface WebviewAttackResult {
  remote: WebviewElementState
  file: WebviewElementState
}

interface GuestSnapshot {
  id: number
  type: string
  url: string
}

interface AttachAttempt {
  src: string
  defaultPrevented: boolean
  defaultPreventedDuringListener: boolean
  nodeIntegration: boolean
  nodeIntegrationInSubFrames: boolean
  sandbox: boolean | null
  contextIsolation: boolean | null
  webSecurity: boolean | null
  preload: string | null
  attributePreload: string
  attributeNodeIntegration: string
  attributeDisableWebSecurity: string
  attributeWebPreferences: string
  attributeKeys: string[]
}

interface ProbeSnapshot {
  installed: boolean
  hostUrl: string
  hostId: number
  windowCount: number
  attempts: AttachAttempt[]
  attachCount: number
  created: GuestSnapshot[]
  attached: GuestSnapshot[]
  contents: GuestSnapshot[]
}

interface PageElement {
  id: string
  src: string
  srcdoc: string
  isConnected: boolean
  textContent: string | null
  contentWindow: { location: { href: string } } | null
  contentDocument: PageDocument | null
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
  addEventListener(type: string, listener: () => void): void
}

interface PageDocument {
  body: {
    appendChild(node: PageElement): void
    insertAdjacentHTML(position: string, html: string): void
  }
  addEventListener(
    type: string,
    listener: (event: ViolationRecord) => void,
    capture?: boolean,
  ): void
  createElement(tag: string): PageElement
  getElementById(id: string): PageElement | null
  querySelectorAll(selector: string): ArrayLike<{ getAttribute(name: string): string | null }>
}

async function openApp(): Promise<{ launched: LaunchedElectronApp; page: Page }> {
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('app did not open a window')
  await page.locator('h1').waitFor()
  return { launched, page }
}

function parseDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const tokens = part
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0)
    if (tokens.length === 0) continue
    const name = tokens[0]?.toLowerCase()
    if (!name || directives.has(name)) continue
    directives.set(name, tokens.slice(1))
  }
  return directives
}

/** CSP frame fallback: frame-src, then child-src, then default-src. */
function effectiveFrameSrc(
  policy: string,
): { from: 'frame-src' | 'child-src' | 'default-src'; sources: string[] } | null {
  const directives = parseDirectives(policy)
  if (directives.has('frame-src')) {
    return { from: 'frame-src', sources: directives.get('frame-src') ?? [] }
  }
  if (directives.has('child-src')) {
    return { from: 'child-src', sources: directives.get('child-src') ?? [] }
  }
  if (directives.has('default-src')) {
    return { from: 'default-src', sources: directives.get('default-src') ?? [] }
  }
  return null
}

function uriPathIs(blockedURI: string, origin: string, path: string): boolean {
  try {
    const url = new URL(blockedURI)
    return url.origin === origin && url.pathname === path
  } catch {
    return false
  }
}

function details(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function frameById(frames: FrameRecord[], id: string): FrameRecord {
  const frame = frames.find((item) => item.id === id)
  if (!frame) throw new Error(`missing iframe ${id}`)
  return frame
}

function isInheritedFrameViolation(
  violation: ViolationRecord,
  origin: string,
  path: string,
): boolean {
  const directive = violation.effectiveDirective
  return (
    uriPathIs(violation.blockedURI, origin, path) &&
    violation.disposition === 'enforce' &&
    (directive === 'frame-src' || directive === 'child-src' || directive === 'default-src') &&
    violation.originalPolicy.includes("default-src 'self'")
  )
}

function isDataFrameViolation(violation: ViolationRecord): boolean {
  const blocked = violation.blockedURI
  const directive = violation.effectiveDirective
  return (
    (blocked === 'data' || blocked.startsWith('data:')) &&
    violation.disposition === 'enforce' &&
    (directive === 'frame-src' || directive === 'child-src' || directive === 'default-src') &&
    violation.originalPolicy.includes("default-src 'self'")
  )
}

function expectFrameStayedBlank(frame: FrameRecord, evidence: string): void {
  expect(frame.missing, evidence).toBe(false)
  expect(frame.crossOrigin, evidence).toBe(false)
  expect(frame.href, evidence).toBe('about:blank')
  expect(frame.marker, evidence).toBeNull()
}

function isAttackContent(guest: GuestSnapshot, origin: string, token: string): boolean {
  return guest.type === 'webview' || guest.url.startsWith(origin) || guest.url.includes(token)
}

/**
 * Runs in the renderer. Must not close over the test module: Playwright sends
 * only this function's source.
 */
async function runIframeAttack(input: IframeAttackInput): Promise<IframeAttackResult> {
  const { document } = globalThis as unknown as { document: PageDocument }
  const violations: ViolationRecord[] = []

  function onViolation(event: ViolationRecord): void {
    violations.push({
      effectiveDirective: event.effectiveDirective,
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
      disposition: event.disposition,
      originalPolicy: event.originalPolicy,
    })
  }

  function readFrame(frame: PageElement | null, id: string): FrameRecord {
    if (!frame)
      return { id, src: null, href: null, crossOrigin: false, marker: null, missing: true }
    let href: string | null = null
    let crossOrigin = false
    let marker: string | null = null
    try {
      href = frame.contentWindow ? frame.contentWindow.location.href : null
    } catch {
      crossOrigin = true
    }
    if (!crossOrigin) {
      try {
        marker = frame.contentDocument?.getElementById('marker')?.textContent ?? null
      } catch {
        crossOrigin = true
      }
    }
    return { id, src: frame.getAttribute('src'), href, crossOrigin, marker, missing: false }
  }

  function addFrame(id: string, src: string): void {
    const frame = document.createElement('iframe')
    frame.id = id
    frame.src = src
    document.body.appendChild(frame)
  }

  if (!document.body) throw new Error('renderer document has no body')
  document.addEventListener('securitypolicyviolation', onViolation, true)

  const outer = document.createElement('iframe')
  outer.id = 'srcdoc-host'
  outer.srcdoc =
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src *"><p id="srcdoc-ok">srcdoc-ok</p>'
  document.body.appendChild(outer)

  const srcdocDeadline = Date.now() + 5_000
  while (Date.now() < srcdocDeadline) {
    if (outer.contentDocument?.getElementById('srcdoc-ok')) break
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })
  }

  const childDocument = outer.contentDocument
  const srcdocText = childDocument?.getElementById('srcdoc-ok')?.textContent?.trim() ?? null
  if (!childDocument?.body || srcdocText !== 'srcdoc-ok') {
    throw new Error('srcdoc iframe did not become readable')
  }
  childDocument.addEventListener('securitypolicyviolation', onViolation, true)
  const nested = childDocument.createElement('iframe')
  nested.id = 'nested-frame'
  nested.src = input.nested
  childDocument.body.appendChild(nested)

  addFrame('remote-frame', input.remote)
  addFrame('scheme-frame', input.scheme)
  addFrame('data-frame', input.data)
  document.body.insertAdjacentHTML(
    'beforeend',
    `<iframe id="html-frame" src="${input.html.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>`,
  )

  await new Promise<void>((resolve) => {
    setTimeout(resolve, input.settleMs)
  })

  const policies: string[] = []
  const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')
  for (let index = 0; index < metas.length; index += 1) {
    const content = metas[index]?.getAttribute('content')
    if (content) policies.push(content)
  }

  return {
    policies,
    violations,
    srcdocText,
    frames: [
      readFrame(document.getElementById('remote-frame'), 'remote-frame'),
      readFrame(document.getElementById('scheme-frame'), 'scheme-frame'),
      readFrame(document.getElementById('html-frame'), 'html-frame'),
      readFrame(document.getElementById('data-frame'), 'data-frame'),
      readFrame(childDocument.getElementById('nested-frame'), 'nested-frame'),
    ],
  }
}

/**
 * Runs in the renderer. Must not close over the test module.
 */
async function runWebviewAttack(input: WebviewAttackInput): Promise<WebviewAttackResult> {
  const { document } = globalThis as unknown as { document: PageDocument }
  if (!document.body) throw new Error('renderer document has no body')

  function arm(id: string, src: string): { element: PageElement; lifecycle: { fired: boolean } } {
    const element = document.createElement('webview')
    element.id = id
    element.setAttribute('src', src)
    element.setAttribute('preload', input.preloadUrl)
    element.setAttribute('nodeintegration', 'true')
    element.setAttribute('nodeintegrationinsubframes', 'true')
    element.setAttribute('disablewebsecurity', 'true')
    element.setAttribute('allowpopups', '')
    element.setAttribute(
      'webpreferences',
      'nodeIntegration=yes,contextIsolation=no,sandbox=no,webSecurity=no',
    )
    element.setAttribute('style', 'width:240px;height:160px')
    const lifecycle = { fired: false }
    const events = [
      'dom-ready',
      'did-attach',
      'did-finish-load',
      'did-fail-load',
      'did-start-loading',
      'console-message',
      'new-window',
    ]
    for (const eventName of events) {
      element.addEventListener(eventName, () => {
        lifecycle.fired = true
      })
    }
    document.body.appendChild(element)
    return { element, lifecycle }
  }

  const remote = arm('remote-webview', input.remote)
  const file = arm('file-webview', input.fileUrl)
  await new Promise<void>((resolve) => {
    setTimeout(resolve, input.settleMs)
  })

  function describe(element: PageElement, lifecycle: boolean): WebviewElementState {
    const withGuest = element as PageElement & { getWebContentsId?: unknown }
    return {
      id: element.id,
      inDocument: element.isConnected,
      attributeSrc: element.getAttribute('src'),
      preload: element.getAttribute('preload'),
      nodeIntegration: element.getAttribute('nodeintegration'),
      hasGetWebContentsId: typeof withGuest.getWebContentsId === 'function',
      lifecycle,
    }
  }

  return {
    remote: describe(remote.element, remote.lifecycle.fired),
    file: describe(file.element, file.lifecycle.fired),
  }
}

/**
 * Runs in the Electron main process. The probe key is a literal so it matches
 * `readWebviewProbe` after Playwright serializes each function on its own.
 */
function installWebviewProbe(electron: typeof import('electron')): {
  hostUrl: string
  hostId: number
} {
  const windows = electron.BrowserWindow.getAllWindows()
  const hostWindow =
    windows.find((win) => win.webContents.getURL().includes('index.html')) ?? windows[0]
  if (!hostWindow) throw new Error('no browser window')
  const host = hostWindow.webContents

  function snapshot(contents: import('electron').WebContents): GuestSnapshot {
    try {
      if (contents.isDestroyed()) return { id: -1, type: 'destroyed', url: '' }
      return { id: contents.id, type: contents.getType(), url: contents.getURL() }
    } catch {
      return { id: -1, type: 'unavailable', url: '' }
    }
  }

  const state: {
    hostUrl: string
    hostId: number
    attempts: AttachAttempt[]
    attachCount: number
    created: GuestSnapshot[]
    attached: GuestSnapshot[]
  } = {
    hostUrl: host.getURL(),
    hostId: host.id,
    attempts: [],
    attachCount: 0,
    created: [],
    attached: [],
  }
  ;(globalThis as { agentequeAdvE05?: typeof state }).agentequeAdvE05 = state

  host.on('will-attach-webview', (event, webPreferences, params) => {
    const attempt: AttachAttempt = {
      src: params.src ?? '',
      defaultPrevented: false,
      defaultPreventedDuringListener: event.defaultPrevented,
      nodeIntegration: webPreferences.nodeIntegration === true,
      nodeIntegrationInSubFrames: webPreferences.nodeIntegrationInSubFrames === true,
      sandbox: typeof webPreferences.sandbox === 'boolean' ? webPreferences.sandbox : null,
      contextIsolation:
        typeof webPreferences.contextIsolation === 'boolean'
          ? webPreferences.contextIsolation
          : null,
      webSecurity:
        typeof webPreferences.webSecurity === 'boolean' ? webPreferences.webSecurity : null,
      preload: typeof webPreferences.preload === 'string' ? webPreferences.preload : null,
      attributePreload: params.preload ?? '',
      attributeNodeIntegration: params.nodeintegration ?? '',
      attributeDisableWebSecurity: params.disablewebsecurity ?? '',
      attributeWebPreferences: params.webpreferences ?? '',
      attributeKeys: Object.keys(params),
    }
    queueMicrotask(() => {
      attempt.defaultPrevented = event.defaultPrevented
      state.attempts.push(attempt)
    })
  })
  host.on('did-attach-webview', (_event, guest) => {
    state.attachCount += 1
    state.attached.push(snapshot(guest))
  })
  electron.app.on('web-contents-created', (_event, contents) => {
    state.created.push(snapshot(contents))
  })

  return { hostUrl: state.hostUrl, hostId: state.hostId }
}

/** Runs in the Electron main process. */
function readWebviewProbe(electron: typeof import('electron')): ProbeSnapshot {
  const state = (
    globalThis as {
      agentequeAdvE05?: {
        hostUrl: string
        hostId: number
        attempts: AttachAttempt[]
        attachCount: number
        created: GuestSnapshot[]
        attached: GuestSnapshot[]
      }
    }
  ).agentequeAdvE05
  if (!state) {
    return {
      installed: false,
      hostUrl: '',
      hostId: -1,
      windowCount: 0,
      attempts: [],
      attachCount: 0,
      created: [],
      attached: [],
      contents: [],
    }
  }

  function snapshot(contents: import('electron').WebContents): GuestSnapshot {
    try {
      if (contents.isDestroyed()) return { id: -1, type: 'destroyed', url: '' }
      return { id: contents.id, type: contents.getType(), url: contents.getURL() }
    } catch {
      return { id: -1, type: 'unavailable', url: '' }
    }
  }

  return {
    installed: true,
    hostUrl: state.hostUrl,
    hostId: state.hostId,
    windowCount: electron.BrowserWindow.getAllWindows().length,
    attempts: state.attempts,
    attachCount: state.attachCount,
    created: state.created,
    attached: state.attached,
    contents: electron.webContents.getAllWebContents().map((contents) => snapshot(contents)),
  }
}

it('blocks remote iframes when frame-src is inherited from default-src', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: HOSTILE_DOCUMENT,
  }))
  try {
    const { launched, page } = await openApp()
    try {
      expect(await page.locator('h1').textContent()).toBe('agenteque')
      const remote = `${server.origin}/iframe`
      const scheme = `${server.origin.replace(/^http:\/\//, 'HTTP://')}/iframe-scheme`
      const html = `${server.origin}/iframe-html`
      const nested = `${server.origin}/iframe-nested`
      const data = `data:text/html,${encodeURIComponent('<p id="marker">DATA_FRAME</p>')}`
      const consoleText: string[] = []
      const pageErrors: string[] = []
      const onConsole = (message: ConsoleMessage): void => {
        consoleText.push(message.text())
      }
      const onPageError = (error: Error): void => {
        pageErrors.push(error.message)
      }
      page.on('console', onConsole)
      page.on('pageerror', onPageError)
      let attack: IframeAttackResult
      try {
        attack = await page.evaluate(runIframeAttack, {
          remote,
          scheme,
          html,
          nested,
          data,
          settleMs: SETTLE_MS,
        })
      } finally {
        page.off('console', onConsole)
        page.off('pageerror', onPageError)
      }
      await delay(200)

      const evidence = details({
        policies: attack.policies,
        violations: attack.violations,
        frames: attack.frames,
        srcdocText: attack.srcdocText,
        requests: server.requests.map((request) => request.url),
        consoleText: consoleText.slice(0, 40),
        pageErrors,
      })
      expect(attack.policies, evidence).toHaveLength(1)
      expect(effectiveFrameSrc(attack.policies[0] ?? ''), evidence).toEqual({
        from: 'default-src',
        sources: ["'self'"],
      })
      expect(attack.srcdocText, evidence).toBe('srcdoc-ok')

      const cases = [
        { id: 'remote-frame', path: '/iframe', src: remote },
        { id: 'scheme-frame', path: '/iframe-scheme', src: scheme },
        { id: 'html-frame', path: '/iframe-html', src: html },
        { id: 'nested-frame', path: '/iframe-nested', src: nested },
      ]
      for (const item of cases) {
        const frame = frameById(attack.frames, item.id)
        expect(frame.src?.toLowerCase(), evidence).toBe(item.src.toLowerCase())
        expectFrameStayedBlank(frame, evidence)
        expect(
          attack.violations.some((violation) =>
            isInheritedFrameViolation(violation, server.origin, item.path),
          ),
          evidence,
        ).toBe(true)
      }

      const dataFrame = frameById(attack.frames, 'data-frame')
      expect(dataFrame.src, evidence).toBe(data)
      expectFrameStayedBlank(dataFrame, evidence)
      expect(
        attack.violations.some((violation) => isDataFrameViolation(violation)),
        evidence,
      ).toBe(true)
      expect(
        server.requests.map((request) => request.url),
        evidence,
      ).toEqual([])
    } finally {
      await launched.close()
    }
  } finally {
    await server.close()
  }
})

it('does not attach a remote webview or grant will-attach-webview node integration', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: HOSTILE_DOCUMENT,
  }))
  const directory = await mkdtemp(join(tmpdir(), 'agenteque-e05-'))
  try {
    const markerPath = join(directory, 'marker.txt')
    const preloadPath = join(directory, 'preload.js')
    await writeFile(markerPath, 'E05_LOCAL_MARKER\n')
    await writeFile(preloadPath, '/* e05 preload stays inert */\n')
    const fileUrl = pathToFileURL(markerPath).href
    const preloadUrl = pathToFileURL(preloadPath).href
    const remote = `${server.origin}/webview`

    const { launched, page } = await openApp()
    try {
      expect(await page.locator('h1').textContent()).toBe('agenteque')
      const installed = await launched.app.evaluate(installWebviewProbe)
      const baseline = await launched.app.evaluate(readWebviewProbe)
      expect(baseline.installed).toBe(true)
      expect(baseline.hostId).toBe(installed.hostId)
      expect(baseline.attempts).toEqual([])
      expect(baseline.attachCount).toBe(0)

      const attack = await page.evaluate(runWebviewAttack, {
        remote,
        fileUrl,
        preloadUrl,
        settleMs: SETTLE_MS,
      })
      await delay(200)
      const probe = await launched.app.evaluate(readWebviewProbe)
      const evidence = details({
        installed,
        baseline: {
          windowCount: baseline.windowCount,
          contents: baseline.contents,
          created: baseline.created,
        },
        attack,
        probe,
        requests: server.requests.map((request) => request.url),
      })

      expect(attack.remote.inDocument, evidence).toBe(true)
      expect(attack.file.inDocument, evidence).toBe(true)
      expect(attack.remote.attributeSrc, evidence).toBe(remote)
      expect(attack.file.attributeSrc, evidence).toBe(fileUrl)
      expect(attack.remote.preload, evidence).toBe(preloadUrl)
      expect(attack.file.preload, evidence).toBe(preloadUrl)
      expect(attack.remote.nodeIntegration, evidence).toBe('true')
      expect(attack.file.nodeIntegration, evidence).toBe('true')
      expect(attack.remote.lifecycle, evidence).toBe(false)
      expect(attack.file.lifecycle, evidence).toBe(false)
      expect(probe.installed, evidence).toBe(true)
      expect(probe.attachCount, evidence).toBe(0)
      expect(
        probe.attempts.filter((attempt) => !attempt.defaultPrevented),
        evidence,
      ).toEqual([])
      expect(probe.windowCount, evidence).toBe(baseline.windowCount)
      expect(
        [...probe.contents, ...probe.created, ...probe.attached].filter((guest) =>
          isAttackContent(guest, server.origin, 'agenteque-e05-'),
        ),
        evidence,
      ).toEqual([])
      expect(
        server.requests.map((request) => request.url),
        evidence,
      ).toEqual([])

      const tagEnabled = attack.remote.hasGetWebContentsId || attack.file.hasGetWebContentsId
      if (tagEnabled && probe.attempts.length === 0 && probe.attachCount === 0) {
        throw new Error(`webview tag is enabled but will-attach-webview did not fire\n${evidence}`)
      }
    } finally {
      await launched.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
    await server.close()
  }
})
