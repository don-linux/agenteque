/**
 * ADV-E22. Lifecycle of the main process.
 *
 * A second launch must not stay up: the primary holds the single-instance lock,
 * receives `second-instance`, and keeps the one focused window. `activate` opens
 * one sandboxed window when none are open, and does not open another when one is.
 * The last window closing quits the app except on macOS. A crashed renderer is
 * reloaded in that same sandboxed window.
 *
 * `activate` is delivered by the OS on macOS. The handler is still installed on
 * Linux, so the test emits it in the main process.
 */
import { expect, it } from 'vitest'
import { launchApp, type LaunchedElectronApp } from '../helpers/electron'

const SECURE_PREFS = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  nodeIntegrationInSubFrames: false,
}

const PAGE_PROBE = `({
  title: document.querySelector('h1') && document.querySelector('h1').textContent,
  requireType: typeof require,
  processType: typeof process,
  apiType: typeof globalThis.api
})`

const SECOND_LIFE_MS = 3_000
const QUIT_MS = 8_000
const RECOVERY_MS = 5_000

interface PageProbe {
  title: string | null
  requireType: string
  processType: string
  apiType: string
}

/** Electron 44 still implements this; the published types omit it. */
interface PreferenceSource {
  getLastWebPreferences(): {
    contextIsolation?: boolean
    sandbox?: boolean
    nodeIntegration?: boolean
    webviewTag?: boolean
    webSecurity?: boolean
    allowRunningInsecureContent?: boolean
    nodeIntegrationInSubFrames?: boolean
  }
}

interface PreferenceSnapshot {
  contextIsolation: boolean | null
  sandbox: boolean | null
  nodeIntegration: boolean | null
  webviewTag: boolean | null
  webSecurity: boolean | null
  allowRunningInsecureContent: boolean | null
  nodeIntegrationInSubFrames: boolean | null
}

