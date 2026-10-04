<script lang="ts">
  import { onMount } from 'svelte'
  import { appConfig } from '$lib/app-config.svelte'
  import { ROUTES } from '$lib/app-routes'
  import { workspaceIpc } from '$lib/backend/workspace-ipc'
  import { terminalIpc } from '$lib/backend/terminal-ipc'
  import DeleteEntryModal from '$lib/components/DeleteEntryModal.svelte'
  import FolderVisibilityModal from '$lib/components/FolderVisibilityModal.svelte'
  import ToastHost from '$lib/components/ToastHost.svelte'
  import UnsavedExitModal from '$lib/components/UnsavedExitModal.svelte'
  import { isSettingsRoute } from '$lib/router'
  import { router } from '$lib/router.svelte'
  import HomeScreen from '$lib/screens/HomeScreen.svelte'
  import SettingsScreen from '$lib/screens/SettingsScreen.svelte'
  import { shellStatus } from '$lib/shell-status.svelte'
  import WorkspaceScreen from '$lib/screens/WorkspaceScreen.svelte'
  import { settingsEditor } from '$lib/settings-editor.svelte'
  import { applyTheme } from '$lib/ui-theme'
  import { terminal } from '$lib/terminal.svelte'
  import { useTerminalBackend } from '$lib/terminal-preview-session'
  import { workspace } from '$lib/workspace.svelte'

  let route = $derived(router.route)
  let settings = $derived(isSettingsRoute(route))
  // El guard de `/workspace`: sin carpeta abierta la ruta no tiene contenido.
  let ide = $derived(route === ROUTES.workspace && workspace.root !== null)

  $effect(() => {
    applyTheme(document.documentElement, settingsEditor.uiTheme)
  })

  $effect(() => {
    if (route !== ROUTES.workspace || workspace.root !== null) return
    router.go(ROUTES.home)
  })

  onMount(() => {
    const stop = router.start()
    if (typeof window.api.ptySpawn === 'function') {
      workspace.use(workspaceIpc)
      terminal.use(terminalIpc)
      useTerminalBackend(terminalIpc)
      void shellStatus.load()
      window.api.onWorkspaceChanged((root) => {
        if (workspace.root === root) void workspace.refreshTree()
      })
    }
    window.api.notifyRendererReady()
    void appConfig.load()
    return stop
  })
</script>

<div class="shell">
  <div class="page">
    {#if settings}
      <SettingsScreen {route} />
    {:else if ide}
      <WorkspaceScreen />
    {:else}
      <HomeScreen />
    {/if}
  </div>
</div>
<UnsavedExitModal />
<FolderVisibilityModal />
<DeleteEntryModal />
<ToastHost />

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .page {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
