import type { ElectronApplication, Frame, Page } from 'playwright'
import { expect, it } from 'vitest'
import { IpcChannel } from '../../../src/shared/ipc'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

declare module 'vitest' {
  interface TaskMeta {
    id?: string
  }
}

const ADV_E09 = { id: 'ADV-E09' } as const

type VersionProbe = {
  exposed: boolean
  versions: unknown
  error: string | null
}

type SenderSnapshot = {
  url: string | null
  origin: string | null
  childFrame: boolean
}

function isVersionPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return ['app', 'electron', 'chrome', 'node'].every(
    (key) => typeof record[key] === 'string' && record[key] !== '',
  )
}

async function probeOwnVersions(target: Page | Frame): Promise<VersionProbe> {
  return target.evaluate(async () => {
    const api = (globalThis as { api?: { getVersions?: () => Promise<unknown> } }).api
    if (typeof api?.getVersions !== 'function') {
      return { exposed: false, versions: null, error: null }
    }
    try {
      return { exposed: true, versions: await api.getVersions(), error: null }
    } catch (error) {
      return {
        exposed: true,
        versions: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

async function probeParentVersions(frame: Frame): Promise<VersionProbe> {
  return frame.evaluate(async () => {
    try {
      const parentApi = (
        globalThis as { parent?: { api?: { getVersions?: () => Promise<unknown> } } }
      ).parent?.api
      if (typeof parentApi?.getVersions !== 'function') {
        return { exposed: false, versions: null, error: null }
      }
      return { exposed: true, versions: await parentApi.getVersions(), error: null }
    } catch (error) {
      return {
        exposed: false,
        versions: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

async function openApp(): Promise<{
  serverOrigin: string
  launched: LaunchedElectronApp
  page: Page
}> {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<!doctype html><title>hostile</title><p>hostile</p>',
  }))
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('app did not open a window')
  await page.locator('h1').waitFor()
  return { serverOrigin: server.origin, launched, page }
}

async function attachHostileFrame(page: Page, src: string): Promise<Frame> {
  const attached = page.waitForEvent('framenavigated', {
    predicate: (frame) => {
      if (frame.name() !== 'e09-hostile') return false
      const url = frame.url()
      return url.startsWith('http://127.0.0.1') || url.startsWith('chrome-error:')
    },
    timeout: 15_000,
  })
  await page.evaluate((frameSrc: string) => {
    const owner = globalThis as unknown as {
      document: {
        createElement(tag: string): { name: string; src: string }
        body: { appendChild(node: { name: string; src: string }): void }
      }
    }
    const iframe = owner.document.createElement('iframe')
    iframe.name = 'e09-hostile'
    iframe.src = frameSrc
    owner.document.body.appendChild(iframe)
  }, src)
  return attached
}

async function watchVersionSenders(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }, channel: string) => {
    const handlers = (
      ipcMain as unknown as Record<
        string,
        Map<
          string,
          (
            event: { senderFrame: { url: string; origin: string; parent: unknown } | null },
            ...args: unknown[]
          ) => unknown
        >
      >
    )['_invokeHandlers']
    const original = handlers.get(channel)
    if (!original) throw new Error(`missing IPC handler for ${channel}`)
    const calls: SenderSnapshot[] = []
    ;(global as unknown as Record<string, SenderSnapshot[]>)['__agentequeAdvE09'] = calls
    handlers.set(channel, (event, ...args) => {
      const frame = event.senderFrame
      calls.push({
        url: frame?.url ?? null,
        origin: frame?.origin ?? null,
        childFrame: Boolean(frame?.parent),
      })
      return original(event, ...args)
    })
  }, IpcChannel.versions)
}

async function versionSenders(app: ElectronApplication): Promise<SenderSnapshot[]> {
  return app.evaluate(() => {
    const calls = (global as unknown as Record<string, SenderSnapshot[] | undefined>)[
      '__agentequeAdvE09'
    ]
    return calls ?? []
  })
}

it('a foreign iframe must not receive app:versions', async () => {
  const { serverOrigin, page } = await openApp()
  const trusted = await probeOwnVersions(page)
  expect(isVersionPayload(trusted.versions)).toBe(true)

  const frame = await attachHostileFrame(page, `${serverOrigin}/frame`)
  expect(frame.parentFrame()).not.toBeNull()
  const own = await probeOwnVersions(frame)
  const parent = await probeParentVersions(frame)
  expect(isVersionPayload(own.versions), JSON.stringify(own)).toBe(false)
  expect(isVersionPayload(parent.versions), JSON.stringify(parent)).toBe(false)
})

// The versions handler ignores senderFrame. After a top-level navigation the preload
// still exposes window.api, so this assertion fails until untrusted origins are rejected.
it.fails(
  'ADV-E09 a foreign origin must not receive app:versions after navigation',
  { meta: ADV_E09 },
  async () => {
    const { serverOrigin, launched, page } = await openApp()
    await watchVersionSenders(launched.app)
    const trusted = await probeOwnVersions(page)
    expect(isVersionPayload(trusted.versions)).toBe(true)

    await page.evaluate((next: string) => {
      ;(globalThis as unknown as { location: { assign(url: string): void } }).location.assign(next)
    }, `${serverOrigin}/nav`)

    let navigated = false
    try {
      await page.waitForURL((url) => url.origin === serverOrigin, { timeout: 10_000 })
      navigated = true
      await page.waitForLoadState('domcontentloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Timeout')) throw error
    }

    const foreign = navigated
      ? await probeOwnVersions(page)
      : { exposed: false, versions: null, error: null }
    const senders = navigated ? await versionSenders(launched.app) : []
    expect(
      isVersionPayload(foreign.versions),
      `ADV-E09 ${page.url()} payload=${JSON.stringify(foreign)} senders=${JSON.stringify(senders)}`,
    ).toBe(false)
  },
)
