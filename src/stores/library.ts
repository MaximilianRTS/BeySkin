import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { collectGarbage } from '@/lib/assets'
import { cloneDesign, normalizeDesign, uid, type Design } from '@/lib/model'
import { createAutosave, loadState } from '@/lib/persist'
import { renderDesignBlob } from '@/lib/render'

const LIBRARY_KEY = 'library'
const THUMB_PX_PER_MM = 4

export interface LibraryEntry {
  design: Design
  /** How many copies go on the print sheet. */
  quantity: number
}

/** "My designs": saved designs that can be re-opened and printed together. */
export const useLibraryStore = defineStore('library', () => {
  const entries = ref<LibraryEntry[]>([])
  const thumbs = ref<Record<string, string>>({})
  const loaded = ref(false)

  const autosave = createAutosave(LIBRARY_KEY, () => entries.value)
  watch(entries, () => loaded.value && autosave.schedule(), { deep: true })

  async function init() {
    entries.value = (await loadState<LibraryEntry[]>(LIBRARY_KEY)) ?? []
    entries.value.forEach((e) => normalizeDesign(e.design))
    loaded.value = true
    entries.value.forEach((e) => void refreshThumb(e.design))
  }

  async function refreshThumb(design: Design) {
    try {
      const blob = await renderDesignBlob(design, { pxPerMm: THUMB_PX_PER_MM, clip: 'outline', placeholders: true })
      const old = thumbs.value[design.id]
      thumbs.value = { ...thumbs.value, [design.id]: URL.createObjectURL(blob) }
      if (old) URL.revokeObjectURL(old)
    } catch (err) {
      console.warn('thumbnail failed', err)
    }
  }

  /** Inserts or updates a design (matched by id). Returns the stored copy. */
  function save(design: Design): Design {
    const copy = cloneDesign(design)
    copy.updatedAt = new Date().toISOString()
    const existing = entries.value.find((e) => e.design.id === copy.id)
    if (existing) existing.design = copy
    else entries.value.unshift({ design: copy, quantity: 1 })
    void refreshThumb(copy)
    return copy
  }

  // Thumbnails are re-rendered at most every 700 ms per design while editing.
  const thumbTimers = new Map<string, ReturnType<typeof setTimeout>>()
  function scheduleThumb(design: Design) {
    clearTimeout(thumbTimers.get(design.id))
    thumbTimers.set(
      design.id,
      setTimeout(() => {
        thumbTimers.delete(design.id)
        void refreshThumb(design)
      }, 700),
    )
  }

  /**
   * Autosave: keeps the library entry of the design being edited up to date.
   * Every design lives in "My designs" as soon as it has content – there is no
   * separate save step, so nothing is ever overwritten by accident.
   */
  function upsert(design: Design) {
    if (!design.layers.length) return
    const copy = cloneDesign(design)
    copy.updatedAt = new Date().toISOString()
    const existing = entries.value.find((e) => e.design.id === copy.id)
    if (existing) existing.design = copy
    else entries.value.unshift({ design: copy, quantity: 1 })
    scheduleThumb(copy)
  }

  /** Writes pending changes to IndexedDB right away (used by the explicit Save button). */
  function flush() {
    return autosave.flush()
  }

  function has(id: string) {
    return entries.value.some((e) => e.design.id === id)
  }

  /** Content fingerprint (ignores timestamps) to detect unsaved changes. */
  const signature = (d: Design) => JSON.stringify([d.templateId, d.name, d.layers])

  /** 'new' = never saved, 'changed' = saved but edited since, 'saved' = identical to the saved copy. */
  function saveState(design: Design): 'new' | 'changed' | 'saved' {
    const entry = entries.value.find((e) => e.design.id === design.id)
    if (!entry) return 'new'
    return signature(entry.design) === signature(design) ? 'saved' : 'changed'
  }

  function addDesigns(designs: Design[]) {
    for (const d of designs) save({ ...d, id: has(d.id) ? uid() : d.id })
  }

  function duplicate(id: string) {
    const e = entries.value.find((x) => x.design.id === id)
    if (!e) return
    save({ ...cloneDesign(e.design), id: uid(), name: `${e.design.name || 'Design'} (2)` })
  }

  function remove(id: string) {
    entries.value = entries.value.filter((e) => e.design.id !== id)
    const url = thumbs.value[id]
    if (url) URL.revokeObjectURL(url)
  }

  function setQuantity(id: string, quantity: number) {
    const e = entries.value.find((x) => x.design.id === id)
    if (e) e.quantity = Math.max(0, Math.min(99, Math.round(quantity)))
  }

  /** Deletes stored images that neither the library nor `extra` designs use. */
  async function cleanupAssets(extra: Design[] = []) {
    const used = new Set<string>()
    for (const d of [...entries.value.map((e) => e.design), ...extra]) {
      for (const l of d.layers) if (l.type === 'image') used.add(l.assetId)
    }
    return collectGarbage(used)
  }

  return { entries, thumbs, loaded, init, save, upsert, flush, has, saveState, addDesigns, duplicate, remove, setQuantity, cleanupAssets }
})
