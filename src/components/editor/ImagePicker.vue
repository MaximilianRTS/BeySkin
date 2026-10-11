<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ASSET_DRAG_TYPE, assetsVersion, assetThumbUrl, deleteAsset, listAssets, type AssetMeta } from '@/lib/assets'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'
import Icon from '@/components/common/Icon.vue'

/**
 * Popover under "+ Image": upload a new picture or reuse a previous upload
 * (click to insert, or drag it to an exact spot on the canvas).
 */
const emit = defineEmits<{ upload: []; close: [] }>()
const { t } = useI18n()
const editor = useEditorStore()
const library = useLibraryStore()

const assets = ref<AssetMeta[]>([])
const thumbs = ref<Record<string, string>>({})
const dragging = ref(false)

async function refresh() {
  assets.value = await listAssets()
  for (const a of assets.value) {
    if (!thumbs.value[a.id]) assetThumbUrl(a.id).then((url) => (thumbs.value = { ...thumbs.value, [a.id]: url })).catch(() => {})
  }
}
onMounted(refresh)
watch(assetsVersion, refresh)

/** Ids used by the current design or any saved design. */
const inUse = computed(() => {
  const ids = new Set<string>()
  for (const d of [editor.design, ...library.entries.map((e) => e.design)]) {
    for (const l of d.layers) if (l.type === 'image' && l.assetId) ids.add(l.assetId)
  }
  return ids
})

function add(a: AssetMeta) {
  editor.addAssetLayer({ id: a.id, width: a.width, height: a.height, name: a.name })
  emit('close')
}

// While dragging, the popover fades out so the canvas is reachable; it closes on drop/drag end.
function onDragStart(a: AssetMeta, e: DragEvent) {
  e.dataTransfer?.setData(ASSET_DRAG_TYPE, JSON.stringify({ id: a.id, width: a.width, height: a.height, name: a.name }))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
  dragging.value = true
}
function onDragEnd() {
  dragging.value = false
  emit('close')
}

async function remove(a: AssetMeta) {
  const ok = await confirmDialog(inUse.value.has(a.id) ? t('editor.image_in_use_confirm') : t('editor.delete_image_confirm'), {
    danger: true,
    confirmLabel: t('editor.delete'),
  })
  if (!ok) return
  await deleteAsset(a.id)
  toast(t('editor.image_deleted'), 'success')
}
</script>

<template>
  <div class="image-picker card" :class="{ dragging }" role="dialog" :aria-label="t('editor.my_images')" @keydown.esc="emit('close')">
    <div class="head">
      <span class="title">{{ t('editor.my_images') }}</span>
      <span class="muted hint">{{ t('editor.my_images_hint') }}</span>
    </div>
    <ul class="grid">
      <li>
        <button class="upload" @click="emit('upload')">
          <Icon name="upload" :size="20" />
          <span>{{ t('editor.upload_new') }}</span>
        </button>
      </li>
      <li v-for="a in assets" :key="a.id" class="tile">
        <button
          class="thumb"
          draggable="true"
          :title="a.name || t('editor.add_image')"
          :aria-label="t('editor.insert_image', { name: a.name || '' })"
          @click="add(a)"
          @dragstart="onDragStart(a, $event)"
          @dragend="onDragEnd"
        >
          <img v-if="thumbs[a.id]" :src="thumbs[a.id]" alt="" draggable="false" />
        </button>
        <button class="del" :aria-label="t('editor.delete')" :title="t('editor.delete')" @click.stop="remove(a)">
          <Icon name="x" :size="12" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.image-picker {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: min(380px, calc(100vw - 32px));
  max-height: min(420px, 60dvh);
  overflow: auto;
  padding: 12px;
  box-shadow: var(--shadow);
  transition: opacity 0.15s;
}
.image-picker.dragging {
  opacity: 0.25;
  pointer-events: none;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}
.title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint {
  font-size: 12px;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.upload,
.thumb {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.upload {
  gap: 4px;
  padding: 6px;
  border: 1px dashed var(--accent-border);
  background: var(--accent-soft);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}
.upload:hover {
  filter: brightness(1.15);
}
.tile {
  position: relative;
}
.thumb {
  padding: 4px;
  border: 1px solid var(--border);
  background: repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface-3) 0 50%) 0 0 / 12px 12px;
  cursor: grab;
}
.thumb:hover {
  border-color: var(--accent-border);
}
.thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.del {
  position: absolute;
  top: 3px;
  right: 3px;
  display: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  cursor: pointer;
}
.tile:hover .del,
.del:focus-visible {
  display: grid;
}
</style>
