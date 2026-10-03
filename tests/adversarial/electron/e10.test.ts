/**
 * ADV-E10: malformed IPC and floods on app:versions (invoke) and app:renderer-ready (send).
 * The exposed API declares no parameters, so a main-process tap must see those calls arrive
 * with an empty argument list. A throwaway window delivers raw ipcRenderer calls the page cannot.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { launchApp, type LaunchedElectronApp, openVersionsPanel } from '../helpers/electron'

const SENTINEL = 'ADV-E10-SENTINEL'
const FLOOD_COUNT = 10_000
const READY_COUNT = 10_000
const WORK_BUDGET_MS = 20_000

interface Versions {
  app: string
  electron: string
  chrome: string
  node: string
}

interface TapState {
  calls: number
  withArgs: number
  ready: number
  readyWithArgs: number
  unknownSends: number
  versions: Versions
}

interface CallResult {
  status: 'resolved' | 'rejected'
  channel?: string
  value?: unknown
  message?: string
}

interface RawResult {
  kind: string
  status: 'resolved' | 'rejected'
  value?: unknown
  message?: string
}

interface HostileReport {
  missing?: boolean
  unknown: CallResult[]
  sendUnknown: CallResult
  extra: CallResult
  raw: RawResult[]
  clean: CallResult
}

type ElectronApp = LaunchedElectronApp['app']
type ReadyApp = LaunchedElectronApp & { window: NonNullable<LaunchedElectronApp['window']> }

const HOSTILE_PRELOAD = `'use strict'
const { contextBridge, ipcRenderer } = require('electron')

function attempt(kind, run) {
  try {
    const value = run()
    if (value && typeof value.then === 'function') {
      return value.then(
        (resolved) => ({ kind, status: 'resolved', value: resolved }),
        (error) => ({ kind, status: 'rejected', message: String(error && error.message) }),
      )
    }
    return { kind, status: 'resolved', value }
  } catch (error) {
    return { kind, status: 'rejected', message: String(error && error.message) }
  }
}

contextBridge.exposeInMainWorld('hostile', {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args)
  },
  send(channel, ...args) {
    ipcRenderer.send(channel, ...args)
  },
  raw() {
    const cycle = {}
    cycle.self = cycle
    const throwing = {}
    Object.defineProperty(throwing, 'x', {
      enumerable: true,
      get() {
        throw new Error('getter')
      },
    })
    return Promise.all([
      attempt('function', () => ipcRenderer.invoke('app:versions', function hostile() {})),
      attempt('symbol', () => ipcRenderer.invoke('app:versions', Symbol('adv-e10'))),
      attempt('throwing-getter', () => ipcRenderer.invoke('app:versions', throwing)),
      attempt('promise', () => ipcRenderer.invoke('app:versions', Promise.resolve(1))),
      attempt('cycle', () => ipcRenderer.invoke('app:versions', cycle)),
    ])
  },
})
`

const HOSTILE_PROBE = `(async () => {
  const bridge = window.hostile
  if (!bridge) return { missing: true }
  const withTimeout = (promise, ms) => {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }
  const attempt = async (channel, ...args) => {
    try {
      const value = await withTimeout(bridge.invoke(channel, ...args), 3000)
      return { channel, status: 'resolved', value }
    } catch (error) {
      return { channel, status: 'rejected', message: String(error && error.message) }
    }
  }
  const unknown = []
  for (const channel of ['adv-e10:unknown', '', 'app:renderer-ready']) {
    unknown.push(await attempt(channel))
  }
  let sendUnknown
  try {
    bridge.send('adv-e10:unknown-send', { sentinel: ${JSON.stringify(SENTINEL)} })
    sendUnknown = { status: 'resolved' }
  } catch (error) {
    sendUnknown = { status: 'rejected', message: String(error && error.message) }
  }
  const extra = await attempt(
    'app:versions',
    { sentinel: ${JSON.stringify(SENTINEL)}, nested: [1] },
    1,
    null,
  )
  let raw
  try {
    raw = await withTimeout(bridge.raw(), 5000)
  } catch (error) {
    raw = [{ kind: 'raw', status: 'rejected', message: String(error && error.message) }]
  }
  const clean = await attempt('app:versions')
  return { unknown, sendUnknown, extra, raw, clean }
})()`

function within<T>(ms: number, work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms)
  })
  void work.then(
    () => undefined,
    () => undefined,
  )
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function stop(launched: LaunchedElectronApp): Promise<void> {
  const child = launched.app.process()
  const closed = launched.close()
  void closed.then(
    () => undefined,
    () => undefined,
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    closed,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 5_000)
    }),
  ])
  if (timer !== undefined) clearTimeout(timer)
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function launchReady(): Promise<ReadyApp> {
  const launched = await launchApp()
  if (!launched.window) throw new Error('app did not open a window')
  await openVersionsPanel(launched.window)
  return launched as ReadyApp
}

function expectAlive(launched: LaunchedElectronApp): void {
  expect(launched.app.process().exitCode).toBeNull()
}

function expectVersions(actual: unknown, expected: Versions): void {
  expect(actual).toEqual(expected)
  const encoded = JSON.stringify(actual)
  expect(encoded).not.toContain(SENTINEL)
  expect(encoded).not.toContain('advE10polluted')
}

/** `launchReady` leaves the app on the settings screen that reads the versions. */
async function expectUi(launched: ReadyApp): Promise<void> {
  expect(await launched.window.locator('h1').textContent()).toBe('Configuración')
  expectAlive(launched)
}

