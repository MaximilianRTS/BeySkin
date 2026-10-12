import { getAlphaMaskSync } from './assets'
import { layerColorKey } from './imageAdjust'
import { framePath, getFrame, getShape, type ShapeDef } from './library'
import { imageLayerHeight, type Design, type FrameLayer, type Layer } from './model'
import { layerSize } from './render'
import type { StickerTemplate } from '@/templates'

/**
 * Pixel-accurate hit testing for the editor: transparent parts of images, the
 * open centre of frames and the empty space around shapes are "click-through",
 * so the element underneath can be grabbed.
 */

type Pt = { x: number; y: number }

let probe: OffscreenCanvasRenderingContext2D | null = null
const ctx = () => (probe ??= new OffscreenCanvas(1, 1).getContext('2d')!)

const shapePaths = new Map<string, Path2D>()
function shapePath(def: ShapeDef): Path2D {
  let p = shapePaths.get(def.id)
  if (!p) {
    p = new Path2D(def.d)
    shapePaths.set(def.id, p)
  }
  return p
}

/** Point in the layer's own unrotated, unflipped coordinates (mm, origin = layer centre). */
function toLocal(layer: Layer, p: Pt): Pt {
  const a = (-layer.rotation * Math.PI) / 180
  const dx = p.x - layer.x
  const dy = p.y - layer.y
  let lx = dx * Math.cos(a) - dy * Math.sin(a)
  let ly = dx * Math.sin(a) + dy * Math.cos(a)
  if (layer.flipX) lx = -lx
  if (layer.flipY) ly = -ly
  return { x: lx, y: ly }
}

function insideFrameWindow(frame: FrameLayer, p: Pt): boolean {
  const def = getFrame(frame.frameId)
  if (!def) return true
  const l = toLocal(frame, p)
  return ctx().isPointInPath(framePath(def, 'center'), ((l.x + frame.width / 2) / frame.width) * 100, ((l.y + frame.width / 2) / frame.width) * 100, 'evenodd')
}

/** Is the layer visibly present at design point `p` (mm)? */
export function layerHitAt(design: Design, template: StickerTemplate, index: number, p: Pt): boolean {
  const layer = design.layers[index]
  if (layer.type === 'fill') return false
  const { w, h } = layerSize(layer, template)
  const l = toLocal(layer, p)
  if (Math.abs(l.x) > w / 2 || Math.abs(l.y) > h / 2) return false

  switch (layer.type) {
    case 'text':
      return true
    case 'image': {
      const ih = imageLayerHeight(layer)
      if (layer.mask === 'circle' && Math.hypot(l.x, l.y) > Math.min(layer.width, ih) / 2) return false
      if (layer.mask === 'frame') {
        const frameIndex = design.layers.findLastIndex((x) => x.type === 'frame' && x.visible)
        if (frameIndex > index && !insideFrameWindow(design.layers[frameIndex] as FrameLayer, p)) return false
      }
      if (!layer.assetId) return true // placeholder
      const mask = getAlphaMaskSync(layer.assetId, layerColorKey(layer))
      if (!mask) return true // not analysed yet → treat as opaque
      const u = Math.min(mask.w - 1, Math.max(0, Math.floor(((l.x + layer.width / 2) / layer.width) * mask.w)))
      const v = Math.min(mask.h - 1, Math.max(0, Math.floor(((l.y + ih / 2) / ih) * mask.h)))
      return mask.alpha[v * mask.w + u] > 24
    }
    case 'frame': {
      const def = getFrame(layer.frameId)
      if (!def) return true
      const fx = ((l.x + layer.width / 2) / layer.width) * 100
      const fy = ((l.y + layer.width / 2) / layer.width) * 100
      const parts = (['band', 'ring', 'accent', 'center'] as const).filter((part) => part !== 'center' || layer.centerColor)
      return parts.some((part) => ctx().isPointInPath(framePath(def, part), fx, fy, 'evenodd'))
    }
    case 'shape': {
      const def = getShape(layer.shapeId)
      if (!def) return true
      const f = layer.width / def.width
      const sx = (l.x + layer.width / 2) / f
      const sy = (l.y + (def.height * f) / 2) / f
      const path = shapePath(def)
      if (ctx().isPointInPath(path, sx, sy, def.evenodd ? 'evenodd' : 'nonzero')) return true
      if (layer.strokeWidth > 0) {
        ctx().lineWidth = (layer.strokeWidth * 2) / f
        return ctx().isPointInStroke(path, sx, sy)
      }
      return false
    }
  }
}

/** All layers visibly hit at `p`, topmost first (locked/hidden ones excluded). */
export function hitStack(design: Design, template: StickerTemplate, p: Pt): Layer[] {
  const out: Layer[] = []
  for (let i = design.layers.length - 1; i >= 0; i--) {
    const l = design.layers[i]
    if (!l.visible || l.locked) continue
    if (layerHitAt(design, template, i, p)) out.push(l)
  }
  return out
}
