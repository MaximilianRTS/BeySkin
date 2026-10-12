<script setup lang="ts">
import { onMounted, watch } from 'vue'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import ConfirmHost from '@/components/common/ConfirmHost.vue'
import UpdateBanner from '@/components/common/UpdateBanner.vue'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'

const editor = useEditorStore()
const library = useLibraryStore()

onMounted(async () => {
  await Promise.all([editor.init(), library.init()])
  // Autosave: the design being edited is mirrored into "My designs" (debounced).
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => editor.design,
    (d) => {
      clearTimeout(timer)
      timer = setTimeout(() => library.upsert(d), 400)
    },
    { deep: true, immediate: true },
  )
})
</script>

<template>
  <AppHeader />
  <main class="app-main">
    <RouterView />
  </main>
  <AppFooter />
  <ToastHost />
  <ConfirmHost />
  <!-- Registers the service worker and offers reloading when a new version is ready. -->
  <UpdateBanner />
</template>

<style scoped>
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
