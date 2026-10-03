import {
  asHomeSurface,
  nextSurfaceAfterLeave,
  type WorkspaceHomeSurface,
  type WorkspaceSurface,
} from '$lib/workspace-surface'

export type { WorkspaceHomeSurface, WorkspaceSurface }

class WorkspaceSurfaceState {
  current = $state<WorkspaceSurface>('editor')
  previous = $state<WorkspaceHomeSurface>('editor')

  enterBrowser(): void {
    if (this.current !== 'browser') {
      this.previous = asHomeSurface(this.current)
    }
    this.current = 'browser'
  }

  leaveBrowser(): void {
    this.current = nextSurfaceAfterLeave(this.current, this.previous)
  }

  set(next: WorkspaceSurface): void {
    if (next === 'browser') {
      this.enterBrowser()
      return
    }

    this.previous = next
    this.current = next
  }
}

export const surface = new WorkspaceSurfaceState()
