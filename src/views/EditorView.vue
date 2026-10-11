<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'
import { exportCutSvg, exportPng } from '@/lib/export'
import { safeFilename, saveBlob } from '@/lib/download'
import { toast } from '@/lib/toast'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import TemplatePicker from '@/components/editor/TemplatePicker.vue'
import LayerPanel from '@/components/editor/LayerPanel.vue'
import PropertiesPanel from '@/components/editor/PropertiesPanel.vue'
const LibraryDialog = defineAsyncComponent(() => import('@/components/editor/LibraryDialog.vue'))
import ImagePicker from '@/components/editor/ImagePicker.vue'
import { ASSET_DRAG_TYPE, listAssets } from '@/lib/assets'
import { confirmDialog } from '@/lib/confirm'
import { TEMPLATES } from '@/templates'
import Icon from '@/components/common/Icon.vue'
import type { FrameDef, PatternId, ShapeDef } from '@/lib/library'

const PrintDialog = defineAsyncComponent(() => import('@/components/editor/PrintDialog.vue'))
const Preview3D = defineAsyncComponent(() => import('@/components/editor/Preview3D.vue'))
const ShareDialog = defineAsyncComponent(() => import('@/components/editor/ShareDialog.vue'))
const StickerPicker = defineAsyncComponent(() => import('@/components/editor/StickerPicker.vue'))

const { t } = useI18n()
const store = useEditorStore()
const library = useLibraryStore()

const canvasRef = ref<InstanceType<typeof EditorCanvas>>()
const propsRef = ref<InstanceType<typeof PropertiesPanel>>()
const fileInput = ref<HTMLInputElement>()
const showPrint = ref(false)
const showShare = ref(false)
const showStickers = ref(false)
const showImages = ref(false)

/** First upload goes straight to the file dialog; afterwards "+ Image" shows previous uploads too. */
async function onImageButton() {
  if (showImages.value) return void (showImages.value = false)
  if ((await listAssets()).length) showImages.value = true
  else fileInput.value?.click()
}
function uploadFromPicker() {
  showImages.value = false
  fileInput.value?.click()
}
const show3d = ref(false)
const showBleed = ref(false)
/** Hide everything outside the cut line (remembered per browser). */
const hideOutside = ref(readFlag('hide-outside'))
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
watch(hideOutside, (v) => {
  try {
    localStorage.setItem('hide-outside', v ? '1' : '0')
  } catch {
    // ignore
  }
})
const exportOpen = ref(false)
const dragging = ref(false)
const mobileTab = ref<'layers' | 'props' | 'templates'>('layers')
const showLibrary = ref(false)

/** Everything is saved automatically; this only reflects whether the open design has content yet. */
const isSaved = computed(() => library.has(store.design.id))

function setDesignName(e: Event) {
  store.design.name = (e.target as HTMLInputElement).value.slice(0, 60)
}

/** Explicit save on top of autosave: stores immediately and confirms it. */
async function saveNow() {
  if (!store.design.layers.length) return toast(t('library.empty_design'), 'error')
  library.upsert(store.design)
  await library.flush()
  toast(t('library.saved'), 'success', 2000)
}

function newDesign() {
  store.newBlank()
  toast(t('library.new_started'), 'info', 2000)
}

function printFromLibrary() {
  showLibrary.value = false
  showPrint.value = true
}

const templateId = computed({
  get: () => store.design.templateId,
  set: (id: string) => {
    store.setTemplate(id)
    // The remembered draft of that template was deleted in "My designs" meanwhile: start fresh.
    if (store.design.layers.length && !library.has(store.design.id)) store.newBlank()
    // Gear Chip quick start for a fresh draft: colour band + frame, only the picture is missing.
    if (!store.design.layers.length && store.template.previewModel === 'chip') {
      store.addFrame('chip-textless-left', t('editor.chip_textless_left'))
    }
  },
})

