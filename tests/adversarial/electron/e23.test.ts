// `box` stays inside `page.evaluate`: Playwright serializes only that function.
/* oxlint-disable unicorn/consistent-function-scoping */
/**
 * ADV-E23: the embedded page must not take clicks or keys that belong to the
 * Svelte chrome. Bounds come from `.host`, Ctrl+B detaches the view without
 * destroying it, and the toolbar X destroys it only after confirmation.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import { viewFitsHost, type Rect } from '../../../src/shared/browser-geometry'
import { BROWSER_PARTITION } from '../../../src/shared/browser'
import { launchApp, startHostileServer, type LaunchedElectronApp } from '../helpers/electron'

const GUEST_HTML = `<!doctype html>
<html>
  <head><title>guest-page</title></head>
  <body style="margin:0">
    <div id="hit" style="position:fixed;inset:0"></div>
    <script>
      window.hits = 0
      document.getElementById('hit').addEventListener('mousedown', () => { window.hits += 1 })
    </script>
  </body>
</html>`

interface ChromeRects {
  host: Rect
  tabs: Rect
  toolbar: Rect
  footer: Rect
}

interface GuestPage {
  launched: LaunchedElectronApp
  app: ElectronApplication
  page: Page
  guestId: number
  userData: string
  folder: string
}

interface PageBox {
  w: number
  h: number
  screenX: number
  screenY: number
}

interface Prefs {
  sandbox: boolean
  contextIsolation: boolean
  nodeIntegration: boolean
  webviewTag: boolean
}

async function pollUntil<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  label: string,
  timeoutMs = 12_000,
): Promise<T> {
  const start = Date.now()
  let last: T | undefined
  while (Date.now() - start < timeoutMs) {
    last = await read()
    if (ok(last)) return last
    await delay(40)
  }
  throw new Error(`${label}: ${JSON.stringify(last)}`)
}

async function openGuest(serverOrigin: string): Promise<GuestPage> {
  const userData = await mkdtemp(join(tmpdir(), 'agenteque-e23-user-'))
  const folder = await mkdtemp(join(tmpdir(), 'agenteque-e23-folder-'))
  const launched = await launchApp({ args: [`--user-data-dir=${userData}`] })
  const page = launched.window
  if (!page) throw new Error('app did not open a window')
  const app = launched.app

  await app.evaluate(({ dialog }, dir: string) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, folder)
  await page.getByRole('heading', { name: 'agenteque' }).waitFor()
  await page.getByRole('button', { name: 'Abrir carpeta' }).click()
  await page.getByText('Selecciona un archivo.').waitFor()
  await page.getByRole('button', { name: 'Navegador' }).click()
  await page.locator('[data-browser-host]').waitFor()

  const guestId = await pollUntil(
    () => guestIds(app),
    (ids) => ids.length > 0,
    'guest webContents',
  ).then((ids) => ids[0] ?? -1)

  await app.evaluate(
    ({ webContents }, payload: { id: number; url: string }) => {
      const guest = webContents.fromId(payload.id)
      if (!guest || guest.isDestroyed()) throw new Error('guest missing before load')
      return guest.loadURL(payload.url)
    },
    { id: guestId, url: `${serverOrigin}/` },
  )

  await pollUntil(
    async () => page.locator('[data-browser-url]').inputValue(),
    (value) => value.includes('127.0.0.1'),
    'url bar',
  )

  return { launched, app, page, guestId, userData, folder }
}

async function closeGuest(opened: GuestPage): Promise<void> {
  await opened.launched.close()
  await rm(opened.userData, { recursive: true, force: true })
  await rm(opened.folder, { recursive: true, force: true })
}

async function guestIds(app: ElectronApplication): Promise<number[]> {
  return app.evaluate(({ webContents, session }, partition: string) => {
    const ses = session.fromPartition(partition)
    return webContents
      .getAllWebContents()
      .filter((contents) => !contents.isDestroyed() && contents.session === ses)
      .map((contents) => contents.id)
  }, BROWSER_PARTITION)
}

async function guestUrl(app: ElectronApplication, id: number): Promise<string> {
  return app.evaluate(({ webContents }, guestId: number) => {
    const guest = webContents.fromId(guestId)
    if (!guest || guest.isDestroyed()) return ''
    return guest.getURL()
  }, id)
}

async function focusState(
  app: ElectronApplication,
  id: number,
): Promise<{ host: boolean; guest: boolean }> {
  return app.evaluate(({ BrowserWindow, webContents }, guestId: number) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
    const guest = webContents.fromId(guestId)
    return {
      host: Boolean(win && !win.webContents.isDestroyed() && win.webContents.isFocused()),
      guest: Boolean(guest && !guest.isDestroyed() && guest.isFocused()),
    }
  }, id)
}

async function clickGuest(app: ElectronApplication, id: number): Promise<number> {
  return app.evaluate(({ webContents }, guestId: number) => {
    const guest = webContents.fromId(guestId)
    if (!guest || guest.isDestroyed()) throw new Error('guest missing')
    guest.focus()
    guest.sendInputEvent({ type: 'mouseDown', x: 12, y: 12, button: 'left', clickCount: 1 })
    guest.sendInputEvent({ type: 'mouseUp', x: 12, y: 12, button: 'left', clickCount: 1 })
    return guest.executeJavaScript('window.hits || 0')
  }, id)
}

async function pressCtrlB(app: ElectronApplication, id: number): Promise<void> {
  await app.evaluate(({ webContents }, guestId: number) => {
    const guest = webContents.fromId(guestId)
    if (!guest || guest.isDestroyed()) throw new Error('guest missing')
    guest.sendInputEvent({ type: 'keyDown', keyCode: 'B', modifiers: ['control'] })
    guest.sendInputEvent({ type: 'keyUp', keyCode: 'B', modifiers: ['control'] })
  }, id)
}

async function chromeRects(page: Page): Promise<ChromeRects> {
  const rects = await page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: {
        querySelector(selector: string): { getBoundingClientRect(): Rect } | null
      }
    }
    function box(selector: string): Rect | null {
      const node = dom.document.querySelector(selector)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return {
      host: box('[data-browser-host]'),
      tabs: box('[data-browser-tabs]'),
      toolbar: box('[data-browser-toolbar]'),
      footer: box('footer'),
    }
  })
  if (!rects.host || !rects.tabs || !rects.toolbar || !rects.footer) {
    throw new Error(`chrome rects missing: ${JSON.stringify(rects)}`)
  }
  return rects as ChromeRects
}

async function attachedGuestBounds(app: ElectronApplication): Promise<Rect | null> {
  return app.evaluate(({ BrowserWindow, session }, partition: string) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
    if (!win) return null
    const ses = session.fromPartition(partition)
    const found: Rect[] = []
    const visit = (view: {
      webContents?: {
        isDestroyed(): boolean
        session: unknown
      }
      getBounds(): Rect
      children?: unknown[]
    }): void => {
      const contents = view.webContents
      if (contents && !contents.isDestroyed() && contents.session === ses)
        found.push(view.getBounds())
      for (const child of view.children ?? []) visit(child as typeof view)
    }
    for (const child of win.contentView.children) visit(child as Parameters<typeof visit>[0])
    return found[0] ?? null
  }, BROWSER_PARTITION)
}

async function guestPrefs(app: ElectronApplication, id: number): Promise<Prefs> {
  return app.evaluate(({ webContents }, guestId: number) => {
    const guest = webContents.fromId(guestId)
    if (!guest) throw new Error('guest missing')
    const read = (
      guest as unknown as {
        getLastWebPreferences?: () => {
          sandbox?: boolean
          contextIsolation?: boolean
          nodeIntegration?: boolean
          webviewTag?: boolean
        }
      }
    ).getLastWebPreferences
    if (!read) throw new Error('webContents.getLastWebPreferences is missing')
    const prefs = read.call(guest)
    return {
      sandbox: prefs.sandbox === true,
      contextIsolation: prefs.contextIsolation === true,
      nodeIntegration: prefs.nodeIntegration === true,
      webviewTag: prefs.webviewTag === true,
    }
  }, id)
}

async function pageBox(app: ElectronApplication, id: number): Promise<PageBox> {
  return app.evaluate(({ webContents }, guestId: number) => {
    const guest = webContents.fromId(guestId)
    if (!guest || guest.isDestroyed()) throw new Error('guest missing')
    return guest.executeJavaScript(
      '({ w: innerWidth, h: innerHeight, screenX: screenX, screenY: screenY })',
    )
  }, id)
}

async function dockSide(app: ElectronApplication, id: number): Promise<string | null> {
  return app.evaluate(({ webContents }, guestId: number) => {
    const guest = webContents.fromId(guestId)
    const devtools = guest?.devToolsWebContents
    if (!devtools || devtools.isDestroyed()) return null
    return devtools.executeJavaScript(`(() => {
      try {
        const eui = globalThis.EUI
        const ctor =
          eui && eui.DockController && (eui.DockController.DockController || eui.DockController)
        const instance = ctor && typeof ctor.instance === 'function' ? ctor.instance() : null
        if (instance && typeof instance.dockSide === 'function') return String(instance.dockSide())
        return null
      } catch {
        return null
      }
    })()`)
  }, id)
}

async function windowIds(app: ElectronApplication): Promise<number[]> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((win) => !win.isDestroyed())
      .map((win) => win.id),
  )
}

async function urlBarFocused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: { activeElement: { matches?: (selector: string) => boolean } | null }
    }
    const active = dom.document.activeElement
    return Boolean(active?.matches?.('[data-browser-url]'))
  })
}

async function assertViewInHost(app: ElectronApplication, page: Page): Promise<Rect> {
  const fitted = await pollUntil(
    async () => {
      const view = await attachedGuestBounds(app)
      const chrome = await chromeRects(page)
      return {
        view,
        chrome,
        fits:
          view !== null &&
          viewFitsHost(view, chrome.host, [chrome.tabs, chrome.toolbar, chrome.footer]),
      }
    },
    (row) => row.fits,
    'view bounds inside host',
  )
  if (!fitted.view) throw new Error('view missing after fit')
  return fitted.view
}

it('keeps mouse focus on the page only while the view is attached', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: GUEST_HTML,
  }))
  let opened: GuestPage | null = null
  try {
    opened = await openGuest(server.origin)
    const { app, page, guestId } = opened

    const prefs = await guestPrefs(app, guestId)
    expect(prefs).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    })

    await assertViewInHost(app, page)
    const hits = await clickGuest(app, guestId)
    expect(hits).toBeGreaterThan(0)
    const onPage = await pollUntil(
      () => focusState(app, guestId),
      (state) => state.guest && !state.host,
      'guest focus after page click',
    )
    expect(onPage).toEqual({ host: false, guest: true })

    await page.locator('[data-browser-url]').click()
    const onBar = await pollUntil(
      async () => ({ ...(await focusState(app, guestId)), url: await urlBarFocused(page) }),
      (state) => state.host && !state.guest && state.url,
      'app focus after url click',
    )
    expect(onBar.host).toBe(true)
    expect(onBar.guest).toBe(false)
    expect(onBar.url).toBe(true)

    await clickGuest(app, guestId)
    const backOnPage = await pollUntil(
      async () => ({ ...(await focusState(app, guestId)), url: await urlBarFocused(page) }),
      (state) => state.guest && !state.host && !state.url,
      'guest focus steals the url bar',
    )
    expect(backOnPage.url).toBe(false)

    const hostBox = await page.locator('[data-browser-host]').boundingBox()
    if (!hostBox) throw new Error('host has no box')
    const urlBeforeHide = await guestUrl(app, guestId)
    await pressCtrlB(app, guestId)

    await pollUntil(
      async () => ({
        ids: await guestIds(app),
        url: await guestUrl(app, guestId),
        view: await attachedGuestBounds(app),
        surface: await page.locator('[data-browser-host]').count(),
      }),
      (state) => state.ids.includes(guestId) && state.url === urlBeforeHide && state.view === null,
      'Ctrl+B detaches the view and keeps the page',
    )

    const point = { x: hostBox.x + hostBox.width / 2, y: hostBox.y + hostBox.height / 2 }
    const hitEditor = await page.evaluate((at: { x: number; y: number }) => {
      const dom = globalThis as unknown as {
        document: {
          elementFromPoint(x: number, y: number): { textContent: string | null } | null
        }
      }
      return dom.document.elementFromPoint(at.x, at.y)?.textContent ?? ''
    }, point)
    expect(hitEditor).toContain('Selecciona un archivo.')
    await page.getByText('Selecciona un archivo.').click()
    const editorFocus = await pollUntil(
      () => focusState(app, guestId),
      (state) => state.host && !state.guest,
      'editor receives the click that used to hit the page',
    )
    expect(editorFocus).toEqual({ host: true, guest: false })

    await page.getByRole('button', { name: 'Navegador' }).click()
    await pollUntil(
      async () => ({
        url: await guestUrl(app, guestId),
        bar: await page.locator('[data-browser-url]').inputValue(),
        view: await attachedGuestBounds(app),
      }),
      (state) =>
        state.url === urlBeforeHide && state.bar.includes('127.0.0.1') && state.view !== null,
      'the same tab comes back',
    )
    await assertViewInHost(app, page)

    await page.getByRole('button', { name: 'Cerrar navegador' }).click()
    await page.getByRole('dialog').waitFor()
    await pollUntil(
      async () => ({ ids: await guestIds(app), view: await attachedGuestBounds(app) }),
      (state) => state.ids.includes(guestId) && state.view === null,
      'close dialog detaches the view without killing it',
    )
    const dialogBox = await page.getByRole('dialog').boundingBox()
    expect(dialogBox?.height ?? 0).toBeGreaterThan(0)

    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
    await assertViewInHost(app, page)
    expect(await guestIds(app)).toContain(guestId)

    await page.getByRole('button', { name: 'Cerrar navegador' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    await pollUntil(
      () => guestIds(app),
      (ids) => ids.length === 0,
      'confirming close destroys the guest',
    )
    expect(await guestUrl(app, guestId)).toBe('')
  } finally {
    if (opened) await closeGuest(opened)
    await server.close()
  }
})

it('docks devtools inside the page hole on the right, left, bottom and a separate window', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: GUEST_HTML,
  }))
  let opened: GuestPage | null = null
  try {
    opened = await openGuest(server.origin)
    const { app, page, guestId } = opened
    const full = await pageBox(app, guestId)
    const appWindows = await windowIds(app)

    await page.locator('[data-browser-devtools]').click()
    const right = await pollUntil(
      async () => ({ box: await pageBox(app, guestId), side: await dockSide(app, guestId) }),
      (state) => state.side === 'right' && state.box.w < full.w - 20,
      'devtools docked right shrinks the page width',
    )
    await assertViewInHost(app, page)
    expect(right.side).toBe('right')
    expect(await windowIds(app)).toEqual(appWindows)

    await page.locator('[data-browser-devtools]').click({ button: 'right' })
    await page.getByRole('menuitemradio', { name: 'Izquierda' }).click()
    const left = await pollUntil(
      async () => ({ box: await pageBox(app, guestId), side: await dockSide(app, guestId) }),
      (state) => state.side === 'left' && state.box.w < full.w - 20,
      'devtools docked left splits the page on the other side',
    )
    await assertViewInHost(app, page)
    expect(left.side).toBe('left')
    expect(left.box.w).toBeLessThan(full.w - 20)

    await page.locator('[data-browser-devtools]').click({ button: 'right' })
    await page.getByRole('menuitemradio', { name: 'Abajo' }).click()
    const bottom = await pollUntil(
      async () => ({ box: await pageBox(app, guestId), side: await dockSide(app, guestId) }),
      (state) => state.side === 'bottom' && state.box.h < full.h - 20 && state.box.w > full.w - 80,
      'devtools docked bottom shrinks the page height',
    )
    await assertViewInHost(app, page)
    expect(bottom.side).toBe('bottom')
    expect(bottom.box.h).toBeLessThan(full.h - 20)

    await page.locator('[data-browser-devtools]').click({ button: 'right' })
    await page.getByRole('menuitemradio', { name: 'Ventana separada' }).click()
    const separated = await pollUntil(
      async () => ({
        box: await pageBox(app, guestId),
        side: await dockSide(app, guestId),
        windows: await windowIds(app),
      }),
      (state) =>
        state.side === 'undocked' &&
        state.windows.some((id) => !appWindows.includes(id)) &&
        state.box.w > full.w - 40 &&
        state.box.h > full.h - 40,
      'undocked devtools is another window and the page is whole again',
    )
    expect(separated.windows.filter((id) => !appWindows.includes(id)).length).toBeGreaterThan(0)
    await assertViewInHost(app, page)
    const toolbar = await chromeRects(page)
    const view = await attachedGuestBounds(app)
    expect(view).not.toBeNull()
    expect(
      viewFitsHost(view as Rect, toolbar.host, [toolbar.tabs, toolbar.toolbar, toolbar.footer]),
    ).toBe(true)
  } finally {
    if (opened) await closeGuest(opened)
    await server.close()
  }
})
