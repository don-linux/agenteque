import { readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { app, type Session } from 'electron'

const clipboardDenied = new Set<string>(['clipboard-read', 'deprecated-sync-clipboard-read'])
const chromiumSpoolPrefix = '.org.chromium.Chromium.'
const SPOOL_SWEEP_MS = 800
const SPOOL_SWEEP_STEP_MS = 20

/**
 * Camera and microphone share `media`. MIDI sysex is a separate check from
 * `midi`. Approximate geolocation is the same capability as geolocation.
 * Clipboard reads are denied separately by ADV-E18.
 */
const DENIED_PERMISSIONS = new Set<string>([
  'media',
  'geolocation',
  'geolocation-approximate',
  'notifications',
  'midi',
  'midiSysex',
])

const locked = new WeakSet<Session>()

function permissionDenied(permission: string): boolean {
  return DENIED_PERMISSIONS.has(permission) || clipboardDenied.has(permission)
}

function discardChromiumSpools(): void {
  const dirs = [...new Set([app.getPath('downloads'), app.getPath('temp')])]
  const sweep = (): void => {
    for (const dir of dirs) unlinkChromiumSpools(dir)
  }
  sweep()
  for (let delayMs = 0; delayMs <= SPOOL_SWEEP_MS; delayMs += SPOOL_SWEEP_STEP_MS) {
    const timer = setTimeout(sweep, delayMs)
    timer.unref()
  }
}

function unlinkChromiumSpools(dir: string): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.startsWith(chromiumSpoolPrefix)) continue
    try {
      unlinkSync(join(dir, name))
    } catch {
      // The spool can disappear between the listing and the unlink.
    }
  }
}

/** Same denials on the app session and on the embedded browser partition. */
export function installLockedSession(ses: Session): void {
  if (locked.has(ses)) return
  locked.add(ses)
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(!permissionDenied(permission))
  })
  ses.setPermissionCheckHandler((_contents, permission) => !permissionDenied(permission))
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (event, item) => {
    event.preventDefault()
    item.cancel()
    discardChromiumSpools()
  })
}
