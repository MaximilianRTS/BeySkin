import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'error'
export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

export const toasts = ref<Toast[]>([])
let next = 1

/** Shows a transient message (rendered by components/common/ToastHost.vue). */
export function toast(message: string, kind: ToastKind = 'info', ms = 3500) {
  const id = next++
  toasts.value.push({ id, message, kind })
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms)
}
