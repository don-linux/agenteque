import { describe, expect, it } from 'vitest'
import {
  PAGE_LOAD_FAILED,
  RENDER_CRASHED,
  clearsRenderCrash,
  formatTabError,
  renderCrashedMessage,
} from '$lib/browser-errors'

describe('renderCrashedMessage', () => {
  it('adjunta el status del host entre paréntesis', () => {
    expect(renderCrashedMessage('oom')).toBe(`${RENDER_CRASHED} (oom)`)
    expect(renderCrashedMessage('  crashed ')).toBe(`${RENDER_CRASHED} (crashed)`)
  })

  it('sin status deja el mensaje base', () => {
    expect(renderCrashedMessage('')).toBe(RENDER_CRASHED)
    expect(renderCrashedMessage('   ')).toBe(RENDER_CRASHED)
    expect(renderCrashedMessage('\n\t')).toBe(RENDER_CRASHED)
  })

  it('aplana saltos y tabs del status para que el banner siga siendo una línea', () => {
    expect(renderCrashedMessage('oom\nkilled')).toBe(`${RENDER_CRASHED} (oom killed)`)
    expect(renderCrashedMessage('  crashed \t launch-failed  ')).toBe(
      `${RENDER_CRASHED} (crashed launch-failed)`,
    )
  })
})

describe('clearsRenderCrash', () => {
  it('solo limpia el error de renderer crasheado', () => {
    expect(clearsRenderCrash(renderCrashedMessage('oom'))).toBe(true)
    expect(clearsRenderCrash(RENDER_CRASHED)).toBe(true)
  })

  it('respeta load-error, fatal y exit', () => {
    expect(clearsRenderCrash(null)).toBe(false)
    expect(clearsRenderCrash('')).toBe(false)
    expect(clearsRenderCrash('ERR_INSUFFICIENT_RESOURCES')).toBe(false)
    expect(clearsRenderCrash('El sandbox de Chromium no está disponible')).toBe(false)
    expect(clearsRenderCrash('El navegador se cerró inesperadamente')).toBe(false)
    expect(clearsRenderCrash(`prefijo ${RENDER_CRASHED}`)).toBe(false)
    expect(clearsRenderCrash(renderCrashedMessage('oom\nkilled'))).toBe(true)
  })
})

describe('formatTabError', () => {
  it('traduce el fallo de carga y el crash del guest', () => {
    expect(formatTabError(null)).toBeNull()
    expect(formatTabError({ kind: 'crash', status: 'oom' })).toBe(`${RENDER_CRASHED} (oom)`)
    expect(formatTabError({ kind: 'load', description: 'ERR_NAME_NOT_RESOLVED' })).toBe(
      `${PAGE_LOAD_FAILED} (ERR_NAME_NOT_RESOLVED)`,
    )
    expect(formatTabError({ kind: 'load', description: '  net \n down  ' })).toBe(
      `${PAGE_LOAD_FAILED} (net down)`,
    )
    expect(formatTabError({ kind: 'load', description: '   ' })).toBe(PAGE_LOAD_FAILED)
  })
})
