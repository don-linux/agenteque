import { expect, it } from 'vitest'
import App from '../../../src/renderer/src/App.svelte'
import { mountComponent, type MountedComponent } from '../helpers/svelte'

const DANGEROUS =
  'img, script, iframe, object, embed, svg, a, form, video, source, link, meta, base'

/**
 * Markup that becomes an element only if the versions view parses HTML.
 * happy-dom does not run `onerror` unless script evaluation is enabled, so the
 * check is the element itself plus the literal string surviving as text.
 */
function markup(label: string): string {
  return [
    `<img src="x" alt="${label}" onerror="globalThis.advS02=1">`,
    `<IMG src="x" onerror="globalThis.advS02=1">`,
    `<script>globalThis.advS02=1</script>`,
    `<svg onload="globalThis.advS02=1"></svg>`,
    `<iframe src="javascript:globalThis.advS02=1"></iframe>`,
    `<a href="javascript:globalThis.advS02=1">${label}</a>`,
    `</code></li></ul></section><img src="x" alt="${label}" onerror="globalThis.advS02=1">`,
    `&lt;img src="x" alt="${label}" onerror="globalThis.advS02=1"&gt;`,
  ].join('')
}

interface SettledVersions {
  mounted: MountedComponent
  readyCount: number
  renderError: unknown
}

/**
 * `notifyRendererReady` runs on mount, before versions exist. Counting that
 * call must not flush: the payload is not assigned yet. After it resolves,
 * flush here so a render throw stays on this stack.
 */
async function settleVersions(payload: unknown): Promise<SettledVersions> {
  let readyCount = 0
  let renderError: unknown
  let resolveVersions!: (value: unknown) => void
  const mounted = await mountComponent(App, {
    api: {
      getVersions: () =>
        new Promise((resolve) => {
          resolveVersions = resolve
        }),
      notifyRendererReady: () => {
        readyCount += 1
      },
    },
  })

  resolveVersions(payload)
  await Promise.resolve()
  try {
    mounted.flush()
  } catch (error) {
    renderError = error
  }
  return { mounted, readyCount, renderError }
}

function assertNoActiveMarkup(mounted: MountedComponent, raw: string): void {
  const document = mounted.window.document
  const text = document.body.textContent ?? ''
  expect(document.querySelector(DANGEROUS)).toBeNull()
  expect(text.includes(raw)).toBe(true)
  const html = document.body.innerHTML
  expect(html.includes('<img')).toBe(false)
  expect(html.includes('<IMG')).toBe(false)
  expect(html.includes('<script')).toBe(false)
  expect(html.includes('<svg')).toBe(false)
  expect(html.includes('<iframe')).toBe(false)
  expect(html.includes('&lt;img')).toBe(true)
}

function assertShell(mounted: MountedComponent): void {
  const document = mounted.window.document
  expect(document.querySelector('h1')?.textContent).toBe('agenteque')
  const button = document.querySelector('button')
  if (!button) throw new Error('counter button missing')
  expect(button.textContent).toBe('count is 0')
  button.click()
  mounted.flush()
  expect(button.textContent).toBe('count is 1')
}

it('ADV-S02 renders HTML version strings as text', async () => {
  const app = markup('app')
  const electron = markup('electron')
  const chrome = markup('chrome')
  const node = markup('node')
  const { mounted, readyCount, renderError } = await settleVersions({ app, electron, chrome, node })

  expect(renderError).toBeUndefined()
  expect(readyCount).toBe(1)
  assertNoActiveMarkup(mounted, app)
  assertNoActiveMarkup(mounted, electron)
  assertNoActiveMarkup(mounted, chrome)
  assertNoActiveMarkup(mounted, node)
  assertShell(mounted)
  await mounted.unmount()
})

it('ADV-S02 renders a huge version string as text', async () => {
  const marker = 'ADV-S02-HUGE-END'
  const embedded = markup('huge')
  const huge = `${embedded}${'A'.repeat(1_048_576)}${marker}`
  const { mounted, readyCount, renderError } = await settleVersions({
    app: huge,
    electron: '1',
    chrome: '2',
    node: '3',
  })

  expect(renderError).toBeUndefined()
  expect(readyCount).toBe(1)
  const text = mounted.window.document.body.textContent ?? ''
  expect(text.includes(marker)).toBe(true)
  expect(text.includes(embedded)).toBe(true)
  expect(text.length > 1_048_576).toBe(true)
  expect(mounted.window.document.querySelector(DANGEROUS)).toBeNull()
  const html = mounted.window.document.body.innerHTML
  expect(html.includes('<img')).toBe(false)
  expect(html.includes('&lt;img')).toBe(true)
  assertShell(mounted)
  await mounted.unmount()
})

