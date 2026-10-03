export const WORKSPACE_PTY_ID = 'workspace'
export const PREVIEW_PTY_ID = 'preview'
export const MAX_TERMINAL_SESSIONS = 6

export function workspacePtyId(serial: number): string {
  return `${WORKSPACE_PTY_ID}-${serial}`
}

export function isWorkspacePtyId(id: string): boolean {
  return id === WORKSPACE_PTY_ID || id.startsWith(`${WORKSPACE_PTY_ID}-`)
}
