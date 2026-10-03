<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { appConfig } from '$lib/app-config.svelte'
  import { isBrowserToggleAnywhereShortcut } from '$lib/browser-shortcuts'
  import { isSaveShortcut } from '$lib/save-shortcut'
  import { isTerminalDockShortcut, isTerminalSurfaceShortcut } from '$lib/terminal-dock'
  import { terminal } from '$lib/terminal.svelte'
  import { xtermFontFamily } from '$lib/terminal-font'
  import { TERMINAL_XTERM_OPTIONS, resolveTerminalTheme } from '$lib/terminal-theme'
  import '@xterm/xterm/css/xterm.css'

  let {
    cwd,
    sessionId,
    visible = true,
    boxWidth = 0,
    boxHeight = 0,
  }: {
    cwd: string
    sessionId: string
    visible?: boolean
    boxWidth?: number
    boxHeight?: number
  } = $props()

  let host: HTMLDivElement | undefined
  let ready = $state(false)
  let hostWidth = $state(0)
  let hostHeight = $state(0)
  let view: Terminal | undefined
  let fit: FitAddon | undefined
  let lastAppliedThemeId: string | undefined
  let session = $derived(terminal.session(sessionId))

  function fitAndResize(): void {
    if (!view || !fit || !host || !visible) return
    if (host.clientWidth < 2 || host.clientHeight < 2) return

    try {
      fit.fit()
    } catch {
      return
    }

    if (terminal.surface === 'editor') {
      terminal.rememberPark(host.clientWidth, host.clientHeight)
    }

    void terminal.resize(sessionId, view.cols, view.rows)
  }

  onMount(() => {
    if (!host) return

    const xterm = new Terminal({
      ...TERMINAL_XTERM_OPTIONS,
      fontFamily: xtermFontFamily(appConfig.terminalFontFamily),
      fontSize: appConfig.terminalFontSize,
      theme: { ...resolveTerminalTheme(appConfig.terminalTheme) },
    })
    lastAppliedThemeId = appConfig.terminalTheme
    const fitAddon = new FitAddon()

    xterm.loadAddon(fitAddon)
    xterm.attachCustomKeyEventHandler((event) => {
      if (isTerminalDockShortcut(event) || isTerminalSurfaceShortcut(event)) return false
      if (isBrowserToggleAnywhereShortcut(event)) return false
      if (isSaveShortcut(event) && terminal.surface === 'editor') return false
      return true
    })
    xterm.open(host)
    view = xterm
    fit = fitAddon
    terminal.attachWriter(sessionId, (chunk) => xterm.write(chunk))

    const input = xterm.onData((data) => {
      void terminal.write(sessionId, data)
    })

    const observer = new ResizeObserver(() => {
      if (!visible) return
      fitAndResize()
    })
    observer.observe(host)
    ready = true

    return () => {
      view = undefined
      fit = undefined
      lastAppliedThemeId = undefined
      ready = false
      observer.disconnect()
      input.dispose()
      terminal.detachWriter(sessionId)
      xterm.dispose()
    }
  })

  $effect(() => {
    if (!ready || !cwd || !session) return

    const root = cwd
    const id = sessionId
    const shouldSpawn = !session.alive && session.error === null

    const frame = requestAnimationFrame(() => {
      if (visible) fitAndResize()

      if (!shouldSpawn || !view) return
      void terminal.spawn(id, root, view.cols, view.rows).then(() => {
        if (visible) fitAndResize()
        if (terminal.activeId === id) view?.focus()
      })
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  })

  $effect(() => {
    if (!ready || !visible) return
    // Cualquiera de estas medidas cambia la caja que xterm tiene que volver a medir.
    void [
      terminal.surface,
      terminal.open,
      terminal.sessions.length,
      hostWidth,
      hostHeight,
      boxWidth,
      boxHeight,
    ]

    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        fitAndResize()
        view?.refresh(0, Math.max(0, (view.rows ?? 1) - 1))
      })
    })

    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  })

  $effect(() => {
    if (!ready || !view) return

    const family = xtermFontFamily(appConfig.terminalFontFamily)
    const size = appConfig.terminalFontSize
    const themeId = appConfig.terminalTheme
    const changed = view.options.fontFamily !== family || view.options.fontSize !== size

    if (themeId !== lastAppliedThemeId) {
      view.options.theme = { ...resolveTerminalTheme(themeId) }
      lastAppliedThemeId = themeId
    }

    if (!changed) return

    view.options.fontFamily = family
    view.options.fontSize = size
    if (visible) fitAndResize()
  })
</script>

<div
  class="panel"
  style:--terminal-bg={resolveTerminalTheme(appConfig.terminalTheme).background}
  style:width={boxWidth >= 2 ? `${boxWidth}px` : undefined}
  style:height={boxHeight >= 2 ? `${boxHeight}px` : undefined}
>
  <div
    class="host"
    bind:this={host}
    bind:clientWidth={hostWidth}
    bind:clientHeight={hostHeight}
  ></div>
</div>

<style>
  .panel {
    display: flex;
    box-sizing: border-box;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    padding: 0.35rem 0.5rem;
    overflow: hidden;
    background: var(--terminal-bg, var(--bg));
  }

  .host {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .host :global(.xterm) {
    width: 100%;
    height: 100%;
  }

  .host :global(.xterm-viewport) {
    background-color: var(--terminal-bg, var(--bg));
    overflow-y: auto;
  }

  .host :global(.composition-view) {
    background-color: var(--terminal-bg, var(--bg));
  }
</style>
