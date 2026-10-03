/**
 * ADV-E02. `window.open` must not hand shell.openExternal credential URLs, huge
 * URLs, or IDN/homoglyph hosts, and a 1000-call burst must not fan out into 1000
 * external opens. Cases the app still gets wrong are `it.fails` so the suite stays
 * green until the handler is fixed.
 */
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import { launchApp } from '../helpers/electron'

const BURST_COUNT = 1000
const BURST_TIMEOUT_MS = 10_000
const BURST_WAIT_MS = BURST_TIMEOUT_MS + 2_000
const MAX_SAFE_URL_LENGTH = 2048
const HUGE_PATH_LENGTH = 100_000

const CREDENTIAL_URLS = [
  'http://user:pass@127.0.0.1/adv-e02',
  'https://user:pass@127.0.0.1/adv-e02',
] as const

/** Cyrillic а (U+0430) and о (U+043E). Chromium delivers the punycode host. */
const HOMOGLYPH_URLS = ['http://ex\u0430mple.com/login', 'http://g\u043eogle.com/'] as const

interface RecordingSession {
  app: ElectronApplication
  page: Page
  close: () => Promise<void>
}

async function launchRecordingApp(): Promise<RecordingSession> {
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('app did not open a window')
  await page.locator('h1').waitFor()
  await installOpenExternalStub(launched.app)
  return {
    app: launched.app,
    page,
    close: () => launched.close(),
  }
}

async function installOpenExternalStub(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const recorded: string[] = []
    ;(globalThis as { advE02Opens?: string[] }).advE02Opens = recorded
    const target = shell as { openExternal: (url: string) => Promise<void> }
    target.openExternal = (url: string) => {
      recorded.push(url)
      return Promise.resolve()
    }
  })
}

function recordedOpens(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as { advE02Opens?: string[] }).advE02Opens ?? [])
}

function openUrl(page: Page, url: string): Promise<void> {
  return page.evaluate((target: string) => {
    const open = (globalThis as { open?: (next: string) => unknown }).open
    if (!open) throw new Error('window.open is unavailable')
    open(target)
  }, url)
}

function hasCredentials(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.username !== '' || parsed.password !== ''
  } catch {
    return false
  }
}

function rawHost(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url)
  return match?.[1] ?? ''
}

function forwardsHomoglyph(opens: readonly string[], unicodeUrl: string): boolean {
  const punycodeHost = new URL(unicodeUrl).hostname
  const unicodeHost = rawHost(unicodeUrl)
  return opens.some((opened) => opened.includes(punycodeHost) || opened.includes(unicodeHost))
}

async function openBurst(page: Page): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const attempted = page.evaluate(
    (limits: { count: number; timeoutMs: number }) => {
      const open = (globalThis as { open?: (next: string) => unknown }).open
      if (!open) throw new Error('window.open is unavailable')
      const started = Date.now()
      let count = 0
      for (let index = 0; index < limits.count; index += 1) {
        if (Date.now() - started > limits.timeoutMs) break
        open(`http://127.0.0.1/adv-e02/${index}`)
        count += 1
      }
      return count
    },
    { count: BURST_COUNT, timeoutMs: BURST_TIMEOUT_MS },
  )
  // If the wait below wins, the in-flight evaluate must not surface later as unhandled.
  void attempted.then(
    () => undefined,
    () => undefined,
  )
  try {
    return await Promise.race([
      attempted,
      new Promise<number>((resolve) => {
        timer = setTimeout(() => resolve(-1), BURST_WAIT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

it.fails('ADV-E02 does not forward http credentials to shell.openExternal', async () => {
  const session = await launchRecordingApp()
  try {
    for (const url of CREDENTIAL_URLS) await openUrl(session.page, url)
    const opens = await recordedOpens(session.app)
    expect(opens.some(hasCredentials)).toBe(false)
  } finally {
    await session.close()
  }
})

it.fails('ADV-E02 does not forward huge URLs to shell.openExternal', async () => {
  const session = await launchRecordingApp()
  try {
    await openUrl(session.page, `http://127.0.0.1/${'A'.repeat(HUGE_PATH_LENGTH)}`)
    const opens = await recordedOpens(session.app)
    let longest = 0
    for (const url of opens) longest = Math.max(longest, url.length)
    expect(longest).toBeLessThanOrEqual(MAX_SAFE_URL_LENGTH)
  } finally {
    await session.close()
  }
})

it.fails('ADV-E02 does not open IDN homoglyph hosts externally', async () => {
  const session = await launchRecordingApp()
  try {
    for (const url of HOMOGLYPH_URLS) await openUrl(session.page, url)
    const opens = await recordedOpens(session.app)
    const punycodeHosts = HOMOGLYPH_URLS.map((url) => new URL(url).hostname)
    expect(punycodeHosts.every((host) => host.startsWith('xn--'))).toBe(true)
    expect(HOMOGLYPH_URLS.some((url) => forwardsHomoglyph(opens, url))).toBe(false)
  } finally {
    await session.close()
  }
})

it.fails('ADV-E02 cannot fan a 1000-call window.open burst out into 1000 external opens', async () => {
  const session = await launchRecordingApp()
  try {
    const attempted = await openBurst(session.page)
    const opens = await recordedOpens(session.app)
    const flood = opens.filter((url) => url.startsWith('http://127.0.0.1/adv-e02/'))
    expect(attempted).toBe(BURST_COUNT)
    expect(flood.length, `openExternal flood count ${flood.length} of ${attempted}`).toBeLessThan(
      BURST_COUNT,
    )
  } finally {
    await session.close()
  }
})
