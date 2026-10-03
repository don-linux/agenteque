<script lang="ts">
  import { onDestroy } from 'svelte'
  import { dragSize, TREE_WIDTH_STEP } from '$lib/panel-resize'

  let {
    axis,
    grow,
    size,
    label,
    onSize,
    onCommit,
  }: {
    /** "x" resizes a width, "y" resizes a height. */
    axis: 'x' | 'y'
    /** Whether the panel grows with the pointer or against it. */
    grow: 'forward' | 'backward'
    size: number
    label: string
    onSize: (pixels: number) => void
    onCommit: () => void
  } = $props()

  let dragging = $state(false)
  let stop: (() => void) | null = null

  function coordinate(event: PointerEvent): number {
    return axis === 'x' ? event.clientX : event.clientY
  }

  function startResize(event: PointerEvent): void {
    event.preventDefault()
    stop?.()

    const origin = { start: coordinate(event), startSize: size, grow }
    dragging = true

    function move(next: PointerEvent): void {
      onSize(dragSize(origin, coordinate(next)))
    }

    function up(): void {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      dragging = false
      stop = null
      onCommit()
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    stop = up
  }

  function onKeydown(event: KeyboardEvent): void {
    const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    const backward = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'

    if (event.key !== forward && event.key !== backward) return

    const towardsPointer = event.key === forward
    const wider = grow === 'forward' ? towardsPointer : !towardsPointer

    event.preventDefault()
    onSize(size + (wider ? TREE_WIDTH_STEP : -TREE_WIDTH_STEP))
    onCommit()
  }

  onDestroy(() => stop?.())
</script>

<button
  type="button"
  class={['split', axis, { dragging }]}
  aria-label={label}
  onpointerdown={startResize}
  onkeydown={onKeydown}
></button>

<style>
  .split {
    box-sizing: border-box;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    background: var(--border);
  }

  .split.x {
    width: 4px;
    height: 100%;
    cursor: col-resize;
  }

  .split.y {
    width: 100%;
    height: 4px;
    cursor: row-resize;
  }

  .split:hover,
  .split.dragging,
  .split:focus-visible {
    background: var(--accent);
    outline: none;
  }
</style>