async function addFiles(files: FileList | File[] | null | undefined) {
  const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!images.length) return
  const { added, failed } = await store.addImages(images)
  if (failed) toast(t('editor.import_failed', { n: failed }), 'error')
  else if (added) mobileTab.value = 'props'
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  void addFiles(input.files)
  input.value = ''
}

// ---------- drag & drop / paste ----------
let dragDepth = 0
function onDragEnter(e: DragEvent) {
  const types = e.dataTransfer?.types ?? []
  if (!types.includes('Files') && !types.includes(ASSET_DRAG_TYPE)) return
  dragDepth++
  dragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(e: DragEvent) {
  dragDepth = 0
  dragging.value = false
  const asset = e.dataTransfer?.getData(ASSET_DRAG_TYPE)
  if (asset) {
    // Dropped from "My images": place it where it was dropped (if over the canvas).
    const a = JSON.parse(asset) as { id: string; width: number; height: number; name: string }
    const overCanvas = !!(e.target as HTMLElement).closest('.canvas-card') && !show3d.value
    store.addAssetLayer(a, overCanvas ? canvasRef.value?.clientToMm(e.clientX, e.clientY) : undefined)
    return
  }
  void addFiles(e.dataTransfer?.files)
}
function onPaste(e: ClipboardEvent) {
  if (isTyping(e.target)) return
  const files = [...(e.clipboardData?.files ?? [])]
  if (files.length) {
    e.preventDefault()
    void addFiles(files)
  } else if (store.clipboard) {
    e.preventDefault()
    store.pasteLayer()
  }
}

// ---------- transfer to another template ----------
const transferTargets = computed(() => TEMPLATES.filter((tp) => tp.id !== store.design.templateId))

async function transfer(e: Event) {
  const select = e.target as HTMLSelectElement
  const id = select.value
  select.value = ''
  if (!id || !store.design.layers.length) return
  if (store.hasDraft(id)) {
    const ok = await confirmDialog(t('editor.transfer_confirm'), { confirmLabel: t('editor.transfer_replace') })
    if (!ok) return
  }
  store.transferTo(id)
  toast(t('editor.transferred'), 'success')
}

// ---------- keyboard ----------
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function onKey(e: KeyboardEvent) {
  if (isTyping(e.target) || document.querySelector('.dialog-backdrop')) return
  const mod = e.ctrlKey || e.metaKey
  const sel = store.selected
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    store.redo()
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void saveNow()
  } else if (mod && e.key.toLowerCase() === 'c' && sel && !window.getSelection()?.toString()) {
    if (store.copySelected()) toast(t('editor.copied_layer'), 'info', 1500)
  } else if (mod && e.key.toLowerCase() === 'd' && sel) {
    e.preventDefault()
    store.duplicateLayer(sel.id)
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
    e.preventDefault()
    store.removeLayer(sel.id)
  } else if ((e.key === '[' || e.key === ']') && sel) {
    e.preventDefault()
    store.moveLayer(sel.id, store.design.layers.indexOf(sel) + (e.key === ']' ? 1 : -1))
  } else if (e.key === 'Escape') {
    store.selectedId = null
  } else if (e.key.startsWith('Arrow') && sel && sel.type !== 'fill' && !sel.locked) {
    e.preventDefault()
    const step = e.shiftKey ? 5 : 0.5
    if (e.key === 'ArrowLeft') sel.x -= step
    if (e.key === 'ArrowRight') sel.x += step
    if (e.key === 'ArrowUp') sel.y -= step
    if (e.key === 'ArrowDown') sel.y += step
    scheduleCommit()
  } else if (e.key === '+' || e.key === '=') {
    canvasRef.value?.zoomBy(1.25)
  } else if (e.key === '-') {
    canvasRef.value?.zoomBy(0.8)
  } else if (e.key === '0') {
    canvasRef.value?.resetView()
  }
}