it('ADV-S02 renders hostile getters and toString as text', async () => {
  const fromGetter = markup('getter')
  const fromToString = markup('toString')
  const fromPrimitive = markup('primitive')
  const fromInherited = markup('inherited')
  const fromArray = markup('array')
  const fromClass = markup('class')
  const fromNullProto = markup('nullproto')
  const fromNested = markup('nested')
  let getterReads = 0
  let toStringReads = 0

  const inherited = Object.create({
    get app(): string {
      return fromInherited
    },
  }) as Record<string, unknown>
  inherited.electron = '1'
  inherited.chrome = '2'
  inherited.node = '3'

  const nullProto = Object.create(null) as Record<string, unknown>
  Object.defineProperty(nullProto, 'app', {
    enumerable: true,
    get: () => fromNullProto,
  })
  nullProto.electron = '1'
  nullProto.chrome = '2'
  nullProto.node = '3'

  class HostileVersions {
    get app(): string {
      return fromClass
    }
    electron = '1'
    chrome = '2'
    node = '3'
  }

  const cases: Array<{ payload: unknown; text: string }> = [
    {
      text: fromGetter,
      payload: {
        get app(): string {
          getterReads += 1
          return fromGetter
        },
        get electron(): string {
          return 'electron'
        },
        get chrome(): string {
          return 'chrome'
        },
        get node(): string {
          return 'node'
        },
      },
    },
    {
      text: fromToString,
      payload: {
        app: {
          toString(): string {
            toStringReads += 1
            return fromToString
          },
        },
        electron: '1',
        chrome: '2',
        node: '3',
      },
    },
    {
      text: fromPrimitive,
      payload: {
        app: {
          [Symbol.toPrimitive](): string {
            return fromPrimitive
          },
        },
        electron: '1',
        chrome: '2',
        node: '3',
      },
    },
    { text: fromInherited, payload: inherited },
    { text: fromArray, payload: { app: [fromArray], electron: '1', chrome: '2', node: '3' } },
    { text: fromClass, payload: new HostileVersions() },
    { text: fromNullProto, payload: nullProto },
    {
      text: fromNested,
      payload: {
        get app(): { toString(): string } {
          return {
            toString(): string {
              return fromNested
            },
          }
        },
        electron: '1',
        chrome: '2',
        node: '3',
      },
    },
  ]

  for (const { payload, text } of cases) {
    const { mounted, readyCount, renderError } = await settleVersions(payload)
    expect(renderError).toBeUndefined()
    expect(readyCount).toBe(1)
    assertNoActiveMarkup(mounted, text)
    assertShell(mounted)
    await mounted.unmount()
  }

  expect(getterReads).toBeGreaterThan(0)
  expect(toStringReads).toBeGreaterThan(0)
})

// Throwing getters and toString escape the text interpolation as an uncaught render error.
it.fails('ADV-S02', async () => {
  const throwingGetter = {
    get app(): string {
      throw new Error('hostile getter')
    },
    electron: '1',
    chrome: '2',
    node: '3',
  }
  const throwingToString = {
    app: {
      toString(): string {
        throw new Error('hostile toString')
      },
    },
    electron: '1',
    chrome: '2',
    node: '3',
  }
  const nonPrimitive = {
    app: {
      toString(): object {
        return {}
      },
      valueOf(): object {
        return {}
      },
    },
    electron: '1',
    chrome: '2',
    node: '3',
  }
  const throwingPrimitive = {
    app: {
      [Symbol.toPrimitive](): string {
        throw new Error('hostile toPrimitive')
      },
    },
    electron: '1',
    chrome: '2',
    node: '3',
  }
  const throwingNested = {
    get app(): { toString(): string } {
      return {
        toString(): string {
          throw new Error('hostile nested toString')
        },
      }
    },
    electron: '1',
    chrome: '2',
    node: '3',
  }
  const nullProto = Object.create(null) as Record<string, unknown>
  Object.defineProperty(nullProto, 'app', {
    enumerable: true,
    get(): string {
      throw new Error('hostile null-proto getter')
    },
  })
  nullProto.electron = '1'
  nullProto.chrome = '2'
  nullProto.node = '3'

  for (const payload of [
    throwingGetter,
    throwingToString,
    nonPrimitive,
    throwingPrimitive,
    throwingNested,
    nullProto,
  ]) {
    const { mounted, readyCount, renderError } = await settleVersions(payload)
    expect(renderError, 'versions render threw').toBeUndefined()
    expect(readyCount).toBe(1)
    expect(mounted.window.document.querySelector(DANGEROUS)).toBeNull()
    assertShell(mounted)
    await mounted.unmount()
  }
})
