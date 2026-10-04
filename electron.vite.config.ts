import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      // node-pty is a native addon. Bundling it would drop the .node binary.
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      rolldownOptions: {
        // Sandboxed preload scripts cannot be ES modules.
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    build: {
      // Un subconjunto de fuente pequeño se inlinearía como `data:`, y la CSP
      // del renderer no tiene `font-src`: cae en `default-src 'self'` y
      // Chromium bloquea la carga. Que viajen siempre como fichero.
      assetsInlineLimit: (filePath: string) => (/\.woff2?$/i.test(filePath) ? false : undefined),
    },
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
