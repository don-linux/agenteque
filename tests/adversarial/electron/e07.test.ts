/**
 * E07: window.api is exactly the bridge the preload declares, those methods are
 * not usefully overwriteable, and prototype pollution does not cross contextBridge.
 */
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import { IpcChannel } from '../../../src/shared/ipc'
import { launchApp, openVersionsPanel } from '../helpers/electron'

const API_KEYS = [
  'getVersions',
  'loadConfig',
  'notifyRendererReady',
  'platform',
  'recordRecentFolder',
  'removeRecentFolder',
  'saveAppearanceSettings',
  'saveLayoutSettings',
  'saveTerminalSettings',
  'saveWorkspaceView',
  'shellStatus',
  'ptySpawn',
  'ptyWrite',
  'ptyResize',
  'ptyKill',
  'ptyKillAll',
  'onPtyData',
  'onPtyExit',
  'pickFolder',
  'listWorkspaceDirs',
  'listContextTree',
  'readMarkdown',
  'writeMarkdown',
  'createEntry',
  'renameEntry',
  'moveEntry',
  'deleteEntry',
  'onWorkspaceChanged',
  'gitRefs',
  'gitGraph',
  'gitSummary',
  'fontPage',
] as const
const VERSION_KEYS = ['app', 'chrome', 'electron', 'node'] as const
const MARKER = 'advE07Polluted'

type Versions = Record<(typeof VERSION_KEYS)[number], string>
type VersionProbe = { calls: number; argCounts: number[] }
type ReadyProbe = { ready: number; argCounts: number[] }

async function openApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('app did not open a window')
  await openVersionsPanel(page)
  return { app: launched.app, page }
}

function sorted(keys: readonly string[]): string[] {
  return [...keys].toSorted()
}

async function readMainVersions(app: ElectronApplication): Promise<Versions> {
  return app.evaluate(({ app: electronApp }) => {
    const electron = process.versions.electron
    const chrome = process.versions.chrome
    const node = process.versions.node
    if (!electron || !chrome || !node) throw new Error('missing process.versions')
    return { app: electronApp.getVersion(), electron, chrome, node }
  })
}

async function installVersionProbe(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, ipcMain }, channel: string) => {
    const state = { calls: 0, argCounts: [] as number[] }
    ;(global as typeof globalThis & { advE07Versions?: typeof state }).advE07Versions = state
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      state.calls += 1
      state.argCounts.push(args.length)
      const electron = process.versions.electron
      const chrome = process.versions.chrome
      const node = process.versions.node
      if (!electron || !chrome || !node) throw new Error('missing process.versions')
      return { app: electronApp.getVersion(), electron, chrome, node }
    })
  }, IpcChannel.versions)
}

async function readVersionProbe(app: ElectronApplication): Promise<VersionProbe> {
  return app.evaluate(() => {
    const state = (global as typeof globalThis & { advE07Versions?: VersionProbe }).advE07Versions
    if (!state) return { calls: 0, argCounts: [] as number[] }
    return { calls: state.calls, argCounts: [...state.argCounts] }
  })
}

async function installReadyProbe(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }, channel: string) => {
    const state = { ready: 0, argCounts: [] as number[] }
    ;(global as typeof globalThis & { advE07Ready?: typeof state }).advE07Ready = state
    ipcMain.on(channel, (_event, ...args: unknown[]) => {
      state.ready += 1
      state.argCounts.push(args.length)
    })
  }, IpcChannel.rendererReady)
}

async function readReadyProbe(app: ElectronApplication): Promise<ReadyProbe> {
  return app.evaluate(() => {
    const state = (global as typeof globalThis & { advE07Ready?: ReadyProbe }).advE07Ready
    if (!state) return { ready: 0, argCounts: [] as number[] }
    return { ready: state.ready, argCounts: [...state.argCounts] }
  })
}

