/**
 * ADV-E14. The packaged binary must ignore attacker CLI switches:
 * `--remote-debugging-port`, `--inspect`, `--js-flags`, and `--disable-web-security`.
 *
 * Playwright always prepends `--inspect=0` and `--remote-debugging-port=0`, then
 * `launchPackagedApp` args. The loader is not injected for the packaged binary, so
 * those harness flags stay on `process.argv` and the debug ports stay open. They
 * are not the finding: a process that opens neither port never finishes launch.
 * Attacker values are passed through `args`, so they sit after Playwright's and
 * win if the binary honors the switch.
 */
import { createConnection, createServer } from 'node:net'
import type { ElectronApplication } from 'playwright'
import { expect, it } from 'vitest'
import {
  launchPackagedApp,
  startHostileServer,
  type LaunchedElectronApp,
} from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E14 = { id: 'ADV-E14' } as const
const SECRET = 'cross-origin-secret'
const NATIVES_PROBE = '%IsSmi(1)'

interface PortProbe {
  open: boolean
  detail: string
}

interface NativesProbe {
  main: boolean
  renderer: boolean
}

interface CrossOriginProbe {
  webSecurity: boolean
  ok: boolean
  body: string
}

it('keeps web security on and hostile V8 flags off without attacker switches', async () => {
  const { pageUrl, targetUrl } = await crossOriginServers()
  const launched = await launchPackagedApp()
  try {
    await ready(launched)
    expect(await nativesProbe(launched.app)).toEqual({ main: false, renderer: false })
    expect(await crossOriginSummary(launched.app, pageUrl, targetUrl)).toEqual({
      webSecurity: true,
      ok: false,
      leaked: false,
    })
  } finally {
    await launched.close()
  }
})

it(
  'ADV-E14 packaged app does not open an attacker --remote-debugging-port',
  { meta: ADV_E14 },
  async () => {
    const port = await reserveLoopbackPort()
    const launched = await launchPackagedApp({
      args: [`--remote-debugging-port=${port}`],
    })
    try {
      await ready(launched)
      const effectivePort = await launched.app.evaluate(({ app }) => {
        return app.commandLine.getSwitchValue('remote-debugging-port')
      })
      const probe = await probeLoopbackPort(port)
      expect({
        honorsAttackerPort: effectivePort === String(port),
        attackerPortOpen: probe.open,
        detail: probe.open ? probe.detail : 'closed',
      }).toEqual({
        honorsAttackerPort: false,
        attackerPortOpen: false,
        detail: 'closed',
      })
    } finally {
      await launched.close()
    }
  },
)

it('ADV-E14 packaged app does not open an attacker --inspect port', { meta: ADV_E14 }, async () => {
  const port = await reserveLoopbackPort()
  const launched = await launchPackagedApp({ args: [`--inspect=${port}`] })
  try {
    await ready(launched)
    const debugPort = await launched.app.evaluate(() => process.debugPort)
    const probe = await probeLoopbackPort(port)
    expect({
      honorsAttackerPort: debugPort === port,
      attackerPortOpen: probe.open,
      detail: probe.open ? probe.detail : 'closed',
    }).toEqual({
      honorsAttackerPort: false,
      attackerPortOpen: false,
      detail: 'closed',
    })
  } finally {
    await launched.close()
  }
})

it('ADV-E14 packaged app does not apply hostile --js-flags', { meta: ADV_E14 }, async () => {
  const launched = await launchPackagedApp({
    args: ['--js-flags=--allow-natives-syntax'],
  })
  try {
    await ready(launched)
    expect(await nativesProbe(launched.app)).toEqual({ main: false, renderer: false })
  } finally {
    await launched.close()
  }
})

it(
  'ADV-E14 packaged app keeps web security with --disable-web-security',
  { meta: ADV_E14 },
  async () => {
    const { pageUrl, targetUrl } = await crossOriginServers()
    const launched = await launchPackagedApp({ args: ['--disable-web-security'] })
    try {
      await ready(launched)
      expect(await crossOriginSummary(launched.app, pageUrl, targetUrl)).toEqual({
        webSecurity: true,
        ok: false,
        leaked: false,
      })
    } finally {
      await launched.close()
    }
  },
)