// Arrow-key nudges are merged into one undo step.
let commitTimer: ReturnType<typeof setTimeout> | null = null
function scheduleCommit() {
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => store.commit(), 500)
}

function onEditText(id: string) {
  store.selectedId = id
  mobileTab.value = 'props'
  void propsRef.value?.focusText()
}

// ---------- export ----------
async function doExport(kind: 'png300' | 'png600' | 'svg') {
  exportOpen.value = false
  if (!store.design.layers.length) return toast(t('library.empty_design'), 'error')
  if (store.design.layers.some((l) => l.type === 'image' && !l.assetId)) toast(t('editor.placeholders_export'), 'info', 5000)
  const base = safeFilename(store.design.name || t(`templates.${store.template.i18nKey}`))
  try {
    if (kind === 'svg') saveBlob(await exportCutSvg(store.design, 300, 0), `${base}-cut.svg`)
    else saveBlob(await exportPng(store.design, kind === 'png600' ? 600 : 300), `${base}.png`)
  } catch (err) {
    console.error(err)
    toast(t('editor.export_failed'), 'error')
  }
}

function onPickShape(shape: ShapeDef) {
  showStickers.value = false
  store.addShape(shape.id, t(`shapes.${shape.id}`))
  mobileTab.value = 'props'
}

function onPickFrame(frame: FrameDef) {
  showStickers.value = false
  store.addFrame(frame.id, t(`editor.${frame.id.replace(/-/g, '_')}`))
  mobileTab.value = 'props'
}

function onPickPattern(id: PatternId) {
  showStickers.value = false
  store.addFill('#1b1f2a', id)
  mobileTab.value = 'props'
}

function openShare() {
  if (!store.design.layers.length) return toast(t('library.empty_design'), 'error')
  showShare.value = true
}

// The 2D canvas changes size when it becomes the mini preview (and back): re-fit it.
watch(show3d, async () => {
  await nextTick()
  requestAnimationFrame(() => canvasRef.value?.resetView())
})

function closeExportMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.export-menu')) exportOpen.value = false
  if (!target.closest('.image-menu') && !target.closest('.dialog-backdrop')) showImages.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('paste', onPaste)
  window.addEventListener('click', closeExportMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('click', closeExportMenu)
})
</script>

