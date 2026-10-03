/** Una vuelta completa del icono. */
export const SPIN_TURN_MS = 800

/** Vueltas mínimas visibles aunque el refresh termine al instante. */
export const SPIN_MIN_TURNS = 2

/**
 * Milisegundos que falta girar tras `elapsedMs` de trabajo: nunca menos de
 * SPIN_MIN_TURNS vueltas y siempre cerrando en vuelta completa.
 */
export function spinHoldMs(elapsedMs: number): number {
  const worked = Math.max(0, elapsedMs)
  const floor = SPIN_TURN_MS * SPIN_MIN_TURNS
  const target = Math.max(floor, Math.ceil(worked / SPIN_TURN_MS) * SPIN_TURN_MS)
  return target - worked
}
