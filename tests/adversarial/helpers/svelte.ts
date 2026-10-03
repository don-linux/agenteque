/**
 * Public exports:
 * - mountComponent
 *
 * Types: FakeApi, MountComponentOptions, MountedComponent.
 */
import { Window } from 'happy-dom'
import { flushSync, mount, unmount } from 'svelte'
import { onTestFinished } from 'vitest'

const DOM_GLOBALS = [
  'document',
  'navigator',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Text',
  'Comment',
  'CharacterData',
  'DocumentFragment',
  'Document',
  'MutationObserver',
  'customElements',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'InputEvent',
  'FocusEvent',
  'EventTarget',
  'NodeFilter',
  'DOMParser',
  'Range',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLMediaElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLOptionElement',
  'HTMLLabelElement',
  'HTMLUListElement',
  'HTMLAnchorElement',
  'HTMLFormElement',
  'HTMLImageElement',
  'HTMLIFrameElement',
  'HTMLTemplateElement',
  'HTMLStyleElement',
  'HTMLDivElement',
  'ShadowRoot',
  'CSSStyleSheet',
] as const

const BOUND_METHODS = ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'] as const

/**
 * Stand-in for `window.api`. Methods may reject, hang, or return hostile values.
 * Assigned before `mount`.
 */
export interface FakeApi {
  platform?: string
  getVersions?: () => unknown
  notifyRendererReady?: () => void
}

export interface MountComponentOptions {
  /** Passed through to Svelte `mount`. */
  props?: Record<string, unknown>
  api?: FakeApi
  /** Initial `innerHTML` of the mount target. */
  html?: string
}

export interface MountedComponent {
  /** happy-dom window. Torn down by `unmount`. */
  window: Window & { api: FakeApi }
  /** Node passed to Svelte as `target`. */
  target: ReturnType<Window['document']['createElement']>
  api: FakeApi
  /**
   * Run Svelte `flushSync`. `mountComponent` already flushes once, which starts
   * `onMount`. Async work after that is not awaited: a `getVersions` that never
   * resolves must not hang the helper.
   */
  flush(): void
  unmount(): Promise<void>
}

/**
 * Mount a Svelte 5 component on a fresh happy-dom window.
 * The vitest project stays on the Node environment. Call `unmount` when finished;
 * the test-finished hook does it too.
 */
export async function mountComponent(
  component: Parameters<typeof mount>[0],
  options?: MountComponentOptions,
): Promise<MountedComponent> {
  const window = new Window({ url: 'http://127.0.0.1/', width: 1024, height: 768 })
  const restore = installDom(window)
  const api: FakeApi = options?.api ?? {}
  const testWindow = window as Window & { api: FakeApi }
  testWindow.api = api

  try {
    const target = window.document.createElement('div')
    target.id = 'app'
    if (options?.html !== undefined) target.innerHTML = options.html
    window.document.body.appendChild(target)

    const instance = mount(component, {
      target: target as unknown as Parameters<typeof mount>[1]['target'],
      props: options?.props as never,
    })
    flushSync()

    let cleaned = false
    const unmountComponent = async (): Promise<void> => {
      if (cleaned) return
      cleaned = true
      try {
        await unmount(instance)
      } finally {
        restore()
        await window.happyDOM.close()
      }
    }
    registerCleanup(unmountComponent)

    return {
      window: testWindow,
      target,
      api,
      flush: () => flushSync(),
      unmount: unmountComponent,
    }
  } catch (error) {
    restore()
    await window.happyDOM.close()
    throw error
  }
}

function installDom(window: Window): () => void {
  const globalRecord = globalThis as Record<string, unknown>
  const previous = new Map<string, PropertyDescriptor | undefined>()
  const assign = (key: string, value: unknown): void => {
    if (previous.has(key)) return
    previous.set(key, Object.getOwnPropertyDescriptor(globalRecord, key))
    Object.defineProperty(globalRecord, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
  }

  assign('window', window)
  const dom = window as unknown as Record<string, unknown>
  for (const key of DOM_GLOBALS) assign(key, dom[key])
  for (const key of BOUND_METHODS) {
    const value = dom[key]
    assign(key, typeof value === 'function' ? value.bind(window) : value)
  }

  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalRecord, key, descriptor)
      else delete globalRecord[key]
    }
  }
}

function registerCleanup(cleanup: () => Promise<void>): void {
  try {
    onTestFinished(cleanup)
  } catch {
    // Called outside a test. The caller runs unmount().
  }
}
