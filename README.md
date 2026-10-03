# agenteque

Desktop app built with Electron 44, electron-vite 6 (beta) + Vite 8 (rolldown) and Svelte 5 (no SvelteKit).

## Requirements

- Node.js `^22.12.0 || >=24`
- pnpm, pinned through `packageManager` (`corepack enable` picks the right version)

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the Vite dev server for the renderer (with Svelte HMR), builds main and preload, and launches Electron.

## Scripts

| Script                   | What it does                                                              |
| ------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`               | Dev mode with HMR                                                         |
| `pnpm build`             | Production build of main, preload and renderer into `out/`                |
| `pnpm preview`           | Runs Electron against the production build in `out/`                      |
| `pnpm lint`              | oxlint                                                                    |
| `pnpm fmt` / `fmt:check` | oxfmt (write / check)                                                     |
| `pnpm check`             | svelte-check for the renderer + `tsc` for main, preload, tests and config |
| `pnpm test`              | Unit tests (vitest)                                                       |
| `pnpm test:build`        | Build regression tests + packaged-app smoke test (see below)              |
| `pnpm dist` (`--dir`)    | Build and package with electron-builder into `dist/`                      |

## Layout

```
src/
  main/       Electron main process: window, IPC handlers
  preload/    contextBridge API exposed as window.api (index.d.ts types it for the renderer)
  renderer/   Svelte 5 app (index.html, src/main.ts, src/App.svelte, src/lib → $lib)
  shared/     IPC channel names and types shared by main, preload and renderer
tests/
  unit/       Fast unit tests (pnpm test)
  build/      Build/packaging regression tests (pnpm test:build)
```

Security defaults: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer only talks to the main process through the typed `window.api` exposed by the preload. Because sandboxed preloads cannot be ES modules, the preload is emitted as CommonJS (`out/preload/index.cjs`) while main is ESM (`out/main/index.js`).

## Build regression tests

`pnpm test:build` runs `electron-vite build` once and then checks `out/`, so every bump of electron-vite or Vite re-validates known upstream issues:

- [electron-vite#925](https://github.com/alex8088/electron-vite/issues/925): the Svelte renderer build fails with Vite 8 (`Expected token }`).
- [electron-vite#906](https://github.com/alex8088/electron-vite/issues/906): the ESM shim can empty the main bundle.
- Packaged-app smoke test: runs `electron-builder --dir`, launches the packaged binary with `--no-sandbox --smoke-test` and expects exit code 0 once the renderer reports over IPC that it mounted.

It needs a display (`DISPLAY`, defaults to `:1`).