async function waitForExit(
  exited: LaunchedElectronApp['exited'],
  budgetMs: number,
): Promise<number | null | 'running'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      exited,
      new Promise<'running'>((resolve) => {
        timer = setTimeout(() => resolve('running'), budgetMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function crashClass(reason: string | null): string | null {
  if (reason === 'crashed' || reason === 'killed') return 'renderer-gone'
  return reason
}

it('ADV-E22 a second launch exits and the first window stays focused', async () => {
  const primary = await launchApp()
  if (!primary.window) throw new Error('primary window missing')
  await primary.window.locator('h1').waitFor()

  const beforeId = await primary.app.evaluate(({ app, BrowserWindow }) => {
    const seen: string[] = []
    ;(globalThis as { agentequeE22Second?: string[] }).agentequeE22Second = seen
    app.on('second-instance', () => {
      seen.push('second-instance')
    })
    return BrowserWindow.getAllWindows()[0]?.id ?? null
  })

  let secondStayedUp = false
  let launchNote = 'started'
  try {
    const second = await launchApp({ waitForWindow: false, timeout: 20_000 })
    const code = await waitForExit(second.exited, SECOND_LIFE_MS)
    secondStayedUp = code === 'running'
    launchNote = `second exit ${String(code)}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    launchNote = message.slice(0, 400)
    if (!message.includes('has been closed')) throw error
  }

  const observed = await primary.app.evaluate(({ app, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const prefs = win
      ? (win.webContents as unknown as PreferenceSource).getLastWebPreferences()
      : undefined
    const seen = (globalThis as { agentequeE22Second?: string[] }).agentequeE22Second
    return {
      holdsLock: app.hasSingleInstanceLock(),
      secondInstanceEvents: seen?.length ?? 0,
      windows: BrowserWindow.getAllWindows().length,
      windowId: win?.id ?? null,
      focused: win?.isFocused() ?? false,
      visible: win?.isVisible() ?? false,
      minimized: win?.isMinimized() ?? true,
      appPage: win?.webContents.getURL().includes('index.html') ?? false,
      alive: true,
      contextIsolation: prefs?.contextIsolation ?? null,
      sandbox: prefs?.sandbox ?? null,
      nodeIntegration: prefs?.nodeIntegration ?? null,
      webviewTag: prefs?.webviewTag ?? null,
      webSecurity: prefs?.webSecurity ?? null,
      allowRunningInsecureContent: prefs?.allowRunningInsecureContent ?? null,
      nodeIntegrationInSubFrames: prefs?.nodeIntegrationInSubFrames ?? null,
    }
  })

  expect(
    {
      ...observed,
      secondStayedUp,
      primaryAlive: primary.app.process().exitCode === null,
      sameWindow: observed.windowId === beforeId,
    },
    launchNote,
  ).toEqual({
    holdsLock: true,
    secondInstanceEvents: 1,
    windows: 1,
    windowId: beforeId,
    focused: true,
    visible: true,
    minimized: false,
    appPage: true,
    alive: true,
    ...SECURE_PREFS,
    secondStayedUp: false,
    primaryAlive: true,
    sameWindow: true,
  })
})

it('activate does not open another window', async () => {
  const launched = await launchApp()
  if (!launched.window) throw new Error('window missing')
  await launched.window.locator('h1').waitFor()

  const observed = await launched.app.evaluate(({ app, BrowserWindow }) => {
    const before = BrowserWindow.getAllWindows().map((win) => win.id)
    app.emit('activate')
    app.emit('activate')
    const wins = BrowserWindow.getAllWindows()
    const prefs = wins[0]
      ? (wins[0].webContents as unknown as PreferenceSource).getLastWebPreferences()
      : undefined
    return {
      before,
      after: wins.map((win) => win.id),
      appPage: wins[0]?.webContents.getURL().includes('index.html') ?? false,
      contextIsolation: prefs?.contextIsolation ?? null,
      sandbox: prefs?.sandbox ?? null,
      nodeIntegration: prefs?.nodeIntegration ?? null,
      webviewTag: prefs?.webviewTag ?? null,
      webSecurity: prefs?.webSecurity ?? null,
      allowRunningInsecureContent: prefs?.allowRunningInsecureContent ?? null,
      nodeIntegrationInSubFrames: prefs?.nodeIntegrationInSubFrames ?? null,
    }
  })

  expect(observed.after).toEqual(observed.before)
  expect(observed.before).toHaveLength(1)
  expect(observed.appPage).toBe(true)
  expect({
    contextIsolation: observed.contextIsolation,
    sandbox: observed.sandbox,
    nodeIntegration: observed.nodeIntegration,
    webviewTag: observed.webviewTag,
    webSecurity: observed.webSecurity,
    allowRunningInsecureContent: observed.allowRunningInsecureContent,
    nodeIntegrationInSubFrames: observed.nodeIntegrationInSubFrames,
  }).toEqual(SECURE_PREFS)
})

it('activate opens one sandboxed window when none are open', async () => {
  const launched = await launchApp()
  if (!launched.window) throw new Error('window missing')
  await launched.window.locator('h1').waitFor()

  const observed = await launched.app.evaluate(async ({ app, BrowserWindow }, script: string) => {
    const listeners = app.listeners('window-all-closed')
    app.removeAllListeners('window-all-closed')
    try {
      for (const win of BrowserWindow.getAllWindows()) win.destroy()
      const emptied = BrowserWindow.getAllWindows().length
      app.emit('activate')
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return { emptied, count: 0, appPage: false, page: null, prefs: null }
      if (win.webContents.isLoading()) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 5_000)
          win.webContents.once('did-finish-load', () => {
            clearTimeout(timer)
            resolve()
          })
        })
      }
      const page = (await Promise.race([
        win.webContents.executeJavaScript(script),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
      ])) as PageProbe | null
      const prefs = (win.webContents as unknown as PreferenceSource).getLastWebPreferences()
      return {
        emptied,
        count: BrowserWindow.getAllWindows().length,
        appPage: win.webContents.getURL().includes('index.html'),
        page,
        prefs: {
          contextIsolation: prefs.contextIsolation ?? null,
          sandbox: prefs.sandbox ?? null,
          nodeIntegration: prefs.nodeIntegration ?? null,
          webviewTag: prefs.webviewTag ?? null,
          webSecurity: prefs.webSecurity ?? null,
          allowRunningInsecureContent: prefs.allowRunningInsecureContent ?? null,
          nodeIntegrationInSubFrames: prefs.nodeIntegrationInSubFrames ?? null,
        },
      }
    } finally {
      for (const listener of listeners) app.on('window-all-closed', listener as () => void)
    }
  }, PAGE_PROBE)

  expect(observed.emptied).toBe(0)
  expect(observed.count).toBe(1)
  expect(observed.appPage).toBe(true)
  expect(observed.page).toEqual({
    title: 'agenteque',
    requireType: 'undefined',
    processType: 'undefined',
    apiType: 'object',
  })
  expect(observed.prefs).toEqual(SECURE_PREFS)
})

it('quits when the last window closes, except on macOS', async () => {
  const launched = await launchApp()
  if (!launched.window) throw new Error('window missing')
  await launched.window.locator('h1').waitFor()

  const platform = await launched.app.evaluate(() => process.platform)
  const exitPromise = launched.exited
  const closed = launched.app.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows()
    for (const win of wins) win.close()
  })
  const exit = await waitForExit(exitPromise, QUIT_MS)
  await closed.catch(() => undefined)
  const windows =
    exit === 'running'
      ? await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
      : 0

  expect(exit).toBe(platform === 'darwin' ? 'running' : 0)
  expect(windows).toBe(0)
})

it('ADV-E22 a crashed renderer reloads in the same sandboxed window', async () => {
  const launched = await launchApp()
  if (!launched.window) throw new Error('window missing')
  await launched.window.locator('h1').waitFor()

  const outcome = await launched.app.evaluate(
    async ({ BrowserWindow }, arg: { script: string; recoveryMs: number }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) {
        return {
          kind: 'stuck' as const,
          reason: null as string | null,
          windows: 0,
          crashed: null as boolean | null,
          title: null as string | null,
          requireType: null as string | null,
          processType: null as string | null,
          apiType: null as string | null,
          appPage: false,
          prefs: null as PreferenceSnapshot | null,
        }
      }

      const gone = await new Promise<{ reason: string | null }>((resolve) => {
        const timer = setTimeout(() => resolve({ reason: null }), 4_000)
        win.webContents.once('render-process-gone', (_event, details) => {
          clearTimeout(timer)
          resolve({ reason: details.reason })
        })
        win.webContents.forcefullyCrashRenderer()
      })

      const deadline = Date.now() + arg.recoveryMs
      while (Date.now() < deadline) {
        const windows = BrowserWindow.getAllWindows()
        const current = windows[0]
        if (!current || current.webContents.isCrashed()) {
          await new Promise((resolve) => setTimeout(resolve, 50))
          continue
        }
        const page = (await Promise.race([
          current.webContents.executeJavaScript(arg.script).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000)),
        ])) as PageProbe | null
        if (page?.title === 'agenteque') {
          const prefs = (current.webContents as unknown as PreferenceSource).getLastWebPreferences()
          return {
            kind: 'recovered' as const,
            reason: gone.reason,
            windows: windows.length,
            crashed: current.webContents.isCrashed(),
            title: page.title,
            requireType: page.requireType,
            processType: page.processType,
            apiType: page.apiType,
            appPage: current.webContents.getURL().includes('index.html'),
            prefs: {
              contextIsolation: prefs.contextIsolation ?? null,
              sandbox: prefs.sandbox ?? null,
              nodeIntegration: prefs.nodeIntegration ?? null,
              webviewTag: prefs.webviewTag ?? null,
              webSecurity: prefs.webSecurity ?? null,
              allowRunningInsecureContent: prefs.allowRunningInsecureContent ?? null,
              nodeIntegrationInSubFrames: prefs.nodeIntegrationInSubFrames ?? null,
            },
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      const last = BrowserWindow.getAllWindows()[0]
      return {
        kind: 'stuck' as const,
        reason: gone.reason,
        windows: BrowserWindow.getAllWindows().length,
        crashed: last ? last.webContents.isCrashed() : null,
        title: null,
        requireType: null,
        processType: null,
        apiType: null,
        appPage: false,
        prefs: null,
      }
    },
    { script: PAGE_PROBE, recoveryMs: RECOVERY_MS },
  )

  expect(
    {
      kind: outcome.kind,
      reason: crashClass(outcome.reason),
      windows: outcome.windows,
      crashed: outcome.crashed,
      title: outcome.title,
      requireType: outcome.requireType,
      processType: outcome.processType,
      apiType: outcome.apiType,
      appPage: outcome.appPage,
      ...(outcome.prefs ?? {
        contextIsolation: null,
        sandbox: null,
        nodeIntegration: null,
        webviewTag: null,
        webSecurity: null,
        allowRunningInsecureContent: null,
        nodeIntegrationInSubFrames: null,
      }),
    },
    JSON.stringify(outcome),
  ).toEqual({
    kind: 'recovered',
    reason: 'renderer-gone',
    windows: 1,
    crashed: false,
    title: 'agenteque',
    requireType: 'undefined',
    processType: 'undefined',
    apiType: 'object',
    appPage: true,
    ...SECURE_PREFS,
  })
})
