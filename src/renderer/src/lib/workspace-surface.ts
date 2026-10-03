export type WorkspaceSurface = 'editor' | 'terminals' | 'browser'

export type WorkspaceHomeSurface = Exclude<WorkspaceSurface, 'browser'>

export function asHomeSurface(surface: WorkspaceSurface): WorkspaceHomeSurface {
  return surface === 'browser' ? 'editor' : surface
}

/** Surface to restore when leaving the browser. No-op if not on `browser`. */
export function nextSurfaceAfterLeave(
  current: WorkspaceSurface,
  previous: WorkspaceHomeSurface,
): WorkspaceSurface {
  return current === 'browser' ? previous : current
}
