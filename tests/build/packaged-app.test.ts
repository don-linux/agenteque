import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { distDir, root } from './paths'

const executable = {
  linux: resolve(distDir, 'linux-unpacked/agenteque'),
  darwin: resolve(distDir, `mac-${process.arch}/agenteque.app/Contents/MacOS/agenteque`),
  win32: resolve(distDir, 'win-unpacked/agenteque.exe'),
}[process.platform as 'linux' | 'darwin' | 'win32']

function runSmoke(): Promise<{ code: number | null; output: string; elapsedMs: number }> {
  return new Promise((done, fail) => {
    const started = Date.now()
    const child = spawn(executable, ['--no-sandbox', '--smoke-test'], {
      env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':1' },
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk))
    child.on('error', fail)
    child.on('exit', (code) => done({ code, output, elapsedMs: Date.now() - started }))
  })
}

describe('packaged app smoke test', () => {
  beforeAll(() => {
    rmSync(distDir, { recursive: true, force: true })
    const result = spawnSync(
      process.execPath,
      [resolve(root, 'node_modules/electron-builder/cli.js'), '--dir'],
      { cwd: root, encoding: 'utf8' },
    )
    if (result.status !== 0) {
      throw new Error(`electron-builder --dir failed:\n${result.stdout}\n${result.stderr}`)
    }
  })

  it('electron-builder --dir produces the app executable', () => {
    expect(existsSync(executable), executable).toBe(true)
  })

  it('launches, mounts the renderer and exits cleanly in --smoke-test mode', async () => {
    const { code, output, elapsedMs } = await runSmoke()
    expect(output).toContain('[smoke] renderer ready')
    expect(output).not.toContain('[smoke] FAIL')
    expect(code, output).toBe(0)
    expect(elapsedMs).toBeGreaterThanOrEqual(2_000)
  })
})
