<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pendingConfirm } from '@/lib/confirm'

const { t } = useI18n()
const okBtn = ref<HTMLButtonElement>()

function close(ok: boolean) {
  pendingConfirm.value?.resolve(ok)
  pendingConfirm.value = null
}

watch(pendingConfirm, async (v) => {
  if (v) {
    await nextTick()
    okBtn.value?.focus()
  }
})
</script>

<template>
  <div v-if="pendingConfirm" class="dialog-backdrop" @click.self="close(false)" @keydown.esc="close(false)">
    <div class="dialog" role="alertdialog" aria-modal="true" :aria-label="pendingConfirm.message">
      <p>{{ pendingConfirm.message }}</p>
      <div class="dialog-actions">
        <button class="btn" @click="close(false)">{{ t('common.cancel') }}</button>
        <button
          ref="okBtn"
          class="btn"
          :class="pendingConfirm.danger ? 'btn-danger' : 'btn-primary'"
          @click="close(true)"
        >
          {{ pendingConfirm.confirmLabel ?? t('common.ok') }}
        </button>
      </div>
    </div>
  </div>
</template>