<template>
  <div
    class="editor"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Left: templates + layers -->
    <aside class="side left card" :class="{ 'mobile-hidden': mobileTab !== 'templates' && mobileTab !== 'layers' }">
      <section :class="{ 'mobile-hidden': mobileTab !== 'templates' }">
        <h2 class="panel-title">{{ t('editor.template') }}</h2>
        <TemplatePicker v-model="templateId" />
        <p v-if="!store.template.measured" class="estimate muted">
          <Icon name="alert" :size="14" /> {{ t('templates.estimated_hint') }}
        </p>
        <label v-if="store.design.layers.length" class="transfer">
          <Icon name="copy" :size="14" />
          <select class="input" :aria-label="t('editor.transfer_label')" @change="transfer">
            <option value="">{{ t('editor.transfer_label') }}</option>
            <option v-for="tp in transferTargets" :key="tp.id" :value="tp.id">{{ t(`templates.${tp.i18nKey}`) }}</option>
          </select>
        </label>
      </section>
      <section :class="{ 'mobile-hidden': mobileTab !== 'layers' }">
        <h2 class="panel-title">{{ t('editor.layers') }}</h2>
        <LayerPanel />
      </section>

    </aside>

    <!-- Centre: toolbar + canvas -->
    <section class="center">
      <div class="toolbar card" role="toolbar" :aria-label="t('editor.toolbar')">
        <div class="tool-group" role="group" :aria-label="t('editor.add_group')">
          <span class="group-label">{{ t('editor.add_group') }}</span>
          <div class="image-menu">
            <button class="btn add" :class="{ active: showImages }" :aria-expanded="showImages" @click="onImageButton">
              <Icon name="plus" :size="14" class="plus" /><Icon name="image" /> {{ t('editor.add_image') }}
            </button>
            <ImagePicker v-if="showImages" @upload="uploadFromPicker" @close="showImages = false" />
          </div>
          <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFileInput" />
          <button class="btn add" @click="store.addText()"><Icon name="plus" :size="14" class="plus" /><Icon name="text" /> {{ t('editor.add_text') }}</button>
          <button class="btn add" @click="showStickers = true"><Icon name="plus" :size="14" class="plus" /><Icon name="shape" /> {{ t('editor.add_sticker') }}</button>
          <button class="btn add" @click="store.addFill()"><Icon name="plus" :size="14" class="plus" /><Icon name="fill" /> {{ t('editor.add_fill') }}</button>
        </div>
        <span class="divider" />
        <button class="btn btn-icon" :disabled="!store.canUndo" :title="t('editor.undo') + ' (Ctrl+Z)'" :aria-label="t('editor.undo')" @click="store.undo()">
          <Icon name="undo" />
        </button>
        <button class="btn btn-icon" :disabled="!store.canRedo" :title="t('editor.redo') + ' (Ctrl+Y)'" :aria-label="t('editor.redo')" @click="store.redo()">
          <Icon name="redo" />
        </button>
        <span class="divider" />
        <button class="btn btn-icon" :title="t('editor.zoom_in') + ' (+)'" :aria-label="t('editor.zoom_in')" @click="canvasRef?.zoomBy(1.25)"><Icon name="zoom-in" /></button>
        <button class="btn btn-icon" :title="t('editor.zoom_out') + ' (-)'" :aria-label="t('editor.zoom_out')" @click="canvasRef?.zoomBy(0.8)"><Icon name="zoom-out" /></button>
        <button class="btn btn-icon" :title="t('editor.zoom_fit') + ' (0)'" :aria-label="t('editor.zoom_fit')" @click="canvasRef?.resetView()"><Icon name="fit" /></button>
        <button class="btn" :class="{ active: showBleed }" :aria-pressed="showBleed" :title="t('editor.show_bleed')" @click="showBleed = !showBleed">
          <Icon name="bleed" /> {{ t('editor.bleed_short') }}
        </button>
        <button class="btn" :class="{ active: hideOutside }" :aria-pressed="hideOutside" :title="t('editor.hide_outside_hint')" @click="hideOutside = !hideOutside">
          <Icon name="crop" /> {{ t('editor.hide_outside') }}
        </button>
        <span class="spacer" />
        <button class="btn" :class="{ active: show3d }" :aria-pressed="show3d" @click="show3d = !show3d"><Icon name="cube" /> 3D</button>
        <div class="export-menu">
          <button class="btn" :aria-expanded="exportOpen" @click="exportOpen = !exportOpen"><Icon name="download" /> {{ t('editor.export') }}</button>
          <div v-if="exportOpen" class="menu card" role="menu">
            <button role="menuitem" class="btn btn-ghost" @click="doExport('png300')">PNG · 300 dpi</button>
            <button role="menuitem" class="btn btn-ghost" @click="doExport('png600')">PNG · 600 dpi</button>
            <button role="menuitem" class="btn btn-ghost" @click="doExport('svg')">{{ t('editor.export_svg') }}</button>
          </div>
        </div>
        <button class="btn" @click="openShare"><Icon name="share" /> {{ t('editor.share') }}</button>
      </div>

      <!-- Document bar: which design is open, autosave state, new / switch designs -->
      <div class="docbar">
        <Icon name="edit" :size="14" class="doc-icon" />
        <input
          class="doc-name"
          :value="store.design.name"
          :placeholder="t(`templates.${store.template.i18nKey}`)"
          :aria-label="t('library.name_label')"
          maxlength="60"
          @input="setDesignName"
        />
        <span class="doc-status" :class="{ ok: isSaved }">
          <template v-if="isSaved"><Icon name="check" :size="13" /> {{ t('library.autosaved') }}</template>
          <template v-else>{{ t('library.empty_not_saved') }}</template>
        </span>
        <span class="spacer" />
        <button class="btn btn-sm btn-primary" :disabled="!store.design.layers.length" :title="t('editor.save') + ' (Ctrl+S)'" @click="saveNow">
          <Icon name="save" :size="14" /> {{ t('editor.save') }}
        </button>
        <button class="btn btn-sm" :title="t('library.new_design')" @click="newDesign">
          <Icon name="plus" :size="14" /> {{ t('library.new') }}
        </button>
        <button class="btn btn-sm" :title="t('library.title')" @click="showLibrary = true">
          <Icon name="folder" :size="14" /> {{ t('library.title') }}
          <span v-if="library.entries.length" class="count-pill">{{ library.entries.length }}</span>
        </button>
      </div>

      <!-- In 3D mode the model takes over the stage and the 2D editor shrinks to a
           mini preview in the corner; clicking it (or closing 3D) brings it back. -->
      <div class="stage" :class="{ 'is-3d': show3d }">
        <div v-if="show3d" class="view3d card">
          <Preview3D />
          <button class="btn btn-sm close3d" :title="t('common.close')" @click="show3d = false">
            <Icon name="x" /> {{ t('common.close') }}
          </button>
        </div>
        <div class="canvas-card card" :class="{ mini: show3d }">
          <EditorCanvas ref="canvasRef" :show-bleed="showBleed" :hide-outside="hideOutside" @edit-text="onEditText" />
          <template v-if="!show3d">
            <div v-if="!store.design.layers.length" class="empty-hint">
              <Icon name="upload" :size="28" />
              <p>{{ t('editor.empty_hint') }}</p>
            </div>
            <div v-if="dragging" class="drop-overlay">{{ t('editor.drop_here') }}</div>
          </template>
          <button v-else class="mini-overlay" :aria-label="t('app.editor')" @click="show3d = false">
            <span class="mini-label"><Icon name="edit" :size="14" /> {{ t('app.editor') }}</span>
          </button>
        </div>
      </div>
      <p class="shortcuts muted">{{ t('editor.shortcuts') }}</p>
    </section>

    <!-- Right: properties only (saving lives in the toolbar + "My designs" window) -->
    <aside class="side right card" :class="{ 'mobile-hidden': mobileTab !== 'props' }">
      <h2 class="panel-title">{{ t('editor.properties') }}</h2>
      <PropertiesPanel ref="propsRef" />
    </aside>

    <nav class="mobile-tabs" :aria-label="t('editor.panels')">
      <button v-for="tab in (['templates', 'layers', 'props'] as const)" :key="tab" class="btn btn-ghost"
        :class="{ active: mobileTab === tab }" @click="mobileTab = tab">
        {{ t(`editor.tab_${tab}`) }}
      </button>
      <button class="btn btn-ghost" @click="showLibrary = true">{{ t('editor.tab_library') }}</button>
    </nav>

    <PrintDialog v-if="showPrint" @close="showPrint = false" />
    <LibraryDialog v-if="showLibrary" @close="showLibrary = false" @print="printFromLibrary" />
    <ShareDialog v-if="showShare" :design="store.design" @close="showShare = false" />
    <StickerPicker v-if="showStickers" :initial-tab="store.template.previewModel === 'chip' ? 'frames' : 'shapes'"
      @shape="onPickShape" @pattern="onPickPattern" @frame="onPickFrame" @close="showStickers = false" />
  </div>
