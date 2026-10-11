<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LibraryPanel from './LibraryPanel.vue'
import Icon from '@/components/common/Icon.vue'

/** "My designs" as its own window: current design, saved designs, printing, backups. */
const emit = defineEmits<{ close: []; print: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDivElement>()
onMounted(() => dialog.value?.focus())
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="dialog" class="dialog library-dialog" role="dialog" aria-modal="true" :aria-label="t('library.title')" tabindex="-1">
      <header class="row head">
        <h2>{{ t('library.title') }}</h2>
        <span class="spacer" />
        <button class="btn btn-ghost btn-icon" :aria-label="t('common.close')" :title="t('common.close')" @click="emit('close')">
          <Icon name="x" />
        </button>
      </header>
      <LibraryPanel @print="emit('print')" @opened="emit('close')" />
    </div>
  </div>
</template>

<style scoped>
.library-dialog {
  width: min(480px, 100%);
}
.head {
  margin-bottom: 12px;
}
.head h2 {
  margin: 0;
  font-size: 18px;
}
</style>
