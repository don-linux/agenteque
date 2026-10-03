import {
  HINT_TOAST_DURATION_MS,
  TOAST_DURATION_MS,
  createHintToast,
  createNoticeToast,
  createSuccessToast,
  withoutToast,
  type NoticeToastOpts,
  type ToastItem,
} from '$lib/toast'

class ToastBus {
  items = $state<ToastItem[]>([])
  #nextId = 0
  #timers = new Map<number, ReturnType<typeof setTimeout>>()

  success(message: string): number {
    return this.#push(createSuccessToast(++this.#nextId, message), TOAST_DURATION_MS)
  }

  successLong(message: string): number {
    return this.#push(createSuccessToast(++this.#nextId, message), HINT_TOAST_DURATION_MS)
  }

  hint(message: string): number {
    return this.#push(createHintToast(++this.#nextId, message), HINT_TOAST_DURATION_MS)
  }

  notice(message: string, opts: NoticeToastOpts = {}): number {
    const toast = createNoticeToast(++this.#nextId, message, opts)
    this.items = [...this.items, toast]
    return toast.id
  }

  dismiss(id: number): void {
    const timer = this.#timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.#timers.delete(id)
    }
    this.items = withoutToast(this.items, id)
  }

  #push(toast: ToastItem, duration: number): number {
    this.items = [...this.items, toast]
    const timer = setTimeout(() => this.dismiss(toast.id), duration)
    this.#timers.set(toast.id, timer)
    return toast.id
  }
}

export const toasts = new ToastBus()
