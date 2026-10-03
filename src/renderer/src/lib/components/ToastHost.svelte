<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { fly } from 'svelte/transition'
  import { toastsForPlacement, type ToastPlacement } from '$lib/toast'
  import { toasts } from '$lib/toast.svelte'

  /** `setWindowOpenHandler` del proceso principal lo deriva al navegador del sistema. */
  function openNoticeLink(href: string): void {
    window.open(href, '_blank', 'noopener')
  }
</script>

{#snippet stack(placement: ToastPlacement, y: number)}
  {#each toastsForPlacement(toasts.items, placement) as toast (toast.id)}
    <div
      class={['toast', { notice: toast.type === 'notice' }]}
      transition:fly={{ y, duration: 180 }}
    >
      {#if toast.type === 'notice'}
        <button
          type="button"
          class="close"
          aria-label="Cerrar aviso"
          onclick={() => toasts.dismiss(toast.id)}
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      {/if}
      <p class="message">{toast.message}</p>
      {#if toast.detail}
        <p class="detail">{toast.detail}</p>
      {/if}
      {#if toast.action}
        {@const action = toast.action}
        <button type="button" class="link" onclick={() => openNoticeLink(action.href)}>
          {action.label}
        </button>
      {/if}
    </div>
  {/each}
{/snippet}

<div class="host top" aria-live="polite">
  {@render stack('top-right', -12)}
</div>

<div class="host bottom" aria-live="polite">
  {@render stack('bottom-right', 12)}
</div>

<style>
  .host {
    position: fixed;
    right: 1.25rem;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    pointer-events: none;
  }

  .host.top {
    top: 1.25rem;
  }

  .host.bottom {
    bottom: 1.25rem;
  }

  .toast {
    position: relative;
    max-width: min(28rem, calc(100vw - 2.5rem));
    padding: 0.7rem 0.95rem;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.4;
    box-shadow: 0 10px 28px var(--shadow);
  }

  .toast.notice {
    padding-right: 2.1rem;
    pointer-events: auto;
  }

  .message {
    margin: 0;
    white-space: pre-line;
  }

  .detail {
    margin: 0.5rem 0 0;
    padding: 0.45rem 0.55rem;
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    line-height: 1.45;
    white-space: pre-line;
  }

  .close {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    pointer-events: auto;
  }

  .close:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .link {
    display: inline-flex;
    align-items: center;
    margin-top: 0.55rem;
    padding: 0.3rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-hover);
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    pointer-events: auto;
  }

  .link:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