it('exposes exactly getVersions and notifyRendererReady', async () => {
  const { page } = await openApp()
  const surface = await page.evaluate(
    (dangerous: readonly string[]) => {
      const value = (globalThis as { api?: unknown }).api
      if (!value || typeof value !== 'object') throw new Error('window.api is missing')
      const api = value as Record<string, unknown>
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'api')
      const prototype = Object.getPrototypeOf(api) as object | null
      const visible = dangerous.filter((key) => key in api)
      return {
        ownKeys: Reflect.ownKeys(api).map((key) => (typeof key === 'string' ? key : String(key))),
        types: {
          getVersions: typeof api.getVersions,
          notifyRendererReady: typeof api.notifyRendererReady,
        },
        apiPrototype:
          prototype === Object.prototype ? 'object' : prototype === null ? 'null' : 'other',
        getVersionsPrototype:
          typeof api.getVersions === 'function' &&
          Object.getPrototypeOf(api.getVersions) === Function.prototype
            ? 'function'
            : 'other',
        notifyPrototype:
          typeof api.notifyRendererReady === 'function' &&
          Object.getPrototypeOf(api.notifyRendererReady) === Function.prototype
            ? 'function'
            : 'other',
        frozen: Object.isFrozen(api),
        extensible: Object.isExtensible(api),
        descriptor: descriptor
          ? {
              configurable: descriptor.configurable ?? false,
              enumerable: descriptor.enumerable ?? false,
              writable: 'writable' in descriptor ? descriptor.writable === true : false,
            }
          : null,
        sources: [api.getVersions, api.notifyRendererReady].map((fn) =>
          typeof fn === 'function' ? Function.prototype.toString.call(fn) : typeof fn,
        ),
        visible,
      }
    },
    [
      'invoke',
      'send',
      'sendSync',
      'sendTo',
      'ipcRenderer',
      'postMessage',
      'require',
      'process',
      'contextBridge',
      'Buffer',
      'module',
    ] as const,
  )

  expect(sorted(surface.ownKeys)).toEqual(sorted(API_KEYS))
  expect(surface.types).toEqual({ getVersions: 'function', notifyRendererReady: 'function' })
  expect(surface.apiPrototype).toBe('object')
  expect(surface.getVersionsPrototype).toBe('function')
  expect(surface.notifyPrototype).toBe('function')
  expect(surface.frozen).toBe(true)
  expect(surface.extensible).toBe(false)
  expect(surface.descriptor).toEqual({ configurable: false, enumerable: true, writable: false })
  expect(surface.visible).toEqual([])
  for (const source of surface.sources) {
    expect(source).not.toContain('ipcRenderer')
    expect(source).not.toContain(IpcChannel.versions)
    expect(source).not.toContain(IpcChannel.rendererReady)
  }
})

it('resolves getVersions through IPC and drops renderer arguments', async () => {
  const { app, page } = await openApp()
  const expected = await readMainVersions(app)
  await installVersionProbe(app)

  const result = await page.evaluate(async (marker: string) => {
    const value = (globalThis as { api?: unknown }).api
    if (!value || typeof value !== 'object') throw new Error('window.api is missing')
    const api = value as {
      getVersions: (...args: unknown[]) => Promise<Record<string, unknown>>
    }
    let invoked = false
    const callback = (): string => {
      invoked = true
      return 'pwned'
    }
    const custom = Object.create({ [marker]: 'inherited', stolen: 'yes' }) as Record<
      string,
      unknown
    >
    custom.app = 'hacked'
    custom.extra = true
    const ownProto = Object.defineProperty({ app: 'hacked', data: 1 }, '__proto__', {
      value: { [marker]: 'own-proto' },
      enumerable: true,
      writable: true,
      configurable: true,
    })
    const parsed: unknown = JSON.parse(
      `{"__proto__":{"${marker}":"json"},"app":"hacked","extra":true}`,
    )
    const ctor = { constructor: { prototype: { [marker]: 'ctor' } }, app: 'hacked' }
    const payloads: readonly unknown[] = [custom, ownProto, parsed, ctor, callback, null]
    const seen: { ownKeys: string[]; prototype: string; app: unknown }[] = []
    for (const payload of payloads) {
      const versions = await api.getVersions(payload)
      const prototype = Object.getPrototypeOf(versions) as object | null
      seen.push({
        ownKeys: Reflect.ownKeys(versions).map((key) =>
          typeof key === 'string' ? key : String(key),
        ),
        prototype:
          prototype === Object.prototype ? 'object' : prototype === null ? 'null' : 'other',
        app: versions.app,
      })
    }
    const plain = await api.getVersions()
    return {
      invoked,
      markerOnRenderer: Object.hasOwn(Object.prototype, marker),
      seen,
      plain,
    }
  }, MARKER)

  const probe = await readVersionProbe(app)
  expect(probe.calls).toBe(result.seen.length + 1)
  expect(probe.argCounts).toEqual(result.seen.map(() => 0).concat(0))
  expect(result.invoked).toBe(false)
  expect(result.markerOnRenderer).toBe(false)
  expect(result.plain).toEqual(expected)
  for (const seen of result.seen) {
    expect(sorted(seen.ownKeys)).toEqual(sorted(VERSION_KEYS))
    expect(seen.prototype).toBe('object')
    expect(seen.app).toBe(expected.app)
  }
})