async function ready(launched: LaunchedElectronApp): Promise<void> {
  const window = launched.window
  if (!window) throw new Error('packaged app did not open a window')
  await window.locator('h1').waitFor()
  expect(await window.locator('h1').textContent()).toBe('agenteque')
}

/**
 * `%IsSmi` is a syntax error unless `--allow-natives-syntax` was applied.
 * The packaged page CSP blocks `new Function`, so the renderer probe goes
 * through `executeJavaScript` (CDP), which is not subject to that CSP.
 * The string is quoted so this file does not parse the `%` token.
 */
async function nativesProbe(app: ElectronApplication): Promise<NativesProbe> {
  return app.evaluate(async ({ BrowserWindow }, expression: string) => {
    let main = false
    try {
      main = new Function(`return ${expression};`)() === true
    } catch {
      main = false
    }
    const win = BrowserWindow.getAllWindows()[0]
    let renderer = false
    if (win) {
      try {
        renderer = (await win.webContents.executeJavaScript(expression, true)) === true
      } catch {
        renderer = false
      }
    }
    return { main, renderer }
  }, NATIVES_PROBE)
}

/**
 * The shipped page CSP (`default-src 'self'`) blocks `fetch` even after SOP is
 * disabled, so the oracle loads a CSP-free origin in another window of the
 * same process and fetches a second origin that sends no CORS headers.
 */
async function crossOriginSummary(
  app: ElectronApplication,
  pageUrl: string,
  targetUrl: string,
): Promise<{ webSecurity: boolean; ok: boolean; leaked: boolean }> {
  const direct = await fetch(targetUrl)
  expect(direct.status).toBe(200)
  expect(await direct.text()).toBe(SECRET)
  const probe = await readCrossOrigin(app, pageUrl, targetUrl)
  return {
    webSecurity: probe.webSecurity,
    ok: probe.ok,
    leaked: probe.body.includes(SECRET),
  }
}

async function readCrossOrigin(
  app: ElectronApplication,
  pageUrl: string,
  targetUrl: string,
): Promise<CrossOriginProbe> {
  return app.evaluate(
    async ({ BrowserWindow }, urls: { pageUrl: string; targetUrl: string }) => {
      const appWindow = BrowserWindow.getAllWindows()[0]
      // Present at runtime in Electron 44; omitted from the published WebContents types.
      const contents = appWindow?.webContents as unknown as {
        getLastWebPreferences(): { webSecurity?: boolean }
      }
      const webSecurity = contents?.getLastWebPreferences().webSecurity === true
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      })
      try {
        await win.loadURL(urls.pageUrl)
        const script = `fetch(${JSON.stringify(urls.targetUrl)}).then(async (response) => ({ ok: true, body: await response.text() })).catch((error) => ({ ok: false, body: String(error && error.name) + ':' + String(error && error.message) }))`
        const result = (await win.webContents.executeJavaScript(script, true)) as {
          ok: boolean
          body: string
        }
        return { webSecurity, ok: result.ok, body: result.body }
      } finally {
        if (!win.isDestroyed()) win.destroy()
      }
    },
    { pageUrl, targetUrl },
  )
}

async function crossOriginServers(): Promise<{ pageUrl: string; targetUrl: string }> {
  const target = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: SECRET,
  }))
  const page = await startHostileServer()
  return { pageUrl: `${page.origin}/`, targetUrl: `${target.origin}/secret` }
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('failed to reserve a loopback port'))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

async function probeLoopbackPort(port: number): Promise<PortProbe> {
  const open = await loopbackPortOpen(port)
  if (!open) return { open: false, detail: 'closed' }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    })
    const text = (await response.text()).slice(0, 240)
    return { open: true, detail: `http ${response.status} ${text}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { open: true, detail: message }
  }
}

function loopbackPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (open: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(1_000, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}
