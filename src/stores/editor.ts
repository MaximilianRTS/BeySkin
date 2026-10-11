import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { importImage } from '@/lib/assets'
import {
  cloneDesign,
  FRAME_DEFAULT_COLORS,
  normalizeDesign,
  imageLayerHeight,
  newDesign,
  uid,
  type Design,
  type FillLayer,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/model'
import { createAutosave, loadState } from '@/lib/persist'
import { layerSize } from '@/lib/render'
import { DEFAULT_TEMPLATE_ID, getTemplate } from '@/templates'

const HISTORY_LIMIT = 100
const WORKSPACE_KEY = 'workspace'

type LayerPatch = Partial<Omit<ImageLayer, 'type' | 'id'>> &
  Partial<Omit<TextLayer, 'type' | 'id'>> &
  Partial<Omit<FillLayer, 'type' | 'id'>> &
  Partial<Omit<ShapeLayer, 'type' | 'id'>>

export const useEditorStore = defineStore('editor', () => {
  const design = ref<Design>(newDesign(DEFAULT_TEMPLATE_ID))
  const selectedId = ref<string | null>(null)
  const loaded = ref(false)

  const template = computed(() => getTemplate(design.value.templateId))
  const selected = computed<Layer | null>(() => design.value.layers.find((l) => l.id === selectedId.value) ?? null)

  // ---------- history ----------
  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  let lastSnapshot = JSON.stringify(design.value)

  /** Records the current state as one undo step. Call after an interaction finishes. */
  function commit() {
    const snap = JSON.stringify(design.value)
    if (snap === lastSnapshot) return
    undoStack.value.push(lastSnapshot)
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
    redoStack.value = []
    lastSnapshot = snap
    design.value.updatedAt = new Date().toISOString()
  }

  function restore(snap: string) {
    design.value = JSON.parse(snap) as Design
    lastSnapshot = snap
    if (!design.value.layers.some((l) => l.id === selectedId.value)) selectedId.value = null
  }

  function undo() {
    const prev = undoStack.value.pop()
    if (!prev) return
    redoStack.value.push(JSON.stringify(design.value))
    restore(prev)
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(JSON.stringify(design.value))
    restore(next)
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // ---------- per-template drafts ----------
  /**
   * Every template keeps its own work-in-progress design (plus undo history), so
   * switching e.g. Battle Pass → Gear Chip → Battle Pass never mixes designs.
   */
  interface Draft {
    design: Design
    selectedId: string | null
    undo: string[]
    redo: string[]
  }
  const drafts = ref<Record<string, Draft>>({})

  function stashCurrent() {
    drafts.value[design.value.templateId] = {
      design: design.value,
      selectedId: selectedId.value,
      undo: undoStack.value,
      redo: redoStack.value,
    }
  }

  function activate(d: Draft) {
    design.value = d.design
    selectedId.value = d.selectedId
    undoStack.value = d.undo
    redoStack.value = d.redo
    lastSnapshot = JSON.stringify(design.value)
  }

  // ---------- persistence ----------
  interface SavedWorkspace {
    design: Design
    selectedId: string | null
    /** Drafts of the other templates (history is not persisted). */
    drafts?: Record<string, Design>
  }
  const autosave = createAutosave<SavedWorkspace>(WORKSPACE_KEY, () => ({
    design: design.value,
    selectedId: selectedId.value,
    drafts: Object.fromEntries(
      Object.entries(drafts.value)
        .filter(([id, d]) => id !== design.value.templateId && d.design.layers.length)
        .map(([id, d]) => [id, d.design]),
    ),
  }))
  watch([design, drafts], () => loaded.value && autosave.schedule(), { deep: true })

  async function init() {
    const saved = await loadState<SavedWorkspace>(WORKSPACE_KEY)
    if (saved?.design?.version === 2) {
      for (const [id, d] of Object.entries(saved.drafts ?? {})) {
        if (d?.version === 2) drafts.value[id] = { design: normalizeDesign(d), selectedId: null, undo: [], redo: [] }
      }
      design.value = normalizeDesign(saved.design)
      selectedId.value = saved.selectedId
      lastSnapshot = JSON.stringify(design.value)
    }
    loaded.value = true
  }

  // ---------- layer helpers ----------
  function baseLayer(name: string) {
    const t = template.value
    return {
      id: uid(),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over' as const,
      x: t.widthMm / 2,
      y: t.heightMm / 2,
      rotation: 0,
      flipX: false,
      flipY: false,
    }
  }

  /** Share of the chip diameter covered by the round picture (frame opening ≈ 72 %). */
  const CHIP_PICTURE = 0.76

  /**
   * Gear chip with a frame: show the picture through the frame's opening, sized to
   * cover it. Without a frame the picture simply fills the round sticker (the cut
   * line already makes it round – no extra crop that would cut off wide images).
   */
  function fitInChip(layer: ImageLayer) {
    const t = template.value
    if (!design.value.layers.some((l) => l.type === 'frame')) {
      layer.mask = null
      fitLayer(layer, 'cover', false)
      return
    }
    const d = Math.min(t.widthMm, t.heightMm) * CHIP_PICTURE
    const aspect = layer.naturalWidth / layer.naturalHeight
    layer.mask = 'frame'
    layer.width = d * Math.max(1, aspect)
    layer.x = t.widthMm / 2
    layer.y = t.heightMm / 2
    layer.rotation = 0
  }

  /** New content goes below frame overlays so frames always stay on top. */
  function insertIndex(): number {
    const firstFrame = design.value.layers.findIndex((l) => l.type === 'frame')
    return firstFrame < 0 ? design.value.layers.length : firstFrame
  }

  function pushLayer(layer: Layer) {
    if (layer.type === 'frame') design.value.layers.push(layer)
    else design.value.layers.splice(insertIndex(), 0, layer)
    selectedId.value = layer.id
    commit()
  }

  function addFrame(frameId: string, name: string) {
    const t = template.value
    pushLayer({ ...baseLayer(name), type: 'frame', frameId, width: Math.min(t.widthMm, t.heightMm), ...FRAME_DEFAULT_COLORS })
  }

  async function addImages(files: Iterable<File>): Promise<{ added: number; failed: number }> {
    let added = 0
    let failed = 0
    for (const file of files) {
      try {
        const name = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Image'
        const asset = await importImage(file, name)
        placeImage(asset.id, asset.width, asset.height, name)
        added++
      } catch (err) {
        console.warn('image import failed', err)
        failed++
      }
    }
    if (added) commit()
    return { added, failed }
  }

  /** Inserts a stored image; `at` (mm) places it at a drop position instead of centring it. */
  function placeImage(assetId: string, width: number, height: number, name: string, at?: { x: number; y: number }) {
    const layer: ImageLayer = {
      ...baseLayer(name || 'Image'),
      type: 'image',
      assetId,
      naturalWidth: width,
      naturalHeight: height,
      width: 10,
    }
    design.value.layers.splice(insertIndex(), 0, layer)
    if (template.value.previewModel === 'chip') fitInChip(layer)
    else fitLayer(layer, 'cover', false)
    if (at) {
      layer.x = at.x
      layer.y = at.y
    }
    selectedId.value = layer.id
    return layer
  }

  function addAssetLayer(asset: { id: string; width: number; height: number; name: string }, at?: { x: number; y: number }) {
    placeImage(asset.id, asset.width, asset.height, asset.name, at)
    commit()
  }

  // ---------- copy / paste (works across templates) ----------
  const clipboard = ref<{ layer: Layer; from: { w: number; h: number } } | null>(null)

  function copySelected(): boolean {
    const l = selected.value
    if (!l) return false
    clipboard.value = { layer: JSON.parse(JSON.stringify(l)), from: { w: template.value.widthMm, h: template.value.heightMm } }
    return true
  }

  function pasteLayer(): boolean {
    const clip = clipboard.value
    if (!clip) return false
    const t = template.value
    const copy = { ...JSON.parse(JSON.stringify(clip.layer)), id: uid() } as Layer
    const sameSize = clip.from.w === t.widthMm && clip.from.h === t.heightMm
    if (copy.type !== 'fill') {
      if (sameSize) {
        copy.x += 2
        copy.y += 2
      } else {
        // Keep the relative position; shrink only if it would not fit the new template.
        copy.x = (copy.x / clip.from.w) * t.widthMm
        copy.y = (copy.y / clip.from.h) * t.heightMm
        const { w, h } = layerSize(copy, t)
        const f = Math.min(1, t.widthMm / w, t.heightMm / h)
        if (f < 1) {
          if (copy.type === 'text') copy.fontSize *= f
          else copy.width *= f
        }
      }
    }
    pushLayer(copy)
    return true
  }

  function addText(text = 'Text') {
    const t = template.value
    pushLayer({
      ...baseLayer(text),
      type: 'text',
      text,
      fontFamily: 'Bangers',
      fontSize: Math.max(3, Math.min(12, t.heightMm * 0.35)),
      bold: false,
      italic: false,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 0.4,
      align: 'center',
    })
  }

  function addShape(shapeId: string, name: string) {
    const t = template.value
    pushLayer({
      ...baseLayer(name),
      type: 'shape',
      shapeId,
      width: Math.max(4, Math.min(t.widthMm, t.heightMm) * 0.7),
      color: '#ffd23f',
      strokeColor: '#000000',
      strokeWidth: 0.4,
    })
  }

  /** Swaps the picture of an image layer (or fills a placeholder) and keeps its placement. */
  async function replaceImage(id: string, file: File): Promise<boolean> {
    const layer = design.value.layers.find((l) => l.id === id)
    if (!layer || layer.type !== 'image') return false
    try {
      const asset = await importImage(file)
      const height = imageLayerHeight(layer)
      // Keep the visual height, follow the new aspect ratio.
      layer.width = (height * asset.width) / asset.height
      layer.assetId = asset.id
      layer.naturalWidth = asset.width
      layer.naturalHeight = asset.height
      commit()
      return true
    } catch (err) {
      console.warn('replace failed', err)
      return false
    }
  }

  function addFill(color = '#ffffff', pattern: string | null = null) {
    const layer: FillLayer = {
      ...baseLayer(pattern ? 'Pattern' : 'Fill'),
      type: 'fill',
      color,
      color2: pattern ? '#000000' : null,
      angle: 0,
      pattern,
      patternScale: 4,
    }
    // Backgrounds belong at the bottom.
    design.value.layers.unshift(layer)
    selectedId.value = layer.id
    commit()
  }

  function updateLayer(id: string, patch: LayerPatch, record = true) {
    const layer = design.value.layers.find((l) => l.id === id)
    if (!layer) return
    Object.assign(layer, patch)
    if (record) commit()
  }

  function removeLayer(id: string) {
    const i = design.value.layers.findIndex((l) => l.id === id)
    if (i < 0) return
    design.value.layers.splice(i, 1)
    if (selectedId.value === id) selectedId.value = design.value.layers[Math.min(i, design.value.layers.length - 1)]?.id ?? null
    commit()
  }

  function duplicateLayer(id: string) {
    const i = design.value.layers.findIndex((l) => l.id === id)
    if (i < 0) return
    const copy = { ...JSON.parse(JSON.stringify(design.value.layers[i])), id: uid() } as Layer
    copy.name = `${copy.name} 2`
    if (copy.type !== 'fill') {
      copy.x += 2
      copy.y += 2
    }
    design.value.layers.splice(i + 1, 0, copy)
    selectedId.value = copy.id
    commit()
  }

  /** Moves a layer within the stack. `to` is the target index (0 = bottom). */
  function moveLayer(id: string, to: number) {
    const from = design.value.layers.findIndex((l) => l.id === id)
    if (from < 0) return
    const clamped = Math.max(0, Math.min(design.value.layers.length - 1, to))
    if (clamped === from) return
    const [layer] = design.value.layers.splice(from, 1)
    design.value.layers.splice(clamped, 0, layer)
    commit()
  }

  /** cover: fill the whole label, contain: fit inside it. Rotation is reset. */
  function fitLayer(layer: Layer, mode: 'cover' | 'contain', record = true) {
    const t = template.value
    layer.x = t.widthMm / 2
    layer.y = t.heightMm / 2
    layer.rotation = 0
    if (layer.type === 'image') {
      const aspect = layer.naturalWidth / layer.naturalHeight
      const labelAspect = t.widthMm / t.heightMm
      const byWidth = mode === 'cover' ? aspect <= labelAspect : aspect > labelAspect
      layer.width = byWidth ? t.widthMm : t.heightMm * aspect
    } else if (layer.type === 'frame') {
      layer.width = Math.min(t.widthMm, t.heightMm)
    } else if (layer.type === 'text' || layer.type === 'shape') {
      const { w, h } = layerSize(layer, t)
      const f = Math.min(t.widthMm / w, t.heightMm / h) * (mode === 'cover' ? 1 : 0.9)
      if (layer.type === 'text') layer.fontSize = +(layer.fontSize * f).toFixed(2)
      else layer.width = +(layer.width * f).toFixed(2)
    }
    if (record) commit()
  }

  /** Aligns the layer's (rotated) bounding box to an edge or the centre of the label. */
  function alignLayer(layer: Layer, where: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    if (layer.type === 'fill') return
    const t = template.value
    const { w, h } = layerSize(layer, t)
    const a = (layer.rotation * Math.PI) / 180
    const hw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2
    const hh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2
    if (where === 'left') layer.x = hw
    if (where === 'hcenter') layer.x = t.widthMm / 2
    if (where === 'right') layer.x = t.widthMm - hw
    if (where === 'top') layer.y = hh
    if (where === 'vcenter') layer.y = t.heightMm / 2
    if (where === 'bottom') layer.y = t.heightMm - hh
    commit()
  }

  function centerLayer(layer: Layer, axis: 'x' | 'y' | 'both') {
    const t = template.value
    if (axis !== 'y') layer.x = t.widthMm / 2
    if (axis !== 'x') layer.y = t.heightMm / 2
    commit()
  }

  /**
   * Copies the current design onto another template (scaled to fit) and switches
   * there. The target template's previous draft is replaced.
   */
  function transferTo(templateId: string) {
    const from = template.value
    const to = getTemplate(templateId)
    if (from.id === to.id) return
    const copy = cloneDesign(design.value)
    copy.id = uid()
    copy.templateId = to.id
    const f = Math.min(to.widthMm / from.widthMm, to.heightMm / from.heightMm)
    for (const l of copy.layers) {
      l.id = uid()
      if (l.type === 'fill') continue
      l.x = (l.x / from.widthMm) * to.widthMm
      l.y = (l.y / from.heightMm) * to.heightMm
      if (l.type === 'text') l.fontSize *= f
      else l.width *= f
    }
    stashCurrent()
    activate({ design: copy, selectedId: null, undo: [], redo: [] })
    commit()
  }

  function hasDraft(templateId: string): boolean {
    return !!drafts.value[templateId]?.design.layers.length
  }

  /** Switches to another template's own draft (created empty on first use). */
  function setTemplate(templateId: string) {
    const to = getTemplate(templateId)
    if (to.id === design.value.templateId) return
    stashCurrent()
    activate(drafts.value[to.id] ?? { design: newDesign(to.id), selectedId: null, undo: [], redo: [] })
  }

  function newBlank(templateId = design.value.templateId) {
    design.value = newDesign(templateId)
    selectedId.value = null
    undoStack.value = []
    redoStack.value = []
    lastSnapshot = JSON.stringify(design.value)
  }

  /**
   * Opens a design (from the library, an import or a share link) for editing. It
   * replaces the draft of its own template; drafts of other templates are kept.
   */
  function loadDesign(d: Design) {
    stashCurrent()
    const copy = normalizeDesign(cloneDesign(d))
    activate({ design: copy, selectedId: copy.layers.at(-1)?.id ?? null, undo: [], redo: [] })
  }

  return {
    design,
    template,
    selectedId,
    selected,
    loaded,
    canUndo,
    canRedo,
    init,
    commit,
    undo,
    redo,
    addImages,
    addText,
    addFill,
    addShape,
    addFrame,
    addAssetLayer,
    copySelected,
    pasteLayer,
    clipboard,
    transferTo,
    hasDraft,
    replaceImage,
    updateLayer,
    removeLayer,
    duplicateLayer,
    moveLayer,
    fitLayer,
    centerLayer,
    alignLayer,
    setTemplate,
    newBlank,
    loadDesign,
  }
})
