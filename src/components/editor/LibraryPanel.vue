<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { importProjectFile, projectFileBlob } from '@/lib/projectFile'
import { saveBlob, timestamp } from '@/lib/download'
import { getTemplate, templateName as tplName } from '@/templates'
import Icon from '@/components/common/Icon.vue'

/**
 * "My designs": every design is saved automatically. This list switches between
 * designs, sets how many copies get printed and offers backups.
 */
const emit = defineEmits<{ print: []; opened: [] }>()
const { t } = useI18n()
const editor = useEditorStore()
const library = useLibraryStore()
const fileInput = ref<HTMLInputElement>()

const total = computed(() => library.entries.reduce((n, e) => n + e.quantity, 0))
const templateName = (id: string) => tplName(t, getTemplate(id))

function open(id: string) {
  const e = library.entries.find((x) => x.design.id === id)
  if (!e) return
  if (id !== editor.design.id) editor.loadDesign(e.design)
  emit('opened')
}

function newDesign() {
  editor.newBlank()
  emit('opened')
}

async function remove(id: string) {
  if (!(await confirmDialog(t('library.delete_confirm'), { danger: true, confirmLabel: t('editor.delete') }))) return
  library.remove(id)
  // Deleting the design that is open: continue with a fresh one so it is not re-created by autosave.
  if (id === editor.design.id) editor.newBlank()
}

function rename(id: string, e: Event) {
  const name = (e.target as HTMLInputElement).value.slice(0, 60)
  if (id === editor.design.id) editor.design.name = name
  const entry = library.entries.find((x) => x.design.id === id)
  if (entry) entry.design.name = name
}

async function exportProject() {
  const designs = library.entries.map((e) => e.design)
  if (!designs.length) return toast(t('library.nothing_to_export'), 'error')
  saveBlob(await projectFileBlob(designs), `beyskin-project-${timestamp()}.json`)
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const designs = await importProjectFile(file)
    if (!designs.length) throw new Error('empty')
    library.addDesigns(designs)
    toast(t('library.imported', { n: designs.length }), 'success')
  } catch (err) {
    console.warn(err)
    toast(t('library.import_failed'), 'error')
  }
}
</script>

<template>
  <div class="library">
    <div class="row intro">
      <p class="muted hint">
        <Icon name="check" :size="13" /> {{ t('library.autosave_hint') }}
      </p>
      <button class="btn btn-sm new" @click="newDesign"><Icon name="plus" :size="14" /> {{ t('library.new_design') }}</button>
    </div>

    <p v-if="!library.entries.length" class="muted empty">{{ t('library.empty') }}</p>
    <ul class="items">
      <li v-for="e in library.entries" :key="e.design.id" class="item" :class="{ current: e.design.id === editor.design.id }">
        <button class="thumb" :aria-label="t('library.open')" :title="t('library.open')" @click="open(e.design.id)">
          <img v-if="library.thumbs[e.design.id]" :src="library.thumbs[e.design.id]" alt="" />
        </button>
        <div class="info">
          <input
            class="name"
            :value="e.design.name"
            :placeholder="templateName(e.design.templateId)"
            :aria-label="t('library.name_label')"
            maxlength="60"
            @change="rename(e.design.id, $event)"
          />
          <span class="sub muted">
            {{ templateName(e.design.templateId) }}
            <template v-if="e.design.id === editor.design.id"> · <strong>{{ t('library.open_now') }}</strong></template>
          </span>
          <div class="row actions">
            <div class="qty" :title="t('library.quantity_hint')">
              <button class="btn btn-ghost btn-icon btn-sm" :aria-label="t('library.less')" @click="library.setQuantity(e.design.id, e.quantity - 1)">
                <Icon name="minus" :size="14" />
              </button>
              <span class="count" :class="{ zero: !e.quantity }">{{ e.quantity }}×</span>
              <button class="btn btn-ghost btn-icon btn-sm" :aria-label="t('library.more')" @click="library.setQuantity(e.design.id, e.quantity + 1)">
                <Icon name="plus" :size="14" />
              </button>
            </div>
            <span class="spacer" />
            <button v-if="e.design.id !== editor.design.id" class="btn btn-sm" @click="open(e.design.id)">
              <Icon name="edit" :size="14" /> {{ t('library.open_short') }}
            </button>
            <span v-else class="btn btn-sm editing" aria-disabled="true"><Icon name="edit" :size="14" /> {{ t('library.editing') }}</span>
            <button class="btn btn-ghost btn-icon btn-sm" :title="t('editor.duplicate')" :aria-label="t('editor.duplicate')" @click="library.duplicate(e.design.id)">
              <Icon name="copy" />
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" :title="t('editor.delete')" :aria-label="t('editor.delete')" @click="remove(e.design.id)">
              <Icon name="trash" />
            </button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="library.entries.length" class="muted hint qty-hint">{{ t('library.quantity_hint') }}</p>
    <button class="btn btn-primary print" :disabled="!total" @click="emit('print')">
      <Icon name="print" /> {{ t('library.print', { n: total }) }}
    </button>

    <div class="row project">
      <button class="btn btn-sm btn-ghost" @click="exportProject"><Icon name="download" /> {{ t('library.export_project') }}</button>
      <button class="btn btn-sm btn-ghost" @click="fileInput?.click()"><Icon name="upload" /> {{ t('library.import_project') }}</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImport" />
    </div>
  </div>
</template>

<style scoped>
.intro {
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.hint {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  flex: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}
.hint :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: var(--success);
}
.new {
  flex: none;
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(52dvh, 460px);
  overflow-y: auto;
}
.item {
  display: flex;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-tint);
}
.item.current {
  border-color: var(--border-strong);
  box-shadow: inset 3px 0 0 var(--accent);
}
.thumb {
  flex: none;
  width: 96px;
  height: 60px;
  padding: 2px;
  border: none;
  border-radius: 8px;
  background: repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface-3) 0 50%) 0 0 / 10px 10px;
  cursor: pointer;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.name {
  width: 100%;
  padding: 2px 4px;
  margin-left: -4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}
.name:hover {
  border-color: var(--border);
}
.name:focus {
  outline: none;
  border-color: var(--accent-border);
  background: var(--surface-tint);
}
.name::placeholder {
  color: var(--text);
  opacity: 0.85;
}
.sub {
  font-size: 11px;
}
.sub strong {
  color: var(--text);
  font-weight: 600;
}
.actions {
  gap: 4px;
  margin-top: 2px;
}
.qty {
  display: flex;
  align-items: center;
}
.count {
  min-width: 26px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.count.zero {
  color: var(--text-muted);
}
.editing {
  opacity: 0.55;
  cursor: default;
  pointer-events: none;
}
.qty-hint {
  margin-top: 8px;
  font-size: 11px;
}
.print {
  width: 100%;
  margin-top: 10px;
}
.project {
  margin-top: 8px;
  flex-wrap: wrap;
}
.empty {
  font-size: 13px;
}
</style>
