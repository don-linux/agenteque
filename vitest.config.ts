import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  test: {
    projects: [
      {
        // Los módulos del renderer se importan entre ellos con `$lib`, igual
        // que en la aplicación.
        resolve: {
          alias: [{ find: '$lib', replacement: resolve(root, 'src/renderer/src/lib') }],
        },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'build',
          include: ['tests/build/**/*.test.ts'],
          globalSetup: ['tests/build/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 300_000,
        },
      },
      {
        // Client compile for `.svelte` imports. The project stays on the Node
        // environment; happy-dom is created inside the Svelte helper.
        resolve: {
          alias: [
            { find: '$lib', replacement: resolve(root, 'src/renderer/src/lib') },
            {
              find: /^svelte$/,
              replacement: resolve(root, 'node_modules/svelte/src/index-client.js'),
            },
          ],
        },
        plugins: [
          svelte({
            emitCss: false,
            // Vitest transforms this project with the SSR environment, which would
            // compile components for the server. `mount` needs the client build.
            dynamicCompileOptions: () => ({ generate: 'client' }),
          }),
        ],
        server: { hmr: false },
        test: {
          name: 'adversarial',
          include: ['tests/adversarial/**/*.test.ts'],
          globalSetup: ['tests/adversarial/global-setup.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
})
