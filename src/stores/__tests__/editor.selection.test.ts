import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ImageLayer } from '@/lib/model'

vi.mock('@/lib/persist', () => ({
  createAutosave: () => ({ schedule: () => {} }),
  loadState: async () => undefined,
}))
vi.mock('@/lib/assets', () => ({ importImage: async () => ({}) }))

const { useEditorStore } = await import('../editor')

/** Square 10 mm image at (x, y). */
function img(id: string, x: number, y: number, extra: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id,
    name: id,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    x,
    y,
    rotation: 0,
    flipX: false,
    flipY: false,
    groupId: null,
    type: 'image',
    assetId: 'a',
    naturalWidth: 100,
    naturalHeight: 100,
    width: 10,
    ...extra,
  }
}

describe('editor store selection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function setup() {
    const store = useEditorStore()
    store.design.layers = [img('a', 10, 10), img('b', 30, 12), img('c', 70, 14)]
    store.commit()
    return store
  }

  it('keeps selectedId as the primary of selectedIds', () => {
    const store = setup()
    store.select(['a', 'b'], 'a')
    expect(store.selectedIds).toEqual(['b', 'a'])
    expect(store.selectedId).toBe('a')
    expect(store.selected?.id).toBe('a')
    store.selectedId = 'c'
    expect(store.selectedIds).toEqual(['c'])
    store.toggleSelect('a')
    expect(store.selection.map((l) => l.id)).toEqual(['a', 'c'])
    store.toggleSelect('c')
    expect(store.selectedIds).toEqual(['a'])
  })

  it('groups, selects whole groups and cleans up singletons', () => {
    const store = setup()
    store.select(['a', 'b'])
    expect(store.groupSelected()).toBe(true)
    const gid = store.design.layers[0].groupId
    expect(gid).toBeTruthy()
    expect(store.groupOf('a')).toEqual(['a', 'b'])
    store.clearSelection()
    store.toggleSelect('b')
    expect(store.selectedIds.sort()).toEqual(['a', 'b'])
    // deleting one member dissolves the group
    store.select(['a'])
    store.removeSelected()
    expect(store.design.layers.find((l) => l.id === 'b')?.groupId).toBeNull()
  })

  it('duplicates grouped layers into a new group', () => {
    const store = setup()
    store.select(['a', 'b'])
    store.groupSelected()
    store.duplicateSelected()
    expect(store.design.layers).toHaveLength(5)
    const copies = store.selection
    expect(copies).toHaveLength(2)
    expect(copies[0].groupId).toBe(copies[1].groupId)
    expect(copies[0].groupId).not.toBe(store.design.layers[0].groupId)
    expect(copies[0].x).toBe(12)
  })

  it('copies and pastes several layers', () => {
    const store = setup()
    store.select(['a', 'c'])
    expect(store.copySelected()).toBe(2)
    expect(store.pasteLayer()).toBe(true)
    expect(store.design.layers).toHaveLength(5)
    expect(store.selection.map((l) => l.x)).toEqual([12, 72])
  })

  it('aligns and distributes the selection', () => {
    const store = setup()
    store.selectAll()
    store.alignSelection('top')
    expect(store.design.layers.map((l) => l.y)).toEqual([10, 10, 10])
    store.distributeSelection('x', 'centers')
    expect(store.design.layers.map((l) => l.x)).toEqual([10, 40, 70])
  })

  it('drops missing ids on undo', () => {
    const store = setup()
    store.select(['a'])
    store.duplicateSelected()
    const copy = store.selectedId!
    store.select(['a', copy])
    store.undo()
    expect(store.selectedIds).toEqual(['a'])
  })
})
