import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchApp } from '../helpers/electron'

/**
 * ADV-E17: camera, microphone, geolocation, notifications, MIDI, HID, serial,
 * and USB must not be granted. The page requests each one. This test does not
 * grant them. A denial or a failed request is the secure outcome, including
 * when the device itself is missing.
 */

type PermissionKind =
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'notifications'
  | 'midi'
  | 'hid'
  | 'serial'
  | 'usb'

interface PermissionOutcome {
  granted: boolean
  detail: string
}

interface AccessResult {
  access: boolean
  detail: string
}

interface BrowserButton {
  dataset: { kind: string }
  id: string
  textContent: string
  type: string
  addEventListener(type: 'click', listener: () => void): void
  remove(): void
}

interface BrowserHost {
  Notification?: {
    permission: string
    requestPermission(): Promise<string>
  }
  advE17?: Promise<PermissionOutcome>
  document: {
    body: { appendChild(node: BrowserButton): void }
    createElement(tag: string): BrowserButton
    getElementById(id: string): BrowserButton | null
  }
  isSecureContext: boolean
  location: { origin: string }
  navigator: {
    geolocation?: {
      getCurrentPosition(
        success: (position: unknown) => void,
        error?: (error: unknown) => void,
        options?: { maximumAge?: number; timeout?: number },
      ): void
    }
    hid?: {
      requestDevice(options: { filters: [] }): Promise<readonly unknown[]>
    }
    mediaDevices?: {
      getUserMedia(constraints: { audio?: boolean; video?: boolean }): Promise<{
        getTracks(): { stop(): void }[]
      }>
    }
    permissions?: {
      query(descriptor: { name: string; sysex?: boolean }): Promise<{ state: string }>
    }
    requestMIDIAccess?: () => Promise<{
      inputs: { size: number }
      outputs: { size: number }
    }>
    serial?: {
      requestPort(): Promise<unknown>
    }
    usb?: {
      requestDevice(options: { filters: [] }): Promise<unknown>
    }
  }
}

const BUTTON_ID = 'adv-e17-request'

let page: Page | undefined
let closeApp: (() => Promise<void>) | undefined

beforeAll(async () => {
  const launched = await launchApp()
  closeApp = () => launched.close()
  if (!launched.window) throw new Error('app did not open a window')
  page = launched.window
  await page.locator('h1').waitFor()
  await armPermissionButton(page)
})

afterAll(async () => {
  await closeApp?.()
})

function appPage(): Page {
  if (!page) throw new Error('app did not open a window')
  return page
}

it('ADV-E17 camera permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'camera')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('ADV-E17 microphone permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'microphone')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('ADV-E17 geolocation permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'geolocation')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('ADV-E17 notifications permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'notifications')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('ADV-E17 MIDI permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'midi')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('hid permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'hid')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('serial permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'serial')
  expect(outcome.granted, outcome.detail).toBe(false)
})

it('usb permission is not granted', async () => {
  const outcome = await requestPermission(appPage(), 'usb')
  expect(outcome.granted, outcome.detail).toBe(false)
})

async function requestPermission(target: Page, kind: PermissionKind): Promise<PermissionOutcome> {
  await target.evaluate((permission: PermissionKind) => {
    const browser = globalThis as unknown as BrowserHost
    const button = browser.document.getElementById('adv-e17-request')
    if (!button) throw new Error('permission request button is missing')
    button.dataset.kind = permission
  }, kind)
  await target.locator(`#${BUTTON_ID}`).click()
  return target.evaluate(async (): Promise<PermissionOutcome> => {
    const browser = globalThis as unknown as BrowserHost
    if (!browser.advE17) throw new Error('permission request did not start')
    return browser.advE17
  })
}

