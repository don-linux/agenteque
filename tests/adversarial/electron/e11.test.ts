/**
 * ADV-E11. The built renderer (`out/renderer/index.html`, loaded by `launchApp`) must
 * not run an inline script, `eval` / `new Function`, a remote script, or WASM.
 *
 * DevTools evaluation bypasses `script-src` for `eval` and `new Function`, so those
 * two and WASM are called from a classic script written next to the built HTML. That
 * file is only a same-origin probe: `script-src 'self'` is supposed to allow it, and
 * the assertions are about what it cannot do.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchApp, startHostileServer } from '../helpers/electron'

const PROBE_NAME = 'adv-e11-probe.js'
const VIOLATION_WAIT_MS = 2_000

/** Minimal module: `(func (export "answer") (result i32) i32.const 42)`. */
const WASM_BYTES = [
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03,
  0x02, 0x01, 0x00, 0x07, 0x0a, 0x01, 0x06, 0x61, 0x6e, 0x73, 0x77, 0x65, 0x72, 0x00, 0x00, 0x0a,
  0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b,
]

interface PolicyViolation {
  blockedURI: string
  effectiveDirective: string
  disposition: string
}

interface ProbeReport {
  probe: string
  evalValue: number | null
  evalError: string | null
  evalMessage: string | null
  functionValue: number | null
  functionError: string | null
  functionMessage: string | null
  wasm: number | null
  wasmError: string | null
  wasmMessage: string | null
}

interface ScriptElement {
  textContent: string
  src: string
  addEventListener(type: string, listener: () => void): void
}

interface PageDocument {
  createElement(tag: string): ScriptElement
  head: { appendChild(node: ScriptElement): void }
  addEventListener(type: string, listener: (event: PolicyViolation) => void): void
}

type PageGlobal = typeof globalThis & {
  document: PageDocument
  location: { href: string }
  advE11Inline?: string
  advE11Remote?: string
  advE11?: ProbeReport
}

it('ADV-E11 inline script does not run', async () => {
  const { page, close } = await openBuiltPage()
  try {
    const result = await page.evaluate(async (waitMs: number) => {
      const view = globalThis as PageGlobal
      const violations: PolicyViolation[] = []
      const seen = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, waitMs)
        const finish = (): void => {
          clearTimeout(timer)
          resolve()
        }
        view.document.addEventListener('securitypolicyviolation', (event) => {
          violations.push({
            blockedURI: event.blockedURI,
            effectiveDirective: event.effectiveDirective,
            disposition: event.disposition,
          })
          if (event.blockedURI === 'inline') finish()
        })
        const script = view.document.createElement('script')
        script.textContent = 'globalThis.advE11Inline = "ran"'
        view.document.head.appendChild(script)
        if (view.advE11Inline === 'ran') finish()
      })
      await seen
      return { ran: view.advE11Inline === 'ran', violations }
    }, VIOLATION_WAIT_MS)

    expect(result.ran).toBe(false)
    expect(result.violations).toContainEqual({
      blockedURI: 'inline',
      effectiveDirective: 'script-src-elem',
      disposition: 'enforce',
    })
  } finally {
    await close()
  }
})

it('ADV-E11 eval and new Function do not run', async () => {
  const { page, close } = await openBuiltPage()
  try {
    const report = await loadProbe(page)
    expect(report.evalValue, report.evalMessage ?? 'eval produced a value').toBeNull()
    expect(
      report.functionValue,
      report.functionMessage ?? 'new Function produced a value',
    ).toBeNull()
    expect(report.evalError).toBe('EvalError')
    expect(report.functionError).toBe('EvalError')
    expect(report.evalMessage).toContain('Content Security Policy')
    expect(report.evalMessage).toContain('unsafe-eval')
    expect(report.functionMessage).toContain('Content Security Policy')
    expect(report.functionMessage).toContain('unsafe-eval')
  } finally {
    await close()
  }
})

