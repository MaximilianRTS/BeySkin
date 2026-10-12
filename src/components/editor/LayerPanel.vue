<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import type { Layer } from '@/lib/model'
import Icon from '@/components/common/Icon.vue'

const { t } = useI18n()
const store = useEditorStore()

/** Topmost layer first, like every graphics app. */
const rows = computed(() =>
  store.design.layers.map((layer, index) => ({ layer, index })).reverse(),
)
const renamingId = ref<string | null>(null)
const dragId = ref<string | null>(null)
const dropIndex = ref<number | null>(null)

function typeIcon(l: Layer) {
  return { image: 'image', text: 'text', shape: 'shape', fill: 'fill', frame: 'ring' }[l.type]
}

/** Plain click selects just this layer (also inside a group); Shift/Ctrl/Cmd+click toggles it. */
function onRowClick(l: Layer, e: MouseEvent) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) store.toggleSelect(l.id, false)
  else store.selectedId = l.id
}

/** Stable colour per group for the bar in front of its rows. */
function groupColor(groupId: string) {
  let h = 0
  for (const ch of groupId) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 75% 58%)`
}

function finishRename(l: Layer, e: Event) {
  const name = (e.target as HTMLInputElement).value.trim()
  renamingId.value = null
  if (name && name !== l.name) store.updateLayer(l.id, { name })
}

function onDragStart(id: string, e: DragEvent) {
  dragId.value = id
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(index: number, e: DragEvent) {
  if (!dragId.value) return
  e.preventDefault()
  dropIndex.value = index
}
function onDragEnd() {
  dragId.value = null
  dropIndex.value = null
}
function onDrop(index: number) {
  if (dragId.value) store.moveLayer(dragId.value, index)
  dragId.value = null
  dropIndex.value = null
}
</script>

<template>
  <div class="layer-panel">
    <p v-if="!rows.length" class="muted empty">{{ t('editor.no_layers') }}</p>
    <button v-if="store.clipboard" class="btn btn-sm paste" :title="t('editor.paste_layer') + ' (Ctrl+V)'" @click="store.pasteLayer()">
      <Icon name="plus" /> {{ t('editor.paste_layer') }}
    </button>
    <ul class="list" role="listbox" :aria-label="t('editor.layers')">
      <li
        v-for="{ layer, index } in rows"
        :key="layer.id"
        class="row-item"
        :class="{
          selected: store.isSelected(layer.id),
          primary: layer.id === store.selectedId && store.selectedIds.length > 1,
          grouped: !!layer.groupId,
          hidden: !layer.visible,
          drop: dropIndex === index,
        }"
        :style="layer.groupId ? { '--group-color': groupColor(layer.groupId) } : undefined"
        :title="layer.groupId ? t('selection.group_badge') : undefined"
        role="option"
        :aria-selected="store.isSelected(layer.id)"
        draggable="true"
        @dragstart="onDragStart(layer.id, $event)"
        @dragover="onDragOver(index, $event)"
        @drop="onDrop(index)"
        @dragend="onDragEnd"
        @click="onRowClick(layer, $event)"
      >
        <Icon :name="typeIcon(layer)" class="type" />
        <input
          v-if="renamingId === layer.id"
          class="input rename"
          :value="layer.name"
          :aria-label="t('editor.rename')"
          autofocus
          @keydown.enter="finishRename(layer, $event)"
          @keydown.esc="renamingId = null"
          @blur="finishRename(layer, $event)"
          @click.stop
        />
        <span v-else class="name" :title="t('editor.rename_hint')" @dblclick.stop="renamingId = layer.id">{{ layer.name }}</span>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          :aria-label="layer.locked ? t('editor.unlock') : t('editor.lock')"
          :title="layer.locked ? t('editor.unlock') : t('editor.lock')"
          @click.stop="store.updateLayer(layer.id, { locked: !layer.locked })"
        >
          <Icon :name="layer.locked ? 'lock' : 'unlock'" />
        </button>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          :aria-label="layer.visible ? t('editor.hide') : t('editor.show')"
          :title="layer.visible ? t('editor.hide') : t('editor.show')"
          @click.stop="store.updateLayer(layer.id, { visible: !layer.visible })"
        >
          <Icon :name="layer.visible ? 'eye' : 'eye-off'" />
        </button>
      </li>
    </ul>
    <p v-if="rows.length > 1" class="muted multi-hint">{{ t('selection.layers_hint') }}</p>
    <div v-if="store.selected" class="actions">
      <template v-if="store.selectedIds.length === 1">
        <button class="btn btn-sm" :title="t('editor.layer_up')" :aria-label="t('editor.layer_up')"
          @click="store.moveLayer(store.selected.id, store.design.layers.indexOf(store.selected) + 1)">
          <Icon name="up" />
        </button>
        <button class="btn btn-sm" :title="t('editor.layer_down')" :aria-label="t('editor.layer_down')"
          @click="store.moveLayer(store.selected.id, store.design.layers.indexOf(store.selected) - 1)">
          <Icon name="down" />
        </button>
      </template>
      <button class="btn btn-sm" :title="t('editor.duplicate') + ' (Ctrl+D)'" @click="store.duplicateSelected()">
        <Icon name="copy" /> {{ t('editor.duplicate') }}
      </button>
      <button class="btn btn-sm btn-icon" :title="t('editor.copy_layer') + ' (Ctrl+C)'" :aria-label="t('editor.copy_layer')" @click="store.copySelected()">
        <Icon name="file" />
      </button>
      <span class="spacer" />
      <button class="btn btn-sm btn-danger" :title="t('editor.delete') + ' (Del)'" :aria-label="t('editor.delete')"
        @click="store.removeSelected()">
        <Icon name="trash" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
}
.row-item:hover {
  background: var(--surface-2);
}
.row-item.selected {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
.row-item.primary {
  border-color: var(--accent);
}
/* Group members: coloured bar on the left, slightly indented. */
.row-item.grouped {
  position: relative;
  padding-left: 14px;
}
.row-item.grouped::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 3px;
  bottom: 3px;
  width: 3px;
  border-radius: 2px;
  background: var(--group-color);
}
.multi-hint {
  font-size: 11px;
  margin: 6px 0 0;
}
.row-item.hidden .name {
  opacity: 0.45;
}
.row-item.drop {
  border-top: 2px solid var(--accent);
}
.type {
  color: var(--text-muted);
  flex: none;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rename {
  flex: 1;
  min-height: 26px;
  padding: 2px 6px;
}
.actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.paste {
  width: 100%;
  margin-bottom: 6px;
}
.empty {
  font-size: 13px;
  margin: 4px 0 8px;
}
</style>
