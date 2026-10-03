import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchApp } from '../helpers/electron'

const NODE_GLOBALS = ['require', 'process', 'module', 'Buffer', 'ipcRenderer'] as const

type NodeGlobalName = (typeof NODE_GLOBALS)[number]

type BindingProbe = {
  typeofName: string
  onGlobalThis: boolean
  via: string
  detail: string
}

type RendererProbe = {
  inRendererPage: boolean
  href: string
  bindings: Record<NodeGlobalName, BindingProbe>
}

const ABSENT: BindingProbe = {
  typeofName: 'undefined',
  onGlobalThis: false,
  via: 'absent',
  detail: '',
}

/**
 * Source evaluated in the renderer page (Playwright's main world).
 * Kept as a string so the test bundler cannot rewrite `process` or `require`
 * before the page runs the probe.
 */
const readRendererGlobals = [
  '(() => {',
  "  const names = ['require', 'process', 'module', 'Buffer', 'ipcRenderer']",
  '  const identifierType = (name) => {',
  '    try {',
  '      switch (name) {',
  "        case 'require':",
  '          return typeof require',
  "        case 'process':",
  '          return typeof process',
  "        case 'module':",
  '          return typeof module',
  "        case 'Buffer':",
  '          return typeof Buffer',
  "        case 'ipcRenderer':",
  '          return typeof ipcRenderer',
  '        default:',
  "          return 'unexpected'",
  '      }',
  '    } catch {',
  "      return 'throw'",
  '    }',
  '  }',
  '  const readValue = (name) => {',
  '    try {',
  '      switch (name) {',
  "        case 'require':",
  '          return require',
  "        case 'process':",
  '          return process',
  "        case 'module':",
  '          return module',
  "        case 'Buffer':",
  '          return Buffer',
  "        case 'ipcRenderer':",
  '          return ipcRenderer',
  '        default:',
  '          return undefined',
  '      }',
  '    } catch {',
  '      return undefined',
  '    }',
  '  }',
  '  const onHolder = (holder, name) => {',
  '    try {',
  '      return Object.prototype.hasOwnProperty.call(holder, name) || name in holder',
  '    } catch {',
  '      return true',
  '    }',
  '  }',
  '  const detailOf = (value) => {',
  "    if (value === null) return 'null'",
  "    if (value === undefined) return ''",
  '    const kind = typeof value',
  "    if (kind === 'function') {",
  "      const name = typeof value.name === 'string' ? value.name : ''",
  "      return name ? 'function ' + name : 'function'",
  '    }',
  "    if (kind === 'object') {",
  '      try {',
  "        return 'object ' + Object.getOwnPropertyNames(value).slice(0, 16).join(',')",
  '      } catch {',
  "        return 'object'",
  '      }',
  '    }',
  '    try {',
  "      return kind + ' ' + String(value).slice(0, 80)",
  '    } catch {',
  '      return kind',
  '    }',
  '  }',
  "  const holders = [{ via: 'globalThis', holder: globalThis }]",
  "  if (typeof window !== 'undefined' && window !== globalThis) {",
  "    holders.push({ via: 'window', holder: window })",
  '  }',
  "  if (typeof global !== 'undefined' && global && global !== globalThis) {",
  "    holders.push({ via: 'global', holder: global })",
  '  }',
  '  const bindings = {}',
  '  for (const name of names) {',
  '    const typeofName = identifierType(name)',
  "    let via = 'absent'",
  "    if (typeofName !== 'undefined') via = 'identifier'",
  '    else {',
  '      for (const entry of holders) {',
  '        if (onHolder(entry.holder, name)) {',
  '          via = entry.via',
  '          break',
  '        }',
  '      }',
  '    }',
  "    if (name === 'ipcRenderer' && via === 'absent' && typeof require === 'function') {",
  '      try {',
  "        const electron = require('electron')",
  "        if (electron && typeof electron === 'object' && electron.ipcRenderer != null) {",
  '          via = \'require("electron")\'',
  '        }',
  '      } catch {',
  '        // `require` itself is reported on its own binding.',
  '      }',
  '    }',
  '    bindings[name] = {',
  '      typeofName,',
  '      onGlobalThis: onHolder(globalThis, name),',
  '      via,',
  "      detail: via === 'absent' ? '' : detailOf(readValue(name)),",
  '    }',
  '  }',
  '  const api = globalThis.api',
  '  const inRendererPage =',
  "    typeof api === 'object' &&",
  '    api !== null &&',
  "    typeof api.getVersions === 'function' &&",
  "    typeof api.notifyRendererReady === 'function'",
  "  let href = ''",
  '  try {',
  '    href = String(location.href)',
  '  } catch {',
  "    href = ''",
  '  }',
  '  return { inRendererPage, href, bindings }',
  '})()',
].join('\n')

let launched: Awaited<ReturnType<typeof launchApp>> | undefined
let probe: RendererProbe | undefined
let heading = ''

beforeAll(async () => {
  launched = await launchApp()
  if (!launched.window) throw new Error('built app did not open a window')
  await launched.window.locator('h1').waitFor()
  heading = (await launched.window.locator('h1').textContent()) ?? ''
  probe = await launched.window.evaluate<RendererProbe>(readRendererGlobals)
})

afterAll(async () => {
  await launched?.close()
})

function currentProbe(): RendererProbe {
  if (!probe) throw new Error('renderer probe did not run')
  return probe
}

it('ADV-E06 evaluates inside the renderer page', () => {
  const current = currentProbe()
  expect(heading).toBe('agenteque')
  expect(current.inRendererPage, current.href).toBe(true)
  expect(current.href).toMatch(/^file:/)
})

for (const name of NODE_GLOBALS) {
  it(`ADV-E06 renderer has no ${name}`, () => {
    expect(currentProbe().bindings[name]).toEqual(ABSENT)
  })
}