it('ADV-E11 remote script does not run', async () => {
  const server = await startHostileServer(() => ({
    status: 200,
    headers: { 'content-type': 'text/javascript; charset=utf-8' },
    body: 'globalThis.advE11Remote = "ran"',
  }))
  const { page, close } = await openBuiltPage()
  try {
    const src = `${server.origin}/adv-e11.js`
    const result = await page.evaluate(
      async (input: { src: string; waitMs: number }) => {
        const view = globalThis as PageGlobal
        const violations: PolicyViolation[] = []
        view.document.addEventListener('securitypolicyviolation', (event) => {
          violations.push({
            blockedURI: event.blockedURI,
            effectiveDirective: event.effectiveDirective,
            disposition: event.disposition,
          })
        })
        const script = view.document.createElement('script')
        script.src = input.src
        const how = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), input.waitMs)
          const finish = (value: string): void => {
            clearTimeout(timer)
            resolve(value)
          }
          script.addEventListener('error', () => finish('error'))
          script.addEventListener('load', () => finish('load'))
          view.document.head.appendChild(script)
        })
        return { how, ran: view.advE11Remote === 'ran', violations }
      },
      { src, waitMs: VIOLATION_WAIT_MS },
    )

    expect(result.ran).toBe(false)
    expect(result.how).toBe('error')
    expect(result.violations).toContainEqual({
      blockedURI: src,
      effectiveDirective: 'script-src-elem',
      disposition: 'enforce',
    })
    expect(server.requests.map((request) => request.url)).toEqual([])
  } finally {
    await close()
    await server.close()
  }
})

it('ADV-E11 WASM does not run', async () => {
  const { page, close } = await openBuiltPage()
  try {
    const report = await loadProbe(page)
    expect(report.wasm, report.wasmMessage ?? 'WASM produced a value').toBeNull()
    expect(report.wasmError).toBe('CompileError')
    expect(report.wasmMessage).toContain('Content Security Policy')
    expect(report.wasmMessage).toContain('unsafe-eval')
  } finally {
    await close()
  }
})

async function openBuiltPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const launched = await launchApp()
  const page = launched.window
  if (!page) throw new Error('built app did not open a window')
  await page.locator('h1').waitFor()
  expect(await page.locator('h1').textContent()).toBe('agenteque')
  const url = page.url()
  expect(url.startsWith('file:'), url).toBe(true)
  expect(url, url).toContain('/renderer/index.html')
  return { page, close: () => launched.close() }
}

async function loadProbe(page: Page): Promise<ProbeReport> {
  const file = join(dirname(fileURLToPath(page.url())), PROBE_NAME)
  writeFileSync(file, probeSource(), 'utf8')
  onTestFinished(() => {
    rmSync(file, { force: true })
  })
  try {
    const report = await page.evaluate(async (name: string) => {
      const view = globalThis as PageGlobal
      const loaded = await new Promise<ProbeReport | null>((resolve, reject) => {
        const script = view.document.createElement('script')
        script.src = new URL(name, view.location.href).href
        script.addEventListener('load', () => resolve(view.advE11 ?? null))
        script.addEventListener('error', () =>
          reject(new Error(`probe failed to load: ${script.src}`)),
        )
        view.document.head.appendChild(script)
      })
      return loaded
    }, PROBE_NAME)
    if (!report || report.probe !== 'ran') {
      throw new Error(`same-origin probe did not run: ${JSON.stringify(report)}`)
    }
    return report
  } finally {
    rmSync(file, { force: true })
  }
}

function probeSource(): string {
  return `globalThis.advE11 = {
  probe: 'ran',
  evalValue: null,
  evalError: null,
  evalMessage: null,
  functionValue: null,
  functionError: null,
  functionMessage: null,
  wasm: null,
  wasmError: null,
  wasmMessage: null,
}
try {
  globalThis.advE11.evalValue = eval('40+2')
} catch (error) {
  globalThis.advE11.evalError = error instanceof Error ? error.name : 'unknown'
  globalThis.advE11.evalMessage = error instanceof Error ? error.message : String(error)
}
try {
  globalThis.advE11.functionValue = new Function('return 40+2')()
} catch (error) {
  globalThis.advE11.functionError = error instanceof Error ? error.name : 'unknown'
  globalThis.advE11.functionMessage = error instanceof Error ? error.message : String(error)
}
try {
  const bytes = new Uint8Array([${WASM_BYTES.join(',')}])
  const compiled = new WebAssembly.Module(bytes)
  const instance = new WebAssembly.Instance(compiled)
  const answer = instance.exports.answer
  globalThis.advE11.wasm = typeof answer === 'function' ? answer() : null
} catch (error) {
  globalThis.advE11.wasmError = error instanceof Error ? error.name : 'unknown'
  globalThis.advE11.wasmMessage = error instanceof Error ? error.message : String(error)
}
`
}