</template>

<style scoped>
.editor {
  flex: 1;
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr) 310px;
  gap: 12px;
  padding: 12px;
  min-height: calc(100dvh - var(--header-h) - 80px);
}
.side {
  padding: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: calc(100dvh - var(--header-h) - 24px);
  position: sticky;
  top: calc(var(--header-h) + 12px);
}
.side section + section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.center {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 8px;
}
.tool-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.group-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 2px 0 4px;
}
.btn.add {
  gap: 4px;
}
.btn.add .plus {
  color: var(--accent-hover);
  margin-right: -2px;
}
.count-pill {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.docbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 4px;
}
.doc-icon {
  color: var(--text-muted);
}
.doc-name {
  min-width: 120px;
  max-width: 280px;
  flex: 0 1 260px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
}
.doc-name::placeholder {
  color: var(--text);
}
.doc-name:hover {
  border-color: var(--border);
}
.doc-name:focus {
  outline: none;
  border-color: var(--accent-border);
  background: var(--surface-tint);
}
.doc-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.doc-status.ok :deep(svg) {
  color: var(--success);
}
.divider {
  width: 1px;
  align-self: stretch;
  background: var(--border);
  margin: 0 2px;
}
.export-menu,
.image-menu {
  position: relative;
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  padding: 4px;
  box-shadow: var(--shadow);
}
.menu .btn {
  justify-content: flex-start;
}
.stage {
  flex: 1;
  display: grid;
  gap: 10px;
  grid-template-rows: minmax(280px, 1fr);
}
.canvas-card {
  position: relative;
  padding: 0;
  overflow: hidden;
  min-height: 0;
}
.stage {
  position: relative;
}
.view3d {
  position: relative;
  padding: 8px;
  min-height: 0;
}
.view3d :deep(.preview3d) {
  min-height: 0;
  height: 100%;
}
.view3d :deep(.overlay) {
  right: 110px;
}
.close3d {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
}
.canvas-card.mini {
  position: absolute;
  right: 16px;
  bottom: 40px;
  z-index: 3;
  width: min(320px, 42%);
  height: 120px;
  border: 1px solid var(--accent);
  box-shadow: var(--shadow);
}
.canvas-card.mini :deep(.editor-canvas) {
  pointer-events: none;
}
/* The full-size canvas has a min-height; the mini preview must use its own box so the
   label is centred instead of being pushed below the visible area. */