async function armPermissionButton(target: Page): Promise<void> {
  await target.evaluate(() => {
    const browser = globalThis as unknown as BrowserHost
    const previous = browser.document.getElementById('adv-e17-request')
    previous?.remove()

    const button = browser.document.createElement('button')
    button.id = 'adv-e17-request'
    button.type = 'button'
    button.textContent = 'request'
    button.addEventListener('click', () => {
      const permission = button.dataset.kind
      if (!isPermissionKind(permission)) {
        browser.advE17 = Promise.reject(new Error(`unexpected permission ${permission}`))
        return
      }

      let started: Promise<AccessResult>
      try {
        started = startRequest(browser, permission)
      } catch (error) {
        started = Promise.resolve({ access: false, detail: errorText(error) })
      }

      browser.advE17 = withTimeout(started, 5_000).then(async (settled) => {
        const state = await readState(browser, { name: permission })
        const sysex =
          permission === 'midi'
            ? await readState(browser, { name: 'midi', sysex: true })
            : undefined
        const notificationGranted =
          permission === 'notifications' && browser.Notification?.permission === 'granted'
        const granted =
          settled.access || state === 'granted' || sysex === 'granted' || notificationGranted
        let detail = `${settled.detail}; state=${state}`
        if (sysex !== undefined) detail += `; sysex=${sysex}`
        detail += `; secureContext=${browser.isSecureContext}; origin=${browser.location.origin}`
        return { granted, detail }
      })
    })
    browser.document.body.appendChild(button)

    // Playwright serializes this callback, so these helpers have to stay inside it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    function isPermissionKind(value: string): value is PermissionKind {
      return (
        value === 'camera' ||
        value === 'microphone' ||
        value === 'geolocation' ||
        value === 'notifications' ||
        value === 'midi' ||
        value === 'hid' ||
        value === 'serial' ||
        value === 'usb'
      )
    }

    function startRequest(host: BrowserHost, permission: PermissionKind): Promise<AccessResult> {
      if (permission === 'camera') return captureMedia(host, 'video')
      if (permission === 'microphone') return captureMedia(host, 'audio')
      if (permission === 'geolocation') return requestGeolocation(host)
      if (permission === 'notifications') return requestNotifications(host)
      if (permission === 'midi') return requestMidi(host)
      if (permission === 'hid') return requestHid(host)
      if (permission === 'serial') return requestSerial(host)
      return requestUsb(host)
    }

    function captureMedia(host: BrowserHost, channel: 'audio' | 'video'): Promise<AccessResult> {
      const media = host.navigator.mediaDevices
      if (!media) return Promise.resolve({ access: false, detail: 'mediaDevices is unavailable' })
      const constraints =
        channel === 'video' ? { video: true, audio: false } : { audio: true, video: false }
      return media.getUserMedia(constraints).then((stream) => {
        for (const track of stream.getTracks()) track.stop()
        return { access: true, detail: `getUserMedia ${channel} resolved` }
      })
    }

    function requestGeolocation(host: BrowserHost): Promise<AccessResult> {
      const geolocation = host.navigator.geolocation
      if (!geolocation)
        return Promise.resolve({ access: false, detail: 'geolocation is unavailable' })
      return new Promise((resolve, reject) => {
        geolocation.getCurrentPosition(resolve, reject, { timeout: 2_500, maximumAge: 0 })
      }).then(() => ({ access: true, detail: 'getCurrentPosition resolved' }))
    }

    function requestNotifications(host: BrowserHost): Promise<AccessResult> {
      const notifications = host.Notification
      if (!notifications) {
        return Promise.resolve({ access: false, detail: 'Notification is unavailable' })
      }
      return notifications.requestPermission().then((decision) => ({
        access: decision === 'granted',
        detail: `requestPermission=${decision}; Notification.permission=${notifications.permission}`,
      }))
    }

    function requestMidi(host: BrowserHost): Promise<AccessResult> {
      const request = host.navigator.requestMIDIAccess
      if (!request)
        return Promise.resolve({ access: false, detail: 'requestMIDIAccess is unavailable' })
      return request().then((access) => ({
        access: true,
        detail: `requestMIDIAccess resolved inputs=${access.inputs.size} outputs=${access.outputs.size}`,
      }))
    }

    function requestHid(host: BrowserHost): Promise<AccessResult> {
      const hid = host.navigator.hid
      if (!hid) return Promise.resolve({ access: false, detail: 'hid is unavailable' })
      return hid.requestDevice({ filters: [] }).then((devices) => ({
        access: devices.length > 0,
        detail: `requestDevice resolved count=${devices.length}`,
      }))
    }

    function requestSerial(host: BrowserHost): Promise<AccessResult> {
      const serial = host.navigator.serial
      if (!serial) return Promise.resolve({ access: false, detail: 'serial is unavailable' })
      return serial.requestPort().then(() => ({ access: true, detail: 'requestPort resolved' }))
    }

    function requestUsb(host: BrowserHost): Promise<AccessResult> {
      const usb = host.navigator.usb
      if (!usb) return Promise.resolve({ access: false, detail: 'usb is unavailable' })
      return usb.requestDevice({ filters: [] }).then((device) => ({
        access: device != null,
        detail: `requestDevice resolved device=${device == null ? 'no' : 'yes'}`,
      }))
    }

    async function readState(
      host: BrowserHost,
      descriptor: { name: string; sysex?: boolean },
    ): Promise<string> {
      const permissions = host.navigator.permissions
      if (!permissions) return 'unavailable'
      try {
        const status = await permissions.query(descriptor)
        return status.state
      } catch (error) {
        const name = error instanceof Error ? error.name : 'Error'
        return `query rejected (${name})`
      }
    }

    function withTimeout(promise: Promise<AccessResult>, ms: number): Promise<AccessResult> {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve({ access: false, detail: `timed out after ${ms}ms` })
        }, ms)
        promise.then(
          (value) => {
            clearTimeout(timer)
            resolve(value)
          },
          (error: unknown) => {
            clearTimeout(timer)
            resolve({ access: false, detail: errorText(error) })
          },
        )
      })
    }

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    function errorText(error: unknown): string {
      if (error instanceof Error) return `${error.name}: ${error.message}`
      if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
        const position = error as { code: number; message: string }
        return `GeolocationPositionError code=${position.code}: ${position.message}`
      }
      return String(error)
    }
  })
}
