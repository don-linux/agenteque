import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import Counter from '../../../src/renderer/src/lib/Counter.svelte'
import { type FakeApi, type MountedComponent, mountComponent } from '../helpers/svelte'

const BOOTSTRAP = '../../../src/renderer/src/main.ts'

interface Calls {
  versions: number
  ready: number
}

interface Boot {
  flush(): void
  unmount(): Promise<void>
}

const calls: Calls = { versions: 0, ready: 0 }

const api: FakeApi = {
  getVersions: () => {
    calls.versions += 1
    return Promise.resolve({ app: '9.9.9', electron: '1', chrome: '2', node: '3' })
  },
  notifyRendererReady: () => {
    calls.ready += 1
  },
}

let dom: MountedComponent | undefined
const mountedApps: Boot[] = []

async function settleMountedApps(): Promise<void> {
  const apps = mountedApps.splice(0)
  await Promise.all(apps.map((app) => app.unmount()))
}

beforeAll(async () => {
  dom = await mountComponent(Counter, { api })
})

beforeEach(async () => {
  await settleMountedApps()
  calls.versions = 0
  calls.ready = 0
  dom?.window.document.body.replaceChildren()
})

afterAll(async () => {
  await settleMountedApps()
  await dom?.unmount()
})

function documentOf(): MountedComponent['window']['document'] {
  if (!dom) throw new Error('happy-dom window is not open')
  return dom.window.document
}

async function bootApp(): Promise<Boot> {
  vi.resetModules()
  const imported = (await import(BOOTSTRAP)) as { default: Record<string, unknown> }
  const svelte = await import('svelte')
  const component = imported.default
  let cleaned = false
  const boot: Boot = {
    flush: () => {
      svelte.flushSync()
    },
    unmount: async () => {
      if (cleaned) return
      cleaned = true
      await svelte.unmount(component)
    },
  }
  mountedApps.push(boot)
  return boot
}

it('does not mount or call the bridge when #app is missing', async () => {
  const doc = documentOf()

  await expect(bootApp()).rejects.toThrow('#app element not found')

  expect(calls.versions).toBe(0)
  expect(calls.ready).toBe(0)
  expect(doc.body.textContent).toBe('')
  expect(doc.querySelector('h1')).toBeNull()
})

it('ADV-S04 rejects a duplicate #app before mount', async () => {
  const doc = documentOf()
  const decoy = doc.createElement('div')
  decoy.id = 'app'
  const real = doc.createElement('div')
  real.id = 'app'
  doc.body.append(decoy, real)
  expect(doc.querySelectorAll('#app')).toHaveLength(2)

  await expect(bootApp()).rejects.toThrow('#app element not found')

  expect(calls.versions).toBe(0)
  expect(calls.ready).toBe(0)
  expect(decoy.querySelector('h1')).toBeNull()
  expect(real.querySelector('h1')).toBeNull()
  expect(doc.querySelectorAll('h1')).toHaveLength(0)
})

it('ADV-S04 does not mount a second app into the same document', async () => {
  const doc = documentOf()
  const target = doc.createElement('div')
  target.id = 'app'
  doc.body.append(target)

  const first = await bootApp()
  first.flush()
  await expect.poll(() => calls.ready).toBe(1)
  expect(calls.versions).toBe(1)
  expect(target.querySelectorAll('h1')).toHaveLength(1)
  expect(target.textContent).toContain('agenteque')
  expect(target.textContent).toContain('9.9.9')

  // resetModules drops module state, same as an HMR invalidation of main.ts.
  // A second evaluation must not stack another App or another renderer-ready.
  await expect(bootApp()).rejects.toThrow('renderer already mounted')

  expect(doc.querySelectorAll('h1')).toHaveLength(1)
  expect(calls.versions).toBe(1)
  expect(calls.ready).toBe(1)
  expect(target.textContent).toContain('9.9.9')
})
