import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
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

  /**
   * La pantalla de IDE reparte el alto con `flex`, así que una raíz de montaje
   * sin alto propio la colapsa a cero píxeles: el DOM está entero, no hay ni un
   * error, y la ventana sale en blanco. Sólo se ve midiendo lo pintado.
   */
  it('paints the IDE screen instead of collapsing it to zero pixels', async () => {
    // Directorio de datos propio: con el del usuario la carpeta ya tendría
    // vistas guardadas y el modal de carpetas visibles no aparecería.
    const userData = mkdtempSync(join(tmpdir(), 'agenteque-build-'))
    const app = await electron.launch({
      executablePath: executable,
      args: ['--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      timeout: 60_000,
      env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':1' },
    })

    try {
      const page = await app.firstWindow({ timeout: 30_000 })
      await page.getByRole('heading', { name: 'agenteque' }).waitFor({ timeout: 20_000 })

      await page.getByRole('button', { name: 'Abrir carpeta' }).click()
      await page.getByRole('button', { name: 'Todas' }).click()
      await page.getByRole('button', { name: 'Confirmar' }).click()

      // `waitFor` exige que el elemento tenga caja, así que una pantalla
      // colapsada a cero píxeles no pasa de aquí.
      const editorHint = page.getByText('Selecciona un archivo.')
      await editorHint.waitFor({ timeout: 20_000 })
      expect((await editorHint.boundingBox())?.height ?? 0).toBeGreaterThan(0)

      const footer = page.locator('footer')
      await footer.waitFor({ timeout: 20_000 })
      expect((await footer.boundingBox())?.height ?? 0).toBeGreaterThan(0)

      const sizes = await page.evaluate(() => {
        const dom = globalThis as unknown as {
          document: {
            getElementById(id: string): { clientHeight: number } | null
            documentElement: { clientHeight: number }
          }
        }
        return {
          root: dom.document.getElementById('app')?.clientHeight ?? 0,
          viewport: dom.document.documentElement.clientHeight,
        }
      })
      // Sin alto propio la raíz se queda en el alto de su contenido, que es
      // una fracción de la ventana. El margen absorbe el redondeo de píxeles.
      expect(sizes.root).toBeGreaterThanOrEqual(sizes.viewport - 2)
    } finally {
      await app.close()
      rmSync(userData, { recursive: true, force: true })
    }
  })
})
