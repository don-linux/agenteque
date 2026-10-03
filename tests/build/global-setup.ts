import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TestProject } from 'vitest/node'
import { outDir, root } from './paths'

/**
 * Runs `electron-vite build` once for the whole build project. A failing build must not
 * throw here: the result is handed to the tests so the regression test itself goes red.
 */
export default function setup(project: TestProject): void {
  rmSync(outDir, { recursive: true, force: true })

  const result = spawnSync(
    process.execPath,
    [resolve(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } },
  )

  project.provide('electronViteBuild', {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`,
  })
}
