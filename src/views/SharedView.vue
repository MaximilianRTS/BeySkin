<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { decodeDesign, countPlaceholders } from '@/lib/share'
import { renderDesignCanvas } from '@/lib/render'
import { newDesign, type Design } from '@/lib/model'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'
import { toast } from '@/lib/toast'
import { getTemplate } from '@/templates'
import Icon from '@/components/common/Icon.vue'

/** Opens a design from a share link. Everything happens locally in the browser. */
const props = defineProps<{ data: string }>()
const { t } = useI18n()
const router = useRouter()
const editor = useEditorStore()
const library = useLibraryStore()

const design = ref<Design | null>(null)
const preview = ref<string>('')
const error = ref(false)

onMounted(async () => {
  try {
    const d = await decodeDesign(props.data)
    design.value = d
    const canvas = await renderDesignCanvas(d, { pxPerMm: 8, clip: 'outline', placeholders: true })
    preview.value = canvas.toDataURL('image/png')
  } catch {
    error.value = true
  }
})

/** Fresh id so a remix never overwrites one of the user's own designs. */
function asCopy(d: Design): Design {
  return { ...newDesign(d.templateId, d.name), layers: d.layers }
}

async function openInEditor() {
  if (!design.value) return
  // The design that was open is already autosaved in "My designs", so no confirmation is needed.
  editor.loadDesign(asCopy(design.value))
  await router.push('/')
}

function saveToLibrary() {
  if (!design.value) return
  library.save(asCopy(design.value))
  toast(t('library.saved'), 'success')
}
</script>

<template>
  <div class="page shared">
    <div v-if="error" class="card box">
      <h1><Icon name="alert" :size="22" /> {{ t('share.invalid_title') }}</h1>
      <p class="muted">{{ t('share.invalid_text') }}</p>
      <RouterLink to="/" class="btn btn-primary">{{ t('share.to_editor') }}</RouterLink>
    </div>
    <div v-else-if="design" class="card box">
      <p class="eyebrow">{{ t('share.received') }}</p>
      <h1>{{ design.name || t(`templates.${getTemplate(design.templateId).i18nKey}`) }}</h1>
      <p class="muted">{{ t(`templates.${getTemplate(design.templateId).i18nKey}`) }} · {{ getTemplate(design.templateId).widthMm }} × {{ getTemplate(design.templateId).heightMm }} mm</p>
      <div class="preview">
        <img v-if="preview" :src="preview" :alt="t('share.preview_alt')" />
      </div>
      <p v-if="countPlaceholders(design)" class="notice">
        <Icon name="image" /> {{ t('share.has_placeholders', { n: countPlaceholders(design) }) }}
      </p>
      <div class="row wrap">
        <button class="btn btn-primary" @click="openInEditor"><Icon name="edit" /> {{ t('share.remix') }}</button>
        <button class="btn" @click="saveToLibrary"><Icon name="save" /> {{ t('share.save') }}</button>
      </div>
      <p class="muted tiny">{{ t('share.local_note') }}</p>
    </div>
    <p v-else class="muted">{{ t('common.loading') }}</p>
  </div>
</template>

<style scoped>
.shared {
  max-width: 760px;
}
.box {
  padding: 24px;
}
.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-hover);
}
h1 {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 24px;
}
.preview {
  margin: 16px 0;
  padding: 16px;
  border-radius: var(--radius);
  background: repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface-3) 0 50%) 0 0 / 16px 16px;
  display: grid;
  place-items: center;
}
.preview img {
  max-width: 100%;
  max-height: 260px;
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.35));
}
.notice {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}
.wrap {
  flex-wrap: wrap;
}
.tiny {
  font-size: 12px;
  margin-top: 14px;
}
</style>
