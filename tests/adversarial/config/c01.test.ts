import { expect, it } from 'vitest'
import { launchApp, launchPackagedApp, type LaunchedElectronApp } from '../helpers/electron'

/** Flags C01 requires from `webContents.getLastWebPreferences()`. */
interface RuntimeWebPreferences {
  contextIsolation?: boolean
  sandbox?: boolean
  webSecurity?: boolean
  nodeIntegration?: boolean
  allowRunningInsecureContent?: boolean
  webviewTag?: boolean
}

const secureWebPreferences: RuntimeWebPreferences = {
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  nodeIntegration: false,
  allowRunningInsecureContent: false,
  webviewTag: false,
}

/**
 * Electron 44 exposes `getLastWebPreferences` on `webContents`, but `electron.d.ts`
 * does not declare it.
 */
type WebContentsWithPreferences = Electron.WebContents & {
  getLastWebPreferences(): RuntimeWebPreferences
}

async function readRuntimeWebPreferences(
  app: LaunchedElectronApp['app'],
): Promise<RuntimeWebPreferences> {
  return app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    const win = windows.find((candidate) => {
      const url = candidate.webContents.getURL()
      return url.length > 0 && !url.startsWith('devtools://')
    })
    if (!win) {
      const urls = windows.map((candidate) => candidate.webContents.getURL())
      throw new Error(`no app window among ${JSON.stringify(urls)}`)
    }
    const contents = win.webContents as WebContentsWithPreferences
    const prefs = contents.getLastWebPreferences()
    return {
      contextIsolation: prefs.contextIsolation,
      sandbox: prefs.sandbox,
      webSecurity: prefs.webSecurity,
      nodeIntegration: prefs.nodeIntegration,
      allowRunningInsecureContent: prefs.allowRunningInsecureContent,
      webviewTag: prefs.webviewTag,
    }
  })
}

async function loadRuntimeWebPreferences(
  launched: LaunchedElectronApp,
): Promise<RuntimeWebPreferences> {
  if (!launched.window) throw new Error('app did not open a window')
  await launched.window.locator('h1').waitFor()
  const prefs = await readRuntimeWebPreferences(launched.app)
  await launched.close()
  return prefs
}

it('built app getLastWebPreferences keeps context isolation, sandbox, and web security on', async () => {
  expect(await loadRuntimeWebPreferences(await launchApp())).toEqual(secureWebPreferences)
})

it('packaged app getLastWebPreferences keeps context isolation, sandbox, and web security on', async () => {
  expect(await loadRuntimeWebPreferences(await launchPackagedApp())).toEqual(secureWebPreferences)
})
