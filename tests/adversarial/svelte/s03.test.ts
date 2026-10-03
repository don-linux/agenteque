import { compile } from 'svelte/compiler'
import { writable } from 'svelte/store'
import { expect, it } from 'vitest'
// svelte/internal/client is the compiler runtime and ships without type declarations.
// @ts-expect-error TS7016
import * as clientRuntime from 'svelte/internal/client'
import App from '../../../src/renderer/src/App.svelte'
import type { AppVersions } from '../../../src/shared/ipc'
import { mountComponent } from '../helpers/svelte'

const versions: AppVersions = { app: '9.9.9', electron: '1', chrome: '2', node: '3' }

/**
 * Parent that mounts `Child` while `visible` is true.
 * Dropping `visible` unmounts App and leaves `window.api` in place, matching the
 * preload bridge, which outlives the component.
 */
const gateSource = `<script>
  let { visible, Child } = $props()
</script>
{#if $visible}
  <Child />
{/if}
`

const compiledGate = compile(gateSource, {
  filename: 'Gate.svelte',
  generate: 'client',
  dev: false,
})

type Mountable = Parameters<typeof mountComponent>[0]

function unresolvedVersions(_value: AppVersions): void {
  throw new Error('getVersions resolved before it was called')
}

function loadGate(runtime: object): Mountable {
  const body = compiledGate.js.code
    .replace("import 'svelte/internal/disclose-version';", '')
    .replace("import * as $ from 'svelte/internal/client';", '')
    .replace('export default function Gate', 'function Gate')
  const factory = new Function('$', `${body}\nreturn Gate;`) as (runtime: object) => Mountable
  return factory(runtime)
}

const Gate = loadGate(clientRuntime)

function deferredVersions(): {
  promise: Promise<AppVersions>
  resolve: (value: AppVersions) => void
} {
  let resolve: (value: AppVersions) => void = unresolvedVersions
  const promise = new Promise<AppVersions>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

it('signals renderer ready on mount while getVersions is still pending', async () => {
  const pending = deferredVersions()
  const calls: string[] = []
  const mounted = await mountComponent(App, {
    api: {
      getVersions: () => {
        calls.push('getVersions')
        return pending.promise
      },
      notifyRendererReady: () => {
        calls.push('notifyRendererReady')
      },
    },
  })

  try {
    expect(calls).toEqual(['notifyRendererReady', 'getVersions'])
    expect(mounted.target.textContent).toContain('Loading')
    expect(mounted.target.textContent).not.toContain('9.9.9')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(['notifyRendererReady', 'getVersions'])
    expect(mounted.target.textContent).toContain('Loading')
    expect(mounted.target.textContent).not.toContain('9.9.9')

    pending.resolve(versions)
    await expect.poll(() => mounted.target.textContent).toContain('9.9.9')
    expect(mounted.target.textContent).not.toContain('Loading')
    expect(calls.filter((call) => call === 'notifyRendererReady')).toEqual(['notifyRendererReady'])
  } finally {
    await mounted.unmount()
  }
})

it('ADV-S03 does not render versions or signal ready again after unmount', async () => {
  const pending = deferredVersions()
  const visible = writable(true)
  let ready = 0
  const mounted = await mountComponent(Gate, {
    props: { visible, Child: App },
    api: {
      getVersions: () => pending.promise,
      notifyRendererReady: () => {
        ready += 1
      },
    },
  })

  try {
    expect(mounted.target.textContent).toContain('Loading')
    expect(ready).toBe(1)

    visible.set(false)
    mounted.flush()
    expect(mounted.target.textContent).not.toContain('agenteque')
    expect(ready).toBe(1)

    pending.resolve(versions)
    await new Promise((resolve) => setTimeout(resolve, 0))
    mounted.flush()
    expect(mounted.target.textContent).not.toContain('9.9.9')
    expect(ready).toBe(1)
  } finally {
    await mounted.unmount()
  }
})
