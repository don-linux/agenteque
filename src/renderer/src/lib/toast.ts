export const TOAST_DURATION_MS = 3000
export const HINT_TOAST_DURATION_MS = 8000
export const SETTINGS_SAVED_TOAST = 'Configuración guardada'

export type ToastType = 'success' | 'hint' | 'notice'
export type ToastPlacement = 'bottom-right' | 'top-right'

export interface ToastAction {
  label: string
  href: string
}

export interface NoticeToastOpts {
  detail?: string
  action?: ToastAction
}

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  placement: ToastPlacement
  detail?: string
  action?: ToastAction
  sticky?: boolean
}

export function createSuccessToast(id: number, message: string): ToastItem {
  return { id, message, type: 'success', placement: 'bottom-right' }
}

export function createHintToast(id: number, message: string): ToastItem {
  return { id, message, type: 'hint', placement: 'top-right' }
}

export function createNoticeToast(
  id: number,
  message: string,
  opts: NoticeToastOpts = {},
): ToastItem {
  const toast: ToastItem = {
    id,
    message,
    type: 'notice',
    placement: 'bottom-right',
    sticky: true,
  }
  if (opts.detail !== undefined) toast.detail = opts.detail
  if (opts.action !== undefined) toast.action = opts.action
  return toast
}

export function withoutToast(items: readonly ToastItem[], id: number): ToastItem[] {
  return items.filter((item) => item.id !== id)
}

export function toastsForPlacement(
  items: readonly ToastItem[],
  placement: ToastPlacement,
): ToastItem[] {
  return items.filter((item) => item.placement === placement)
}
