<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import TerminalPanel from '$lib/components/TerminalPanel.svelte'
  import { terminal } from '$lib/terminal.svelte'

  let {
    sessionId,
    cwd,
    visible,
    boxWidth = 0,
    boxHeight = 0,
  }: {
    sessionId: string
    cwd: string
    visible: boolean
    boxWidth?: number
    boxHeight?: number
  } = $props()

  let focused = $derived(terminal.activeId === sessionId)

  function onPanePointerDown(): void {
    terminal.focus(sessionId)
  }

  function onClose(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    void terminal.closeSession(sessionId)
  }
</script>

<div
  class={['pane', { focused }]}
  role="group"
  aria-label="Terminal"
  onpointerdown={onPanePointerDown}
>
  <button type="button" class="close" aria-label="Cerrar terminal" title="Cerrar" onclick={onClose}>
    <X size={12} strokeWidth={2} aria-hidden="true" />
  </button>
  <TerminalPanel {sessionId} {cwd} {visible} {boxWidth} {boxHeight} />
</div>

<style>
  .pane {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
    box-shadow: inset 0 0 0 1px transparent;
  }

  .pane.focused {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .close {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-faint);
    opacity: 0;
    cursor: pointer;
  }

  .pane:hover .close,
  .pane.focused .close {
    opacity: 1;
  }

  .close:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