async function installTap(app: ElectronApp): Promise<Versions> {
  return app.evaluate((electron) => {
    const g = globalThis as typeof globalThis & { advE10Tap?: TapState }
    if (g.advE10Tap) return g.advE10Tap.versions
    const versions: Versions = {
      app: electron.app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
    }
    const tap: TapState = {
      calls: 0,
      withArgs: 0,
      ready: 0,
      readyWithArgs: 0,
      unknownSends: 0,
      versions,
    }
    g.advE10Tap = tap
    const handlers = (
      electron.ipcMain as unknown as Record<
        string,
        Map<string, (event: unknown, ...args: unknown[]) => unknown> | undefined
      >
    )[`${'_'}invokeHandlers`]
    const original = handlers?.get('app:versions')
    if (!handlers || !original) throw new Error('app:versions handler is missing')
    handlers.set('app:versions', (event, ...args) => {
      tap.calls += 1
      if (args.length > 0) tap.withArgs += 1
      return original(event, ...args)
    })
    electron.ipcMain.on('app:renderer-ready', (_event, ...args: unknown[]) => {
      tap.ready += 1
      if (args.length > 0) tap.readyWithArgs += 1
    })
    electron.ipcMain.on('adv-e10:dropped', () => {
      tap.unknownSends += 1
    })
    return versions
  })
}

async function readTap(app: ElectronApp): Promise<TapState & { polluted: boolean }> {
  return app.evaluate(() => {
    const tap = (globalThis as typeof globalThis & { advE10Tap?: TapState }).advE10Tap
    if (!tap) throw new Error('IPC tap is not installed')
    return {
      calls: tap.calls,
      withArgs: tap.withArgs,
      ready: tap.ready,
      readyWithArgs: tap.readyWithArgs,
      unknownSends: tap.unknownSends,
      versions: tap.versions,
      polluted: Object.hasOwn(Object.prototype, 'advE10polluted'),
    }
  })
}

