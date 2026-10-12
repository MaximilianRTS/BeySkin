<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'
import { toast } from '@/lib/toast'

const { t } = useI18n()
const editor = useEditorStore()
const library = useLibraryStore()

const HOUR = 60 * 60 * 1000

// Registers the service worker (no-op in dev). A new version waits until the user agrees,
// so nobody loses their work to a surprise reload.
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onOfflineReady: () => toast(t('app.offline_ready'), 'success', 4000),
  onRegisteredSW(_url, reg) {
    // Long-lived tabs: look for a new deployment once an hour.
    if (reg) setInterval(() => navigator.onLine && void reg.update().catch(() => {}), HOUR)
  },
  onRegisterError: (err) => console.warn('[pwa] registration failed', err),
})

const busy = ref(false)
async function reload() {
  busy.value = true
  try {
    // Make sure the design being edited is stored before the page reloads.
    library.upsert(editor.design)
    await library.flush()
  } catch (err) {
    console.warn(err)
  }
  await updateServiceWorker(true)
}
</script>

<template>
  <Transition name="banner">
    <div v-if="needRefresh" class="update-banner card" role="status" aria-live="polite">
      <span>{{ t('app.update_available') }}</span>
      <span class="actions">
        <button class="btn btn-sm btn-ghost" @click="needRefresh = false">{{ t('app.update_later') }}</button>
        <button class="btn btn-sm btn-primary" :disabled="busy" @click="reload">{{ t('app.update_reload') }}</button>
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 210;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 12px 10px 14px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
@media (max-width: 760px) {
  /* Stay above the editor's bottom tab bar. */
  .update-banner {
    left: 16px;
    right: 16px;
    bottom: 64px;
  }
}
.banner-enter-active,
.banner-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .banner-enter-active,
  .banner-leave-active {
    transition: none;
  }
}
</style>
