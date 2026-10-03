import { resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '../..')
export const outDir = resolve(root, 'out')
export const distDir = resolve(root, 'dist')

export interface BuildResult {
  status: number | null
  output: string
}

declare module 'vitest' {
  export interface ProvidedContext {
    electronViteBuild: BuildResult
  }
}
