import type { WorkspaceSurface } from '$lib/terminal.svelte'

export type SurfaceSwapResult = 'entered' | 'left' | 'cancelled' | 'save-failed'

export interface TerminalSurfaceRequest {
  surface: WorkspaceSurface
  hasUnsaved: boolean
  confirmSave: () => Promise<boolean>
  saveAll: () => Promise<boolean>
  enter: () => void
  leave: () => void
}

export async function requestTerminalSurface(
  ctx: TerminalSurfaceRequest,
): Promise<SurfaceSwapResult> {
  if (ctx.surface === 'terminals') {
    ctx.leave()
    return 'left'
  }

  if (ctx.hasUnsaved) {
    const confirmed = await ctx.confirmSave()
    if (!confirmed) return 'cancelled'

    const saved = await ctx.saveAll()
    if (!saved) return 'save-failed'
  }

  ctx.enter()
  return 'entered'
}
