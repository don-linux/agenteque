import { expect, it } from 'vitest'
import { launchApp, launchPackagedApp, startHostileServer } from '../helpers/electron'

it('launches the built app, the packaged app, and a hostile origin', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'hostile-ok',
  }))
  const response = await fetch(`${server.origin}/probe`)
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('hostile-ok')
  expect(server.requests.map((request) => request.url)).toEqual(['/probe'])
  await server.close()

  const built = await launchApp()
  if (!built.window) throw new Error('built app did not open a window')
  await built.window.locator('h1').waitFor()
  expect(await built.window.locator('h1').textContent()).toBe('agenteque')
  await built.close()

  const packaged = await launchPackagedApp()
  if (!packaged.window) throw new Error('packaged app did not open a window')
  await packaged.window.locator('h1').waitFor()
  expect(await packaged.window.locator('h1').textContent()).toBe('agenteque')
  await packaged.close()
})
