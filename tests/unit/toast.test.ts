import { describe, expect, it } from 'vitest'
import {
  HINT_TOAST_DURATION_MS,
  SETTINGS_SAVED_TOAST,
  TOAST_DURATION_MS,
  createHintToast,
  createNoticeToast,
  createSuccessToast,
  toastsForPlacement,
  withoutToast,
} from '$lib/toast'

describe('createSuccessToast', () => {
  it('builds a success toast with the saved-settings copy', () => {
    expect(createSuccessToast(3, SETTINGS_SAVED_TOAST)).toEqual({
      id: 3,
      message: 'Configuración guardada',
      type: 'success',
      placement: 'bottom-right',
    })
  })
})

describe('createHintToast', () => {
  it('places hints at the top right', () => {
    expect(createHintToast(4, 'hint')).toEqual({
      id: 4,
      message: 'hint',
      type: 'hint',
      placement: 'top-right',
    })
  })
})

describe('createNoticeToast', () => {
  it('builds a sticky notice at the bottom right', () => {
    expect(createNoticeToast(5, 'aviso')).toEqual({
      id: 5,
      message: 'aviso',
      type: 'notice',
      placement: 'bottom-right',
      sticky: true,
    })
  })

  it('keeps optional detail and action when provided', () => {
    expect(
      createNoticeToast(6, 'aviso', {
        detail: 'Candidato: 1\nActual: 2',
        action: { label: 'Abrir issue', href: 'https://example.com' },
      }),
    ).toEqual({
      id: 6,
      message: 'aviso',
      type: 'notice',
      placement: 'bottom-right',
      sticky: true,
      detail: 'Candidato: 1\nActual: 2',
      action: { label: 'Abrir issue', href: 'https://example.com' },
    })
  })
})

describe('withoutToast', () => {
  const first = createSuccessToast(1, 'uno')
  const second = createSuccessToast(2, 'dos')

  it('removes only the matching toast', () => {
    expect(withoutToast([first, second], 1)).toEqual([second])
  })

  it('keeps the list when the id is unknown', () => {
    expect(withoutToast([first], 9)).toEqual([first])
  })
})

describe('toastsForPlacement', () => {
  const success = createSuccessToast(1, 'abajo')
  const hint = createHintToast(2, 'arriba')
  const notice = createNoticeToast(3, 'aviso')

  it('splits hosts so settings stay at the bottom', () => {
    expect(toastsForPlacement([success, hint], 'bottom-right')).toEqual([success])
    expect(toastsForPlacement([success, hint], 'top-right')).toEqual([hint])
  })

  it('keeps notices with success toasts at the bottom right', () => {
    expect(toastsForPlacement([success, hint, notice], 'bottom-right')).toEqual([success, notice])
    expect(toastsForPlacement([success, hint, notice], 'top-right')).toEqual([hint])
  })
})

describe('durations', () => {
  it('auto-dismisses success after three seconds', () => {
    expect(TOAST_DURATION_MS).toBe(3000)
  })

  it('keeps hints visible longer', () => {
    expect(HINT_TOAST_DURATION_MS).toBe(8000)
  })
})