.canvas-card.mini :deep(.canvas-wrap) {
  min-height: 0;
}
.canvas-card.mini :deep(.zoom-badge) {
  display: none;
}
.mini-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 6px;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.mini-overlay:hover {
  background: rgba(124, 92, 255, 0.12);
}
.mini-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
}
.empty-hint {
  position: absolute;
  inset: auto 0 18px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  pointer-events: none;
  text-align: center;
}
.empty-hint p {
  margin: 0;
}
.drop-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(124, 92, 255, 0.18);
  border: 2px dashed var(--accent);
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 16px;
  pointer-events: none;
}
.transfer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: var(--text-muted);
}
.transfer .input {
  min-height: 30px;
  padding: 3px 8px;
  font-size: 12px;
}
.estimate {
  display: flex;
  gap: 6px;
  font-size: 12px;
  margin: 8px 0 0;
}
.shortcuts {
  font-size: 11px;
  margin: 0;
}
.mobile-tabs {
  display: none;
}

@media (max-width: 1100px) {
  .editor {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .right {
    grid-column: 1 / -1;
    position: static;
    max-height: none;
  }
  .right section + section {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 760px) {
  .editor {
    grid-template-columns: 1fr;
    padding: 8px;
    padding-bottom: 64px;
  }
  .center {
    order: -1;
  }
  .side {
    position: static;
    max-height: none;
  }
  .right {
    display: block;
  }
  .mobile-hidden {
    display: none !important;
  }
  .stage {
    grid-template-rows: 30dvh;
  }
  .side section + section {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .shortcuts {
    display: none;
  }
  .stage.is-3d {
    grid-template-rows: 46dvh;
  }
  .canvas-card.mini {
    width: 46%;
    height: 72px;
    right: 8px;
    bottom: 8px;
  }
  .mobile-tabs {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px;
    gap: 4px;
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
}
</style>
