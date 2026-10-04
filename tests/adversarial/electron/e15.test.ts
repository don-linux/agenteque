/**
 * ADV-E15. `--smoke-test` must exit 1 on a renderer crash, a renderer console
 * error, did-fail-load, or the ready timeout. Failure is triggered from outside
 * the app: a hostile document, a page evaluate, or a withheld renderer-ready.
 */
import { createServer, type AddressInfo } from 'node:net'
import { expect, it } from 'vitest'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

const FAST_EXIT_MS = 15_000
/** After the trigger lands. Longer than the smoke ready deadline so the log can be read. */
const AFTER_TRIGGER_MS = 25_000
const TIMEOUT_EXIT_MS = 35_000

async function launchSmoke(
  env?: Record<string, string>,
): Promise<{ launched: LaunchedElectronApp; started: number }> {
  const started = Date.now()
  const launched = await launchApp({
    args: ['--smoke-test'],
    waitForWindow: false,
    env,
  })
  return { launched, started }
}

async function smokeExit(
  launched: LaunchedElectronApp,
  budgetMs: number,
  trigger?: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const triggerLine = trigger === undefined ? '' : `\ntrigger=${trigger}`
  try {
    const code = await Promise.race([
      launched.exited,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `smoke process still running after ${budgetMs}ms${triggerLine}\n--- stdout ---\n${launched.stdout}\n--- stderr ---\n${launched.stderr}`,
            ),
          )
        }, budgetMs)
      }),
    ])
    return { code, stdout: launched.stdout, stderr: launched.stderr }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function evidence(result: {
  code: number | null
  stdout: string
  stderr: string
  elapsedMs?: number
}): string {
  return `code=${result.code} elapsedMs=${result.elapsedMs ?? 'n/a'}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
}

async function refusedUrl(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('refused port did not bind')
  }
  const port = (address as AddressInfo).port
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return `http://127.0.0.1:${port}/e15-did-fail-load`
}

function page(script: string): string {
  return `<!doctype html><meta charset="utf-8"><title>e15</title><script>${script}</script>`
}

it('exits 1 when the renderer logs a console error during --smoke-test', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: page(
      "console.error('ADV-E15 renderer console error'); try { globalThis.api.notifyRendererReady() } catch (e) {}",
    ),
  }))
  const { launched } = await launchSmoke({ ELECTRON_RENDERER_URL: `${server.origin}/e15-console` })
  const result = await smokeExit(launched, FAST_EXIT_MS)
  const detail = evidence(result)
  expect(result.code, detail).toBe(1)
  expect(result.stdout, detail).not.toContain('[smoke] OK')
  expect(result.stderr, detail).toContain('[smoke] FAIL')
  expect(result.stderr, detail).toContain('renderer console error')
})

it('exits 1 when the renderer crashes during --smoke-test', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: page('try { globalThis.api.notifyRendererReady() } catch (e) {}'),
  }))
  const { launched } = await launchSmoke({ ELECTRON_RENDERER_URL: `${server.origin}/e15-crash` })
  const crashed = await launched.app
    .evaluate(async ({ BrowserWindow }) => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.webContents.isDestroyed()) {
          win.webContents.forcefullyCrashRenderer()
          return 'crashed'
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return 'no-window'
    })
    .catch(() => 'closed' as const)
  expect(crashed, `trigger=${crashed}`).toBe('crashed')
  const result = await smokeExit(launched, AFTER_TRIGGER_MS, crashed)
  const detail = `${evidence(result)}\ntrigger=${crashed}`
  expect(result.code, detail).toBe(1)
  expect(result.stdout, detail).not.toContain('[smoke] OK')
  expect(result.stderr, detail).toContain('render-process-gone')
})

it('exits 1 when did-fail-load fires during --smoke-test', async () => {
  const target = await refusedUrl()
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!doctype html><meta charset="utf-8"><title>e15</title>',
  }))
  const { launched } = await launchSmoke({
    ELECTRON_RENDERER_URL: `${server.origin}/e15-fail-load`,
  })
  // A renderer location change to this URL is cancelled, so it never fails a
  // load. loadURL still emits did-fail-load for the refused target.
  const triggered = await launched.app
    .evaluate(async ({ BrowserWindow }, url: string) => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.webContents.isDestroyed() && !win.webContents.isLoading()) {
          void win.loadURL(url)
          return 'navigated'
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return 'no-window'
    }, target)
    .catch(() => 'closed' as const)
  expect(triggered, `trigger=${triggered}`).toBe('navigated')
  const result = await smokeExit(launched, AFTER_TRIGGER_MS, triggered)
  const detail = `${evidence(result)}\ntrigger=${triggered}`
  expect(result.code, detail).toBe(1)
  expect(result.stdout, detail).not.toContain('[smoke] OK')
  expect(result.stderr, detail).toContain('did-fail-load')
})

it('exits 1 when the renderer never reports ready during --smoke-test', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!doctype html><meta charset="utf-8"><title>e15-withheld</title><p>withheld</p>',
  }))
  const { launched, started } = await launchSmoke({
    ELECTRON_RENDERER_URL: `${server.origin}/e15-withheld`,
  })
  const result = await smokeExit(launched, TIMEOUT_EXIT_MS)
  const elapsedMs = Date.now() - started
  const detail = evidence({ ...result, elapsedMs })
  expect(result.code, detail).toBe(1)
  expect(result.stdout, detail).not.toContain('[smoke] OK')
  expect(result.stderr, detail).toContain('renderer not ready after 20000ms')
  expect(elapsedMs, detail).toBeGreaterThanOrEqual(20_000)
})
