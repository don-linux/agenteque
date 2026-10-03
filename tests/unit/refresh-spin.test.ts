import { describe, expect, it } from 'vitest'
import { SPIN_MIN_TURNS, SPIN_TURN_MS, spinHoldMs } from '$lib/refresh-spin'

const MIN_MS = SPIN_TURN_MS * SPIN_MIN_TURNS

describe('spinHoldMs', () => {
  it('sostiene las vueltas completas cuando el refresh es instantáneo', () => {
    expect(spinHoldMs(0)).toBe(MIN_MS)
  })

  it('sostiene el resto del mínimo cuando el refresh es rápido', () => {
    expect(spinHoldMs(50)).toBe(MIN_MS - 50)
  })

  it('no sostiene nada cuando el refresh cae justo en el mínimo', () => {
    expect(spinHoldMs(MIN_MS)).toBe(0)
  })

  it('redondea a la siguiente vuelta cuando el refresh es lento', () => {
    expect(spinHoldMs(MIN_MS + 100)).toBe(SPIN_TURN_MS - 100)
  })

  it('cierra en vuelta completa con refreshes muy lentos', () => {
    const elapsed = SPIN_TURN_MS * 5
    expect(spinHoldMs(elapsed)).toBe(0)
    expect(spinHoldMs(elapsed + 1)).toBe(SPIN_TURN_MS - 1)
  })

  it('trata los elapsed negativos como cero', () => {
    expect(spinHoldMs(-500)).toBe(MIN_MS)
  })
})
