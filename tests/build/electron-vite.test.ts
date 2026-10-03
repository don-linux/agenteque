import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, inject, it } from 'vitest'
import { outDir } from './paths'

const build = inject('electronViteBuild')

function readOut(relativePath: string): string {
  const file = resolve(outDir, relativePath)
  expect(existsSync(file), `${relativePath} should exist`).toBe(true)
  return readFileSync(file, 'utf8')
}

// https://github.com/alex8088/electron-vite/issues/925
describe('#925: Svelte renderer builds with Vite 8', () => {
  it('electron-vite build exits 0', () => {
    expect(build.status, build.output).toBe(0)
  })

  it('does not hit the "Expected token }" error', () => {
    expect(build.output).not.toContain('Expected token }')
  })

  it('emits a renderer bundle containing the compiled Svelte components', () => {
    const html = readOut('renderer/index.html')
    const scriptSrc = html.match(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"/)?.[1]
    expect(scriptSrc, 'index.html should reference a JS bundle').toBeDefined()

    const bundle = readOut(`renderer/${scriptSrc}`)
    expect(bundle).toContain('Versions (via IPC)')
    expect(bundle).toContain('count is')
  })
})

// https://github.com/alex8088/electron-vite/issues/906
describe('#906: ESM shim does not empty the main/preload bundles', () => {
  it('emits a non-empty ESM main bundle with the expected code', () => {
    const main = readOut('main/index.js')
    expect(statSync(resolve(outDir, 'main/index.js')).size).toBeGreaterThan(1000)
    expect(main).toMatch(/^import .+ from "electron";$/m)
    expect(main).toContain('BrowserWindow')
    expect(main).toContain('app:versions')
    // The source uses `__dirname`, which only works in ESM output via the injected shim.
    expect(main).toMatch(/\b__dirname\s*=/)
  })

  it('emits a non-empty CJS preload bundle that main points to', () => {
    const preload = readOut('preload/index.cjs')
    expect(statSync(resolve(outDir, 'preload/index.cjs')).size).toBeGreaterThan(200)
    expect(preload).toContain('contextBridge')
    expect(preload).toContain('app:versions')
    expect(readOut('main/index.js')).toContain('../preload/index.cjs')
  })
})
