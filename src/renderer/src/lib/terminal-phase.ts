export type TerminalPhase = 'idle' | 'running' | 'exited'

/** Texto que pinta un xterm nuevo cuando la sesión ya hizo `exit`. */
export const TERMINAL_SESSION_ENDED = 'La sesión ha terminado.\r\n'

/**
 * Solo una sesión que no ha arrancado pide `spawn`. `running` ya tiene
 * proceso y `exited` se queda muerto: un `exit` no revive el mismo xterm.
 */
export function shouldSpawnTerminal(phase: TerminalPhase, error: string | null): boolean {
  return phase === 'idle' && error === null
}

/**
 * El widget desapareció. Una sesión viva pasa a desconectada para que el
 * siguiente montaje haga `kill` + `spawn`. Un `exit` sigue muerto.
 */
export function phaseAfterWidgetGone(phase: TerminalPhase): TerminalPhase {
  if (phase === 'exited') return 'exited'
  return 'idle'
}
