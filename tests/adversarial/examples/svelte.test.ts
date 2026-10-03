import { expect, it } from 'vitest'
import App from '../../../src/renderer/src/App.svelte'
import BrowserSection from '../../../src/renderer/src/lib/screens/settings/BrowserSection.svelte'
import { mountComponent } from '../helpers/svelte'

it('mounts App against a fake window.api', async () => {
  let ready = 0
  const mounted = await mountComponent(App, {
    api: {
      platform: 'linux',
      getVersions: () => Promise.resolve({ app: '9.9.9', electron: '1', chrome: '2', node: '3' }),
      notifyRendererReady: () => {
        ready += 1
      },
    },
  })

  expect(mounted.window.document.body.textContent).toContain('agenteque')
  expect(ready).toBe(1)
  await mounted.unmount()
})

it('mounts the versions panel against a fake window.api', async () => {
  const mounted = await mountComponent(BrowserSection, {
    api: {
      getVersions: () => Promise.resolve({ app: '9.9.9', electron: '1', chrome: '2', node: '3' }),
    },
  })

  await expect.poll(() => mounted.window.document.body.textContent).toContain('9.9.9')
  await mounted.unmount()
})
