import { ref } from 'vue'

export interface ConfirmRequest {
  message: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

export const pendingConfirm = ref<ConfirmRequest | null>(null)

/** Promise-based confirm dialog (rendered by components/common/ConfirmHost.vue). */
export function confirmDialog(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  pendingConfirm.value?.resolve(false)
  return new Promise((resolve) => {
    pendingConfirm.value = { message, ...opts, resolve }
  })
}
