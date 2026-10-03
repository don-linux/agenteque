import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { distDir, outDir, root } from './helpers/paths'

/**
 * Builds the app and the unpacked package once for the adversarial project.
 * A failing command throws here so the suite does not run against a stale tree.
 */
export default function setup(): void {
  rmSync(outDir, { recursive: true, force: true })
  rmSync(distDir, { recursive: true, force: true })

  run(
    [resolve(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
    'electron-vite build',
  )
  run([resolve(root, 'node_modules/electron-builder/cli.js'), '--dir'], 'electron-builder --dir')
}

function run(args: string[], label: string): void {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  if (result.status === 0) return

  throw new Error(
    `${label} failed (status ${result.status}):\n${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`,
  )
}