it('does not let prototype pollution cross contextBridge', async () => {
  const { app, page } = await openApp()
  const expected = await readMainVersions(app)

  const fromRenderer = await page.evaluate(async (marker: string) => {
    const value = (globalThis as { api?: unknown }).api
    if (!value || typeof value !== 'object') throw new Error('window.api is missing')
    const api = value as {
      getVersions: (...args: unknown[]) => Promise<Record<string, unknown>>
      notifyRendererReady: (...args: unknown[]) => void
    }
    const ownNames = (target: object): string[] => {
      if (marker === '') throw new Error('empty pollution marker')
      return Reflect.ownKeys(target).map((key) => (typeof key === 'string' ? key : String(key)))
    }
    const prototypeName = (target: object): 'object' | 'null' | 'other' => {
      if (marker === '') throw new Error('empty pollution marker')
      const prototype = Object.getPrototypeOf(target) as object | null
      if (prototype === Object.prototype) return 'object'
      if (prototype === null) return 'null'
      return 'other'
    }

    // The renderer must be able to pollute its own prototype without that reaching main.
    // eslint-disable-next-line no-extend-native -- adversarial probe, removed in finally
    Object.defineProperty(Object.prototype, marker, {
      value: 'from-renderer',
      enumerable: true,
      configurable: true,
      writable: true,
    })
    try {
      const versions = await api.getVersions({ app: 'hacked', [marker]: 'payload' })
      api.notifyRendererReady({ [marker]: 'payload', extra: true })
      return {
        apiKeys: ownNames(api),
        versionKeys: ownNames(versions),
        markerOwnOnApi: Object.hasOwn(api, marker),
        markerOwnOnVersions: Object.hasOwn(versions, marker),
        prototype: prototypeName(versions),
        apiPrototype: prototypeName(api),
        app: versions.app,
      }
    } finally {
      delete (Object.prototype as Record<string, unknown>)[marker]
    }
  }, MARKER)

  expect(sorted(fromRenderer.apiKeys)).toEqual(sorted(API_KEYS))
  expect(sorted(fromRenderer.versionKeys)).toEqual(sorted(VERSION_KEYS))
  expect(fromRenderer.markerOwnOnApi).toBe(false)
  expect(fromRenderer.markerOwnOnVersions).toBe(false)
  expect(fromRenderer.prototype).toBe('object')
  expect(fromRenderer.apiPrototype).toBe('object')
  expect(fromRenderer.app).toBe(expected.app)
  expect(
    await app.evaluate(
      (_electron, marker: string) => Object.hasOwn(Object.prototype, marker),
      MARKER,
    ),
  ).toBe(false)
  expect(
    await page.evaluate((marker: string) => Object.hasOwn(Object.prototype, marker), MARKER),
  ).toBe(false)

  await app.evaluate((_electron, marker: string) => {
    // eslint-disable-next-line no-extend-native -- adversarial probe, removed in finally
    Object.defineProperty(Object.prototype, marker, {
      value: 'from-main',
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }, MARKER)
  try {
    const leaked = await page.evaluate(async (marker: string) => {
      const value = (
        globalThis as { api?: { getVersions?: () => Promise<Record<string, unknown>> } }
      ).api
      if (!value?.getVersions) throw new Error('window.api.getVersions is missing')
      const versions = await value.getVersions()
      const prototype = Object.getPrototypeOf(versions) as object | null
      return {
        ownKeys: Reflect.ownKeys(versions).map((key) =>
          typeof key === 'string' ? key : String(key),
        ),
        markerOwn: Object.hasOwn(versions, marker),
        markerOnRenderer: Object.hasOwn(Object.prototype, marker),
        prototype:
          prototype === Object.prototype ? 'object' : prototype === null ? 'null' : 'other',
        value: versions[marker] ?? null,
        app: versions.app,
      }
    }, MARKER)
    expect(sorted(leaked.ownKeys)).toEqual(sorted(VERSION_KEYS))
    expect(leaked.markerOwn).toBe(false)
    expect(leaked.markerOnRenderer).toBe(false)
    expect(leaked.prototype).toBe('object')
    expect(leaked.value).toBeNull()
    expect(leaked.app).toBe(expected.app)
  } finally {
    await app.evaluate((_electron, marker: string) => {
      delete (Object.prototype as Record<string, unknown>)[marker]
    }, MARKER)
  }
})

it('is not usefully overwriteable', async () => {
  const { app, page } = await openApp()
  const expected = await readMainVersions(app)
  await installVersionProbe(app)
  await installReadyProbe(app)
  const readyBefore = await readReadyProbe(app)

  const report = await page.evaluate(async () => {
    const host = globalThis as { api?: unknown }
    const value = host.api
    if (!value || typeof value !== 'object') throw new Error('window.api is missing')
    const api = value as Record<string, unknown> & {
      getVersions: () => Promise<Record<string, string>>
      notifyRendererReady: (...args: unknown[]) => void
    }
    const fake = { app: 'pwned', electron: 'pwned', chrome: 'pwned', node: 'pwned' }
    const pwned = (): Promise<typeof fake> => Promise.resolve(fake)
    const attempts: Record<string, string> = {}
    const attempt = (name: string, fn: () => void): void => {
      try {
        fn()
        attempts[name] = 'applied'
      } catch (error) {
        attempts[name] = error instanceof Error ? error.name : 'thrown'
      }
    }

    const reflect = {
      setApi: Reflect.set(host, 'api', {
        getVersions: pwned,
        notifyRendererReady: () => undefined,
        pwn: true,
      }),
      defineApi: Reflect.defineProperty(host, 'api', {
        value: { getVersions: pwned, notifyRendererReady: () => undefined },
      }),
      deleteApi: Reflect.deleteProperty(host, 'api'),
      setMethod: Reflect.set(api, 'getVersions', pwned),
      defineMethod: Reflect.defineProperty(api, 'getVersions', { value: pwned }),
      deleteMethod: Reflect.deleteProperty(api, 'getVersions'),
      setExtra: Reflect.set(api, 'pwn', true),
    }
    attempt('assignApi', () => {
      host.api = { getVersions: pwned, notifyRendererReady: () => undefined, pwn: true }
    })
    attempt('assignMethod', () => {
      api.getVersions = pwned
    })
    attempt('assignNotify', () => {
      api.notifyRendererReady = () => undefined
    })
    attempt('addProp', () => {
      api.pwn = true
    })
    attempt('deleteMethod', () => {
      delete (api as { getVersions?: unknown }).getVersions
    })
    attempt('defineMethod', () => {
      Object.defineProperty(api, 'getVersions', { value: pwned })
    })
    attempt('setPrototype', () => {
      Object.setPrototypeOf(api, { pwn: true })
    })

    const liveValue = host.api
    if (!liveValue || typeof liveValue !== 'object') throw new Error('window.api disappeared')
    const live = liveValue as typeof api
    const versions = await live.getVersions()
    const payload = { extra: true, app: 'hacked' }
    live.notifyRendererReady(payload)
    live.notifyRendererReady(payload)
    live.notifyRendererReady(payload)
    return {
      attempts,
      reflect,
      ownKeys: Reflect.ownKeys(live).map((key) => (typeof key === 'string' ? key : String(key))),
      versions,
      pwnOwn: Object.hasOwn(live, 'pwn'),
      prototypePwn:
        ((Object.getPrototypeOf(live) as { pwn?: unknown } | null)?.pwn ?? null) === true,
    }
  })

  const versionProbe = await readVersionProbe(app)
  expect(report.reflect).toEqual({
    setApi: false,
    defineApi: false,
    deleteApi: false,
    setMethod: false,
    defineMethod: false,
    deleteMethod: false,
    setExtra: false,
  })
  expect(sorted(report.ownKeys), JSON.stringify(report.attempts)).toEqual(sorted(API_KEYS))
  expect(report.pwnOwn).toBe(false)
  expect(report.prototypePwn).toBe(false)
  expect(report.versions).toEqual(expected)
  expect(versionProbe.calls).toBe(1)
  expect(versionProbe.argCounts).toEqual([0])

  await expect
    .poll(async () => (await readReadyProbe(app)).ready, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(readyBefore.ready + 3)
  const readyAfter = await readReadyProbe(app)
  const added = readyAfter.argCounts.slice(readyBefore.argCounts.length)
  expect(added.length).toBeGreaterThanOrEqual(3)
  expect(added.every((count) => count === 0)).toBe(true)
})
