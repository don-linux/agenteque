import { expect, it } from 'vitest'
import BrowserSection from '../../../src/renderer/src/lib/screens/settings/BrowserSection.svelte'
import { mountComponent, type MountedComponent } from '../helpers/svelte'

const DANGEROUS =
  'img, script, iframe, object, embed, svg, a, form, video, source, link, meta, base'

const UNAVAILABLE = 'No se pudieron leer las versiones'

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

interface Settled {
  mounted: MountedComponent
  renderError: unknown
}

/**
 * The settings section reads `app:versions` on mount. Resolve the payload after
 * mounting and flush here, so a render throw stays on this stack.
 */
async function settleVersions(payload: unknown): Promise<Settled> {
  let renderError: unknown
  let resolveVersions!: (value: unknown) => void
  const mounted = await mountComponent(BrowserSection, {
    api: {
      getVersions: () =>
        new Promise((resolve) => {
          resolveVersions = resolve
        }),
    },
  })

  resolveVersions(payload)
  await Promise.resolve()
  await Promise.resolve()
  try {
    mounted.flush()
  } catch (error) {
    renderError = error
  }
  return { mounted, renderError }
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

function assertSection(mounted: MountedComponent): void {
  expect(mounted.window.document.querySelector('h2')?.textContent).toBe('Navegador')
}

it('ADV-S02 renders HTML version strings as text', async () => {
  const app = markup('app')
  const electron = markup('electron')
  const chrome = markup('chrome')
  const node = markup('node')
  const { mounted, renderError } = await settleVersions({ app, electron, chrome, node })

  expect(renderError).toBeUndefined()
  assertNoActiveMarkup(mounted, app)
  assertNoActiveMarkup(mounted, electron)
  assertNoActiveMarkup(mounted, chrome)
  assertNoActiveMarkup(mounted, node)
  assertSection(mounted)
  await mounted.unmount()
})

it('ADV-S02 renders a huge version string as text', async () => {
  const marker = 'ADV-S02-HUGE-END'
  const embedded = markup('huge')
  const huge = `${embedded}${'A'.repeat(1_048_576)}${marker}`
  const { mounted, renderError } = await settleVersions({
    app: huge,
    electron: '1',
    chrome: '2',
    node: '3',
  })

  expect(renderError).toBeUndefined()
  const text = mounted.window.document.body.textContent ?? ''
  expect(text.includes(marker)).toBe(true)
  expect(text.includes(embedded)).toBe(true)
  expect(text.length > 1_048_576).toBe(true)
  expect(mounted.window.document.querySelector(DANGEROUS)).toBeNull()
  const html = mounted.window.document.body.innerHTML
  expect(html.includes('<img')).toBe(false)
  expect(html.includes('&lt;img')).toBe(true)
  assertSection(mounted)
  await mounted.unmount()
})

it('ADV-S02 renders a hostile string reached through a getter as text', async () => {
  const fromGetter = markup('getter')
  const fromInherited = markup('inherited')
  const fromClass = markup('class')
  const fromNullProto = markup('nullproto')
  let getterReads = 0

  const inherited = Object.create({
    get app(): string {
      return fromInherited
    },
  }) as Record<string, unknown>
  inherited.electron = '1'
  inherited.chrome = '2'
  inherited.node = '3'

  const nullProto = Object.create(null) as Record<string, unknown>
  Object.defineProperty(nullProto, 'app', { enumerable: true, get: () => fromNullProto })
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
    { text: fromInherited, payload: inherited },
    { text: fromClass, payload: new HostileVersions() },
    { text: fromNullProto, payload: nullProto },
  ]

  for (const { payload, text } of cases) {
    const { mounted, renderError } = await settleVersions(payload)
    expect(renderError).toBeUndefined()
    assertNoActiveMarkup(mounted, text)
    assertSection(mounted)
    await mounted.unmount()
  }

  expect(getterReads).toBeGreaterThan(0)
})

/**
 * Anything that is not a plain string is refused before it reaches the
 * template: half a row of garbage reads worse than saying there is no data.
 */
it('ADV-S02 refuses payloads that are not plain strings', async () => {
  const throwingGetter = {
    get app(): string {
      throw new Error('hostile getter')
    },
    electron: '1',
    chrome: '2',
    node: '3',
  }
  const hostileToString = {
    app: {
      toString(): string {
        return markup('toString')
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
  const hostileArray = { app: [markup('array')], electron: '1', chrome: '2', node: '3' }
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
    hostileToString,
    nonPrimitive,
    throwingPrimitive,
    hostileArray,
    nullProto,
    null,
    'nope',
    42,
    [],
  ]) {
    const { mounted, renderError } = await settleVersions(payload)
    expect(renderError, 'versions render threw').toBeUndefined()
    expect(mounted.window.document.querySelector(DANGEROUS)).toBeNull()
    expect(mounted.window.document.body.textContent).toContain(UNAVAILABLE)
    expect(mounted.window.document.querySelector('ul')).toBeNull()
    assertSection(mounted)
    await mounted.unmount()
  }
})
