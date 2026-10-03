import { resolve } from 'node:path'

/** Repo root. Internal to the harness; test authors should use the helper APIs. */
export const root = resolve(import.meta.dirname, '../../..')

export const outDir = resolve(root, 'out')
export const distDir = resolve(root, 'dist')
export const builtMainEntry = resolve(outDir, 'main/index.js')
