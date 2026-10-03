/**
 * ADV-E16. `--smoke-test` may print `[smoke] OK` and exit 0 only after the
 * renderer has mounted, and only for a single ready signal that arrives in time.
 * A signal sent before mount, a second signal, or a signal after the 20s deadline
 * must not be reported as OK. The early and duplicate signals false-OK today, so those
 * cases stay `it.fails` until the gate rejects them. A signal after the deadline
 * already exits 1.
 */
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { IpcChannel } from '../../../src/shared/ipc'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E16 = { id: 'ADV-E16' } as const
const LATE_SIGNAL_MS = 22_000

const EARLY_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>e16-early</title>
    <script>
      var bridge = window.api && typeof window.api.notifyRendererReady === 'function'
      var heading = document.querySelector('h1')
      var mounted = heading !== null && heading.textContent === 'agenteque'
      fetch(
        '/beacon?ready=' + document.readyState +
          '&mounted=' + (mounted ? '1' : '0') +
          '&api=' + (bridge ? '1' : '0'),
      ).catch(function () {})
      if (bridge) window.api.notifyRendererReady()
    </script>
  </head>
  <body>
    <p>not-mounted</p>
  </body>
</html>`

const LATE_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>e16-late</title>
  </head>
  <body>
    <p>not-mounted</p>
    <script>
      setTimeout(function () {
        if (window.api && typeof window.api.notifyRendererReady === 'function') {
          window.api.notifyRendererReady()
          fetch('/beacon?late=1').catch(function () {})
        }
      }, ${LATE_SIGNAL_MS})
    </script>
  </body>
</html>`

function launchSmoke(env?: Record<string, string>): Promise<LaunchedElectronApp> {
  return launchApp({
    args: ['--smoke-test'],
    waitForWindow: false,
    env,
  })
}

async function waitForSmoke(
  launched: LaunchedElectronApp,
  budgetMs: number,
): Promise<{ code: number | null; output: string }> {
  const code = await Promise.race([launched.exited, delay(budgetMs).then(() => 'pending' as const)])
  await delay(200)
  const output = `${launched.stdout}\n${launched.stderr}`
  if (code === 'pending') {
    throw new Error(`smoke process still running after ${budgetMs}ms\n${output}`)
  }
  return { code, output }
}

function assertNoFalseOk(code: number | null, output: string): void {
  expect(output, output).not.toContain('[smoke] OK')
  expect(code, output).not.toBe(0)
}

it.fails(
  'ADV-E16 a ready signal before the renderer mounts must not report OK',
  { meta: ADV_E16 },
  async () => {
    const server = await startHostileServer((request) => {
      if (request.url.startsWith('/beacon')) return { status: 204, body: '' }
      return {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: EARLY_PAGE,
      }
    })
    const launched = await launchSmoke({ ELECTRON_RENDERER_URL: `${server.origin}/early` })
    const { code, output } = await waitForSmoke(launched, 25_000)
    const beacon = server.requests
      .map((request) => request.url)
      .filter((url) => url.startsWith('/beacon'))
      .join(' ')
    expect(beacon, beacon).toContain('mounted=0')
    expect(beacon, beacon).toContain('api=1')
    assertNoFalseOk(code, output)
  },
)

it.fails('ADV-E16 a second ready signal must not report OK', { meta: ADV_E16 }, async () => {
  const launched = await launchSmoke()
  const page = await launched.app.firstWindow({ timeout: 15_000 })
  await page.locator('.versions code').first().waitFor({ timeout: 10_000 })
  expect(launched.app.process().exitCode, 'smoke exited before the second signal').toBeNull()

  await launched.app.evaluate(({ ipcMain }, channel: string) => {
    const state = { count: 0 }
    ;(global as unknown as { agentequeAdvE16?: { count: number } }).agentequeAdvE16 = state
    ipcMain.on(channel, () => {
      state.count += 1
    })
  }, IpcChannel.rendererReady)

  await page.evaluate(() => {
    const bridge = (globalThis as { api?: { notifyRendererReady?: () => void } }).api
    if (!bridge?.notifyRendererReady) throw new Error('window.api.notifyRendererReady is missing')
    bridge.notifyRendererReady()
  })

  const seen = await launched.app.evaluate(() => {
    return (
      (global as unknown as { agentequeAdvE16?: { count: number } }).agentequeAdvE16?.count ?? 0
    )
  })
  expect(seen).toBe(1)
  expect(
    launched.app.process().exitCode,
    'smoke exited before the duplicate was observed',
  ).toBeNull()

  const { code, output } = await waitForSmoke(launched, 8_000)
  assertNoFalseOk(code, output)
})

it('a ready signal that arrives after the smoke deadline must not report OK', async () => {
  const server = await startHostileServer((request) => {
    if (request.url.startsWith('/beacon')) return { status: 204, body: '' }
    return {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: LATE_PAGE,
    }
  })
  const launched = await launchSmoke({ ELECTRON_RENDERER_URL: `${server.origin}/late` })
  const early = await Promise.race([
    launched.exited.then((code) => ({ kind: 'exit' as const, code })),
    delay(LATE_SIGNAL_MS).then(() => ({ kind: 'still-up' as const })),
  ])
  if (early.kind === 'still-up') {
    await launched.app.evaluate(({ ipcMain }, channel: string) => {
      ipcMain.emit(channel)
    }, IpcChannel.rendererReady)
  }
  const { code, output } = await waitForSmoke(launched, 8_000)
  const beacons = server.requests
    .map((request) => request.url)
    .filter((url) => url.startsWith('/beacon'))
  expect(output, output).toContain('[smoke] FAIL: renderer not ready after 20000ms')
  expect(output, output).not.toContain('[smoke] OK')
  expect(code, output).toBe(1)
  expect(beacons, output).toEqual([])
})
