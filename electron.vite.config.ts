import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rolldownOptions: {
        // Sandboxed preload scripts cannot be ES modules.
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        $lib: resolve(import.meta.dirname, 'src/renderer/src/lib'),
      },
    },
    plugins: [svelte()],
    server: {
      headers: {
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
  },
})
