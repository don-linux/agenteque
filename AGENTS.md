# AGENTS.md

## Stack rules

- Package manager is **pnpm** (pinned via `packageManager`). Never use bun, npm or yarn to install.
- Linting and formatting are **oxlint** + **oxfmt** only. Do not add ESLint, Prettier or their configs.
- Svelte 5 + plain Vite, **no SvelteKit**. `$lib` is a Vite alias for `src/renderer/src/lib`.
- Dependency versions are pinned exactly (no `^`/`~`). electron-vite is a 6.0.0 beta; bumps must keep `pnpm test:build` green.
- Keep `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. New main-process capabilities go through an IPC channel in `src/shared/ipc.ts`, a handler in `src/main`, and a method on `window.api` in `src/preload`.

## Commands

```sh
pnpm install
pnpm lint        # oxlint
pnpm fmt:check   # oxfmt --check (pnpm fmt to write)
pnpm check       # svelte-check + tsc
pnpm test        # unit tests
pnpm build       # electron-vite build -> out/
pnpm test:build  # build regression tests + packaged-app smoke test (needs a display)
pnpm dev         # dev mode with HMR (needs a display)
pnpm dist --dir  # unpacked package in dist/
```

## Cloud container notes

- GUI commands need the virtual display: run them with `DISPLAY=:1` (for example `DISPLAY=:1 pnpm dev`). `pnpm test:build` defaults to `:1` when `DISPLAY` is unset.
- Electron 44 has no postinstall of its own and electron-vite 6 beta does not trigger its lazy download, so the root `postinstall` script runs `install-electron`. If `pnpm dev` throws `Electron uninstall`, run `pnpm exec install-electron`.
- Chromium's sandbox needs either unprivileged user namespaces or a setuid-root `chrome-sandbox` helper. If Electron aborts with "The SUID sandbox helper binary was found, but is not configured correctly", do not chown/chmod files in `node_modules`; launch with `--no-sandbox` instead (`pnpm dev --noSandbox`, or pass `--no-sandbox` to the packaged binary). The smoke test always passes `--no-sandbox`.
- D-Bus errors in the Electron log (`Failed to connect to the bus`) are harmless in the container.
