import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchApp, type LaunchedElectronApp } from '../helpers/electron'

let launched: LaunchedElectronApp | undefined
let initialUrl = ''
let initialTitle = ''

beforeAll(async () => {
  const app = await launchApp()
  launched = app
  if (!app.window) throw new Error('app did not open a window')
  await app.window.locator('h1').waitFor()
  initialUrl = app.window.url()
  initialTitle = await app.window.title()
  await app.app.evaluate(({ shell }) => {
    const opened: string[] = []
    const bucket = globalThis as unknown as { advE01Opened?: string[] }
    bucket.advE01Opened = opened
    shell.openExternal = (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  })
})

afterAll(async () => {
  await launched?.close()
})

function appWindow(): NonNullable<LaunchedElectronApp['window']> {
  if (!launched?.window) throw new Error('app did not open a window')
  return launched.window
}

async function openUrl(url: string): Promise<{ opened: string[]; flag: string | null }> {
  const page = appWindow()
  await page.evaluate((target) => {
    const view = globalThis as unknown as {
      advE01?: string
      open: (next: string) => unknown
    }
    view.advE01 = 'unset'
    view.open(target)
  }, url)

  if (!launched) throw new Error('app did not open a window')
  const opened = await launched.app.evaluate(() => {
    const bucket = globalThis as unknown as { advE01Opened?: string[] }
    const list = bucket.advE01Opened ?? []
    return list.splice(0, list.length)
  })

  const flag = await page.evaluate(() => {
    const view = globalThis as unknown as { advE01?: string }
    return view.advE01 ?? null
  })
  return { opened, flag }
}

function expectOnlyWeb(opened: readonly string[]): void {
  for (const url of opened) {
    const protocol = new URL(url).protocol
    expect(protocol === 'http:' || protocol === 'https:', url).toBe(true)
  }
}

function expectStillInApp(): void {
  if (!launched) throw new Error('app did not open a window')
  expect(launched.app.windows()).toHaveLength(1)
  expect(appWindow().url()).toBe(initialUrl)
}

async function expectTitleUnchanged(): Promise<void> {
  expect(await appWindow().title()).toBe(initialTitle)
}

it('hands https URLs to openExternal', async () => {
  const { opened, flag } = await openUrl('https://example.com/adv-e01')
  expect(opened).toEqual(['https://example.com/adv-e01'])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('hands http URLs to openExternal', async () => {
  const { opened, flag } = await openUrl('http://127.0.0.1/adv-e01')
  expect(opened).toEqual(['http://127.0.0.1/adv-e01'])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('does not hand javascript: to openExternal', async () => {
  const { opened, flag } = await openUrl("javascript:document.title='adv-e01';window.advE01='ran'")
  expect(opened).toEqual([])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('does not hand file: to openExternal', async () => {
  const { opened, flag } = await openUrl('file:///etc/passwd')
  expect(opened).toEqual([])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('does not hand data: to openExternal', async () => {
  const { opened, flag } = await openUrl('data:text/html,adv-e01')
  expect(opened).toEqual([])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('does not hand vbscript: to openExternal', async () => {
  const { opened, flag } = await openUrl('vbscript:msgbox(1)')
  expect(opened).toEqual([])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('does not hand custom schemes to openExternal', async () => {
  const { opened, flag } = await openUrl('custom:payload')
  expect(opened).toEqual([])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})

it('hands uppercase HTTPS:// to openExternal only as https', async () => {
  const { opened, flag } = await openUrl('HTTPS://example.com/adv-e01')
  expect(opened).toEqual(['https://example.com/adv-e01'])
  expectOnlyWeb(opened)
  expect(flag).toBe('unset')
  expectStillInApp()
  await expectTitleUnchanged()
})