async function runHostile(app: ElectronApp): Promise<HostileReport> {
  const dir = mkdtempSync(join(tmpdir(), 'adv-e10-'))
  const preload = join(dir, 'preload.cjs')
  writeFileSync(preload, HOSTILE_PRELOAD)
  try {
    return await within(
      WORK_BUDGET_MS,
      app.evaluate(
        async (electron, input: { preload: string; script: string }) => {
          const win = new electron.BrowserWindow({
            show: false,
            webPreferences: {
              preload: input.preload,
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
              backgroundThrottling: false,
            },
          })
          try {
            await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>adv-e10</title>')
            return (await win.webContents.executeJavaScript(input.script, true)) as HostileReport
          } finally {
            if (!win.isDestroyed()) win.destroy()
          }
        },
        { preload, script: HOSTILE_PROBE },
      ),
      'hostile IPC probe',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

it('ADV-E10 extra and non-serializable arguments do not reach the handler', async () => {
  const launched = await launchReady()
  try {
    const versions = await installTap(launched.app)
    const before = await readTap(launched.app)
    const abused = await launched.window.evaluate(async (sentinel: string) => {
      const g = globalThis as typeof globalThis & {
        api?: {
          getVersions: (...args: unknown[]) => Promise<unknown>
          notifyRendererReady: (...args: unknown[]) => void
        }
        document?: { body?: unknown }
      }
      if (!g.api) return { missing: true as const }
      const extra: { sentinel: string } = { sentinel }
      Object.defineProperty(extra, '__proto__', {
        value: { advE10polluted: true },
        enumerable: true,
      })
      const cycle: { self?: unknown } = {}
      cycle.self = cycle
      const calls = [
        await g.api.getVersions(extra, 1, null, true),
        await g.api.getVersions(function hostile() {}),
        await g.api.getVersions(Symbol('adv-e10')),
        await g.api.getVersions(g.document?.body),
        await g.api.getVersions(cycle),
      ]
      let readyFn = 'ok'
      try {
        g.api.notifyRendererReady(extra)
        g.api.notifyRendererReady(function hostile() {})
      } catch (error) {
        readyFn = error instanceof Error ? error.message : String(error)
      }
      return {
        missing: false as const,
        calls,
        readyFn,
        polluted: Object.hasOwn(Object.prototype, 'advE10polluted'),
      }
    }, SENTINEL)

    expect(abused.missing, 'window.api missing').toBe(false)
    if (abused.missing) return
    expect(abused.readyFn, 'non-serializable notifyRendererReady').toBe('ok')
    expect(abused.polluted).toBe(false)
    for (const value of abused.calls) expectVersions(value, versions)

    const afterPage = await readTap(launched.app)
    expect(afterPage.calls - before.calls).toBe(abused.calls.length)
    expect(afterPage.withArgs - before.withArgs).toBe(0)
    expect(afterPage.readyWithArgs - before.readyWithArgs).toBe(0)
    expect(afterPage.polluted).toBe(false)

    const hostile = await runHostile(launched.app)
    expect(hostile.missing, 'hostile bridge missing').not.toBe(true)
    expectVersions(hostile.clean.value, versions)
    expect(['resolved', 'rejected']).toContain(hostile.extra.status)
    const extraEcho = JSON.stringify(hostile.extra.value ?? null)
    expect(extraEcho).not.toContain(SENTINEL)
    expect(extraEcho).not.toContain('advE10polluted')
    expect(
      hostile.extra.status === 'rejected' ||
        JSON.stringify(hostile.extra.value) === JSON.stringify(versions),
    ).toBe(true)
    for (const kind of ['function', 'symbol', 'throwing-getter', 'promise']) {
      const row = hostile.raw.find((entry) => entry.kind === kind)
      expect(row, kind).toBeDefined()
      expect(row?.status, `${kind} ${row?.message ?? ''}`).toBe('rejected')
      expect(row?.message ?? '').toMatch(/could not be cloned/i)
    }
    const cycle = hostile.raw.find((entry) => entry.kind === 'cycle')
    expect(cycle?.status).toBe('resolved')
    expectVersions(cycle?.value, versions)

    const afterHostile = await readTap(launched.app)
    expect(afterHostile.polluted).toBe(false)
    await expectUi(launched)
  } finally {
    await stop(launched)
  }
})

it('ADV-E10 unknown channels fail', async () => {
  const launched = await launchReady()
  try {
    const versions = await installTap(launched.app)
    const surface = await launched.window.evaluate(async (channel: string) => {
      const g = globalThis as typeof globalThis & {
        api?: {
          getVersions: (...args: unknown[]) => Promise<unknown>
          notifyRendererReady: (...args: unknown[]) => void
        }
        require?: unknown
        process?: unknown
        module?: unknown
        Buffer?: unknown
        ipcRenderer?: unknown
      }
      const names = ['require', 'process', 'module', 'Buffer', 'ipcRenderer'] as const
      const globals = names.filter((name) => typeof g[name] !== 'undefined')
      if (!g.api) return { missing: true as const, globals, keys: [] as string[] }
      g.api.notifyRendererReady(channel)
      return {
        missing: false as const,
        globals,
        keys: Object.keys(g.api),
        channelArg: await g.api.getVersions(channel),
        polluted: Object.hasOwn(Object.prototype, 'advE10polluted'),
      }
    }, 'adv-e10:dropped')

    expect(surface.missing, 'window.api missing').toBe(false)
    if (surface.missing) return
    expect(surface.globals).toEqual([])
    expect(surface.keys.toSorted()).toEqual(['getVersions', 'notifyRendererReady'])
    expectVersions(surface.channelArg, versions)
    expect(surface.polluted).toBe(false)

    const tap = await readTap(launched.app)
    expect(tap.unknownSends).toBe(0)
    expect(tap.withArgs).toBe(0)

    const channels = await launched.app.evaluate((electron) => {
      const handlers = (
        electron.ipcMain as unknown as Record<string, Map<string, unknown> | undefined>
      )[`${'_'}invokeHandlers`]
      return handlers ? [...handlers.keys()] : []
    })
    expect(channels).toContain('app:versions')
    expect(channels).not.toContain('adv-e10:unknown')
    expect(channels).not.toContain('app:renderer-ready')
    expect(channels).not.toContain('')

    const hostile = await runHostile(launched.app)
    expect(hostile.missing, 'hostile bridge missing').not.toBe(true)
    expect(hostile.unknown.map((entry) => entry.channel)).toEqual([
      'adv-e10:unknown',
      '',
      'app:renderer-ready',
    ])
    for (const entry of hostile.unknown) {
      expect(entry.status, entry.channel).toBe('rejected')
      expect(entry.message ?? '', entry.channel).toMatch(/No handler registered/i)
    }
    expectVersions(hostile.clean.value, versions)
    const still = await launched.window.evaluate(async () => {
      const api = (
        globalThis as typeof globalThis & { api?: { getVersions: () => Promise<unknown> } }
      ).api
      if (!api) throw new Error('window.api missing')
      return api.getVersions()
    })
    expectVersions(still, versions)
    await expectUi(launched)
  } finally {
    await stop(launched)
  }
})

it('ADV-E10 ten thousand app:versions invokes do not wedge the process', async () => {
  const launched = await launchReady()
  try {
    const versions = await installTap(launched.app)
    const before = await readTap(launched.app)
    const flood = await within(
      WORK_BUDGET_MS + 5_000,
      launched.window.evaluate(
        async (input: { count: number; budgetMs: number; expected: Versions }) => {
          const api = (
            globalThis as typeof globalThis & { api?: { getVersions: () => Promise<Versions> } }
          ).api
          if (!api) return { ok: false as const, reason: 'missing api', done: 0, ms: 0 }
          const started = Date.now()
          const deadline = started + input.budgetMs
          const chunk = 250
          let done = 0
          for (let offset = 0; offset < input.count; offset += chunk) {
            if (Date.now() > deadline) {
              return { ok: false as const, reason: 'budget', done, ms: Date.now() - started }
            }
            const size = Math.min(chunk, input.count - offset)
            let timer: ReturnType<typeof setTimeout> | undefined
            try {
              const batch = await Promise.race([
                Promise.all(Array.from({ length: size }, () => api.getVersions())),
                new Promise<never>((_, reject) => {
                  timer = setTimeout(() => reject(new Error('chunk timed out')), 5_000)
                }),
              ])
              for (const value of batch) {
                const keys = Object.keys(value)
                if (
                  keys.length !== 4 ||
                  value.app !== input.expected.app ||
                  value.electron !== input.expected.electron ||
                  value.chrome !== input.expected.chrome ||
                  value.node !== input.expected.node
                ) {
                  return {
                    ok: false as const,
                    reason: 'mismatch',
                    done,
                    ms: Date.now() - started,
                    value,
                  }
                }
              }
              done += size
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              return { ok: false as const, reason: message, done, ms: Date.now() - started }
            } finally {
              if (timer !== undefined) clearTimeout(timer)
            }
          }
          return { ok: true as const, done, ms: Date.now() - started }
        },
        { count: FLOOD_COUNT, budgetMs: WORK_BUDGET_MS, expected: versions },
      ),
      'app:versions flood',
    )

    expect(flood.ok, JSON.stringify(flood)).toBe(true)
    if (!flood.ok) return
    expect(flood.done).toBe(FLOOD_COUNT)
    expect(flood.ms).toBeLessThan(WORK_BUDGET_MS)
    const after = await readTap(launched.app)
    expect(after.calls - before.calls).toBe(FLOOD_COUNT)
    expect(after.withArgs - before.withArgs).toBe(0)
    const mainVersion = await within(
      5_000,
      launched.app.evaluate((electron) => electron.app.getVersion()),
      'main process',
    )
    expect(mainVersion).toBe(versions.app)
    await expectUi(launched)
  } finally {
    await stop(launched)
  }
})

it('ADV-E10 repeated app:renderer-ready does not wedge the process', async () => {
  const launched = await launchReady()
  try {
    const versions = await installTap(launched.app)
    const before = await readTap(launched.app)
    const spam = await within(
      WORK_BUDGET_MS + 5_000,
      launched.window.evaluate(
        async (input: { count: number; sentinel: string; budgetMs: number }) => {
          const g = globalThis as typeof globalThis & {
            api?: {
              getVersions: () => Promise<unknown>
              notifyRendererReady: (...args: unknown[]) => void
            }
          }
          if (!g.api) return { ok: false as const, reason: 'missing api', done: 0, ms: 0 }
          const extra = { sentinel: input.sentinel }
          Object.defineProperty(extra, '__proto__', {
            value: { advE10polluted: true },
            enumerable: true,
          })
          const started = Date.now()
          for (let i = 0; i < input.count; i++) {
            g.api.notifyRendererReady(extra)
            if (i % 250 === 0 && Date.now() - started > input.budgetMs) {
              return { ok: false as const, reason: 'budget', done: i, ms: Date.now() - started }
            }
          }
          let fn = 'ok'
          try {
            g.api.notifyRendererReady(function hostile() {})
          } catch (error) {
            fn = error instanceof Error ? error.message : String(error)
          }
          const latest = await g.api.getVersions()
          return {
            ok: true as const,
            done: input.count,
            ms: Date.now() - started,
            fn,
            versions: latest,
            polluted: Object.hasOwn(Object.prototype, 'advE10polluted'),
          }
        },
        { count: READY_COUNT, sentinel: SENTINEL, budgetMs: WORK_BUDGET_MS },
      ),
      'app:renderer-ready flood',
    )

    expect(spam.ok, JSON.stringify(spam)).toBe(true)
    if (!spam.ok) return
    expect(spam.done).toBe(READY_COUNT)
    expect(spam.ms).toBeLessThan(WORK_BUDGET_MS)
    expect(spam.fn).toBe('ok')
    expect(spam.polluted).toBe(false)
    expectVersions(spam.versions, versions)
    const after = await readTap(launched.app)
    const readyDelta = after.ready - before.ready
    expect(readyDelta).toBeGreaterThanOrEqual(READY_COUNT)
    expect(readyDelta).toBeLessThanOrEqual(READY_COUNT + 2)
    expect(after.readyWithArgs - before.readyWithArgs).toBe(0)
    expect(after.polluted).toBe(false)
    const mainVersion = await within(
      5_000,
      launched.app.evaluate((electron) => electron.app.getVersion()),
      'main process',
    )
    expect(mainVersion).toBe(versions.app)
    await expectUi(launched)
  } finally {
    await stop(launched)
  }
})
