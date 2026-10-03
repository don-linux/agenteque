import { expect, it } from 'vitest'
import App from '../../../src/renderer/src/App.svelte'
import { type MountedComponent, mountComponent } from '../helpers/svelte'

/**
 * `app:renderer-ready` means the renderer mounted. It must not wait on
 * `getVersions`: a rejected or stalled versions IPC drops the signal today.
 */
function pendingForever(): Promise<never> {
  return new Promise<never>(() => {
    // Versions IPC never settles. Readiness must not wait on it.
  })
}

function captureUnhandledRejections(): { reasons: unknown[]; stop: () => void } {
  const reasons: unknown[] = []
  const onRejection = (reason: unknown): void => {
    reasons.push(reason)
  }
  process.on('unhandledRejection', onRejection)
  return {
    reasons,
    stop: () => {
      process.off('unhandledRejection', onRejection)
    },
  }
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function finish(mounted: MountedComponent, stop: () => void): Promise<void> {
  try {
    await mounted.unmount()
  } finally {
    await nextTurn()
    stop()
  }
}

it('ADV-S01 calls notifyRendererReady when getVersions rejects', async () => {
  const unhandled = captureUnhandledRejections()
  let ready = 0
  const mounted = await mountComponent(App, {
    api: {
      getVersions: () => Promise.reject(new Error('versions unavailable')),
      notifyRendererReady: () => {
        ready += 1
      },
    },
  })

  try {
    await nextTurn()
    expect(ready).toBe(1)
    expect(unhandled.reasons).toEqual([])
    expect(mounted.window.document.querySelector('.versions ul')).toBeNull()
  } finally {
    await finish(mounted, unhandled.stop)
  }
})

it('ADV-S01 calls notifyRendererReady when getVersions never resolves', async () => {
  const unhandled = captureUnhandledRejections()
  let ready = 0
  const mounted = await mountComponent(App, {
    api: {
      getVersions: pendingForever,
      notifyRendererReady: () => {
        ready += 1
      },
    },
  })

  try {
    await nextTurn()
    expect(ready).toBe(1)
    expect(unhandled.reasons).toEqual([])
    expect(mounted.window.document.body.textContent).toContain('Loading')
    expect(mounted.window.document.querySelector('.versions ul')).toBeNull()
  } finally {
    await finish(mounted, unhandled.stop)
  }
})
