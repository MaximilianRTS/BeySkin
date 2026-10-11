import { getBitmap, getBitmapSync } from './assets'
import { imageLayerHeight, type Design, type FillLayer, type FrameLayer, type Layer, type ShapeLayer, type TextLayer } from './model'
import { bandArc, drawPattern, framePath, getFrame, getShape, PATTERN_IDS, type FrameDef, type PatternId } from './library'
import { getTemplate, type StickerTemplate } from '@/templates'

/**
 * Single rendering path for everything: editor canvas, PNG/PDF/SVG export,
 * thumbnails, share previews and the 3D texture. Geometry is in mm; callers choose the resolution.
 */

export const FONTS = ['Bangers', 'Russo One', 'Anton', 'Arial', 'Impact', 'Georgia', 'Courier New'] as const

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type ImageResolver = (assetId: string) => CanvasImageSource | null

export interface RenderOptions {
  pxPerMm: number
  /** Extra margin around the template bounding box (mm). Content is drawn into it. */
  bleedMm?: number
  /** outline = cut shape, bleed = bounding box + bleed, none = no clipping. */
  clip?: 'outline' | 'bleed' | 'none'
  /** Draw the cut line on top. */
  cutLine?: { color: string; widthMm: number } | null
  /** Matte colour behind the whole output (also outside the cut shape). */
  background?: string | null
  /** Draw placeholders for image layers without an image (editor / share preview only). */
  placeholders?: boolean
}

export function outlinePath(template: StickerTemplate, offsetX = 0, offsetY = 0): Path2D {
  const p = new Path2D()
  template.outline.forEach(([x, y], i) => (i === 0 ? p.moveTo(x + offsetX, y + offsetY) : p.lineTo(x + offsetX, y + offsetY)))
  p.closePath()
  return p
}

// ---------- text measurement ----------

const LINE_HEIGHT = 1.15
let measureCtx: OffscreenCanvasRenderingContext2D | null = null

function fontString(layer: TextLayer, sizePx: number): string {
  return `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${sizePx}px "${layer.fontFamily}"`
}

export function textSize(layer: TextLayer): { w: number; h: number } {
  measureCtx ??= new OffscreenCanvas(1, 1).getContext('2d')!
  const ref = 100
  measureCtx.font = fontString(layer, ref)
  const lines = layer.text.split('\n')
  const widest = Math.max(1, ...lines.map((l) => measureCtx!.measureText(l).width))
  return {
    w: (widest / ref) * layer.fontSize + layer.strokeWidth * 2,
    h: lines.length * layer.fontSize * LINE_HEIGHT + layer.strokeWidth * 2,
  }
}

export function shapeHeight(layer: ShapeLayer): number {
  const def = getShape(layer.shapeId)
  return def ? (layer.width * def.height) / def.width : layer.width
}

/** Unrotated size of a layer in mm. Fill layers report the template size. */
export function layerSize(layer: Layer, template: StickerTemplate): { w: number; h: number } {
  switch (layer.type) {
    case 'image':
      return { w: layer.width, h: imageLayerHeight(layer) }
    case 'fill':
      return { w: template.widthMm, h: template.heightMm }
    case 'text':
      return textSize(layer)
    case 'shape':
      return { w: layer.width + layer.strokeWidth, h: shapeHeight(layer) + layer.strokeWidth }
    case 'frame':
      return { w: layer.width, h: layer.width }
  }
}

// ---------- drawing ----------

function drawFill(ctx: Canvas2D, layer: FillLayer, x0: number, y0: number, w: number, h: number) {
  if (layer.pattern && (PATTERN_IDS as readonly string[]).includes(layer.pattern)) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, w, h)
    ctx.clip()
    ctx.translate(x0, y0)
    ctx.fillStyle = layer.color
    ctx.fillRect(0, 0, w, h)
    drawPattern(ctx, layer.pattern as PatternId, w, h, layer.color2 ?? '#000000', layer.color, layer.patternScale, layer.angle)
    ctx.restore()
    return
  }
  if (!layer.color2) {
    ctx.fillStyle = layer.color
  } else {
    const a = (layer.angle * Math.PI) / 180
    const cx = x0 + w / 2
    const cy = y0 + h / 2
    const r = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    g.addColorStop(0, layer.color)
    g.addColorStop(1, layer.color2)
    ctx.fillStyle = g
  }
  ctx.fillRect(x0, y0, w, h)
}

const shapePaths = new Map<string, Path2D>()

function drawShape(ctx: Canvas2D, layer: ShapeLayer) {
  const def = getShape(layer.shapeId)
  if (!def) return
  let path = shapePaths.get(def.id)
  if (!path) {
    path = new Path2D(def.d)
    shapePaths.set(def.id, path)
  }
  const f = layer.width / def.width
  ctx.translate(-layer.width / 2, -(def.height * f) / 2)
  ctx.scale(f, f)
  const rule: CanvasFillRule = def.evenodd ? 'evenodd' : 'nonzero'
  if (layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.strokeColor
    ctx.lineJoin = 'round'
    ctx.lineWidth = (layer.strokeWidth * 2) / f
    ctx.stroke(path)
  }
  ctx.fillStyle = layer.color
  ctx.fill(path, rule)
}

function drawFrame(ctx: Canvas2D, layer: FrameLayer) {
  const def = getFrame(layer.frameId)
  if (!def) return
  const f = layer.width / 100
  ctx.translate(-layer.width / 2, -layer.width / 2)
  ctx.scale(f, f)
  // Defaults cover frames saved before colours existed.
  const colors = {
    band: layer.bandColor ?? '#e8423a',
    center: layer.centerColor ?? null,
    ring: layer.ringColor ?? '#000000',
    accent: layer.accentColor ?? '#ffffff',
  }
  for (const part of ['band', 'center', 'ring', 'accent'] as const) {
    const color = colors[part]
    if (!color || !def[part]) continue
    ctx.fillStyle = color
    ctx.fill(framePath(def, part), 'evenodd')
  }
  if (layer.bandText?.trim()) drawBandText(ctx, def, layer)
}

/** Sets free text along the colour band, letters upright relative to the rim. */
function drawBandText(ctx: Canvas2D, def: FrameDef, layer: FrameLayer) {
  const arc = bandArc(def)
  const text = layer.bandText.trim()
  const r = (arc.rInner + arc.rOuter) / 2 - 0.5
  const thickness = arc.rOuter - arc.rInner
  let size = thickness * 0.62
  const font = (px: number) => `${px}px "${layer.bandTextFont || 'Russo One'}"`
  ctx.font = font(size)
  const tracking = size * 0.08
  const widths = [...text].map((ch) => ctx.measureText(ch).width + tracking)
  const total = widths.reduce((a, b) => a + b, 0) - tracking
  const available = arc.span * r * 0.88
  if (total > available) {
    const f = available / total
    size *= f
    widths.forEach((w, i) => (widths[i] = w * f))
    ctx.font = font(size)
  }
  const length = widths.reduce((a, b) => a + b, 0)
  // Bands in the lower half read the other way round so the text is never upside down.
  const lower = Math.sin(arc.center) > 0.35
  const dir = lower ? -1 : 1
  let pos = -length / 2
  ctx.fillStyle = layer.bandTextColor || '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ;[...text].forEach((ch, i) => {
    const a = arc.center + (dir * (pos + widths[i] / 2)) / r
    ctx.save()
    ctx.translate(50 + r * Math.cos(a), 50 + r * Math.sin(a))
    ctx.rotate(a + (dir * Math.PI) / 2)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
    pos += widths[i]
  })
}

/** Clips to the frame's centre opening (in design coordinates); the clip outlives the transform. */
function clipToFrameWindow(ctx: Canvas2D, frame: FrameLayer, bleedMm: number) {
  const def = getFrame(frame.frameId)
  if (!def) return
  const base = ctx.getTransform()
  ctx.translate(frame.x + bleedMm, frame.y + bleedMm)
  ctx.rotate((frame.rotation * Math.PI) / 180)
  ctx.scale(frame.flipX ? -1 : 1, frame.flipY ? -1 : 1)
  ctx.translate(-frame.width / 2, -frame.width / 2)
  ctx.scale(frame.width / 100, frame.width / 100)
  ctx.clip(framePath(def, 'center'), 'evenodd')
  ctx.setTransform(base)
}

/** Checkerboard box with a dashed frame and a picture icon. */
function drawPlaceholder(ctx: Canvas2D, w: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(-w / 2, -h / 2, w, h)
  ctx.clip()
  ctx.fillStyle = '#d9dde6'
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = '#c3c9d6'
  const cell = Math.max(1.5, Math.min(w, h) / 8)
  for (let y = -h / 2, r = 0; y < h / 2; y += cell, r++)
    for (let x = -w / 2 + (r % 2) * cell; x < w / 2; x += cell * 2) ctx.fillRect(x, y, cell, cell)
  const s = Math.min(w, h) * 0.35
  ctx.strokeStyle = '#7c5cff'
  ctx.lineWidth = Math.max(0.3, s / 12)
  ctx.lineJoin = 'round'
  ctx.strokeRect(-s / 2, -s / 2.6, s, s / 1.3)
  ctx.beginPath()
  ctx.moveTo(-s / 2, s / 4)
  ctx.lineTo(-s / 8, -s / 10)
  ctx.lineTo(s / 6, s / 6)
  ctx.lineTo(s / 3, 0)
  ctx.lineTo(s / 2, s / 6)
  ctx.stroke()
  ctx.setLineDash([Math.max(0.6, s / 8), Math.max(0.4, s / 12)])
  ctx.lineWidth = Math.max(0.25, s / 20)
  ctx.strokeRect(-w / 2 + ctx.lineWidth, -h / 2 + ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2)
  ctx.restore()
}

function drawText(ctx: Canvas2D, layer: TextLayer, pxPerMm: number) {
  const lines = layer.text.split('\n')
  // Draw in device pixels so tiny mm font sizes are not quantised by the browser.
  ctx.scale(1 / pxPerMm, 1 / pxPerMm)
  const size = layer.fontSize * pxPerMm
  ctx.font = fontString(layer, size)
  ctx.textAlign = layer.align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const { w } = textSize(layer)
  const halfW = ((w - layer.strokeWidth * 2) * pxPerMm) / 2
  const x = layer.align === 'left' ? -halfW : layer.align === 'right' ? halfW : 0
  const lh = size * LINE_HEIGHT
  const top = -((lines.length - 1) * lh) / 2
  lines.forEach((line, i) => {
    const y = top + i * lh
    if (layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.strokeColor
      ctx.lineWidth = layer.strokeWidth * 2 * pxPerMm
      ctx.strokeText(line, x, y)
    }
    ctx.fillStyle = layer.color
    ctx.fillText(line, x, y)
  })
}

/**
 * Draws the design with the current transform mapping 1 unit = 1 mm and the
 * template bounding box at (bleed, bleed). `pxPerMm` is only needed for text.
 */
export function drawLayers(
  ctx: Canvas2D,
  design: Design,
  template: StickerTemplate,
  pxPerMm: number,
  bleedMm: number,
  resolve: ImageResolver,
  placeholders = false,
) {
  // Topmost visible frame: its opening is the window for images with mask 'frame' that lie
  // BELOW it. Pictures moved above the frame are drawn freely (they may cover the ring).
  const frameIndex = design.layers.findLastIndex((l) => l.type === 'frame' && l.visible)
  const windowFrame = frameIndex >= 0 ? (design.layers[frameIndex] as FrameLayer) : null
  design.layers.forEach((layer, index) => {
    if (!layer.visible || layer.opacity <= 0) return
    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = layer.blend
    if (layer.type === 'image' && layer.mask === 'frame' && windowFrame && index < frameIndex) {
      clipToFrameWindow(ctx, windowFrame, bleedMm)
    }
    if (layer.type === 'fill') {
      drawFill(ctx, layer, 0, 0, template.widthMm + bleedMm * 2, template.heightMm + bleedMm * 2)
    } else {
      ctx.translate(layer.x + bleedMm, layer.y + bleedMm)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1)
      if (layer.type === 'image') {
        const img = resolve(layer.assetId)
        const h = imageLayerHeight(layer)
        if (layer.mask === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, Math.min(layer.width, h) / 2, 0, Math.PI * 2)
          ctx.clip()
        }
        if (img) ctx.drawImage(img, -layer.width / 2, -h / 2, layer.width, h)
        else if (placeholders && !layer.assetId) drawPlaceholder(ctx, layer.width, h)
      } else if (layer.type === 'shape') {
        drawShape(ctx, layer)
      } else if (layer.type === 'frame') {
        drawFrame(ctx, layer)
      } else {
        drawText(ctx, layer, pxPerMm)
      }
    }
    ctx.restore()
  })
}

/**
 * Keeps only the cut shape grown by `bleed` mm (rounded offset = fill + thick
 * stroke), so the bleed follows the outline instead of printing the whole box.
 */
function maskToBleed(ctx: Canvas2D, shape: Path2D, bleed: number, base: DOMMatrix, pxPerMm: number) {
  const { width, height } = ctx.canvas
  const mask = new OffscreenCanvas(width, height)
  const m = mask.getContext('2d')!
  m.setTransform(base)
  m.scale(pxPerMm, pxPerMm)
  m.fillStyle = '#000'
  m.strokeStyle = '#000'
  m.lineJoin = 'round'
  m.lineWidth = bleed * 2
  m.fill(shape)
  m.stroke(shape)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.restore()
}

/** Renders a design onto a context whose origin is the output's top-left pixel. */
export function drawDesign(
  ctx: Canvas2D,
  design: Design,
  opts: RenderOptions,
  resolve: ImageResolver = (id) => getBitmapSync(id),
) {
  const template = getTemplate(design.templateId)
  const bleed = opts.bleedMm ?? 0
  const clip = opts.clip ?? 'outline'
  const base = ctx.getTransform()
  ctx.save()
  ctx.scale(opts.pxPerMm, opts.pxPerMm)
  const shape = outlinePath(template, bleed, bleed)
  if (clip === 'outline') ctx.clip(shape)
  drawLayers(ctx, design, template, opts.pxPerMm, bleed, resolve, opts.placeholders)
  ctx.restore()
  if (clip === 'bleed' && bleed > 0) maskToBleed(ctx, shape, bleed, base, opts.pxPerMm)
  if (opts.background) {
    // Painted underneath everything, including outside the cut shape (JPEG has no alpha).
    ctx.save()
    ctx.globalCompositeOperation = 'destination-over'
    ctx.scale(opts.pxPerMm, opts.pxPerMm)
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, template.widthMm + bleed * 2, template.heightMm + bleed * 2)
    ctx.restore()
  }
  if (opts.cutLine) {
    ctx.save()
    ctx.scale(opts.pxPerMm, opts.pxPerMm)
    ctx.strokeStyle = opts.cutLine.color
    ctx.lineWidth = opts.cutLine.widthMm
    ctx.stroke(shape)
    ctx.restore()
  }
}

/** Waits until all images and fonts used by the design are available. */
export async function preloadDesign(design: Design): Promise<Map<string, ImageBitmap>> {
  const bitmaps = new Map<string, ImageBitmap>()
  const jobs: Promise<unknown>[] = []
  for (const layer of design.layers) {
    if (layer.type === 'image' && layer.assetId) {
      jobs.push(
        getBitmap(layer.assetId)
          .then((b) => bitmaps.set(layer.assetId, b))
          .catch(() => {}),
      )
    } else if (layer.type === 'frame' && layer.bandText && typeof document !== 'undefined') {
      jobs.push(document.fonts.load(`40px "${layer.bandTextFont}"`, layer.bandText).catch(() => []))
    } else if (layer.type === 'text' && typeof document !== 'undefined') {
      jobs.push(document.fonts.load(fontString(layer, 40), layer.text).catch(() => []))
    }
  }
  await Promise.all(jobs)
  return bitmaps
}

export function outputSizePx(design: Design, opts: RenderOptions): { width: number; height: number } {
  const t = getTemplate(design.templateId)
  const bleed = opts.bleedMm ?? 0
  return {
    width: Math.round((t.widthMm + bleed * 2) * opts.pxPerMm),
    height: Math.round((t.heightMm + bleed * 2) * opts.pxPerMm),
  }
}

export async function renderDesignCanvas(design: Design, opts: RenderOptions): Promise<HTMLCanvasElement> {
  const bitmaps = await preloadDesign(design)
  const { width, height } = outputSizePx(design, opts)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  drawDesign(ctx, design, opts, (id) => bitmaps.get(id) ?? null)
  return canvas
}

export async function renderDesignBlob(
  design: Design,
  opts: RenderOptions,
  type: 'image/png' | 'image/webp' | 'image/jpeg' = 'image/png',
  quality = 0.9,
): Promise<Blob> {
  const canvas = await renderDesignCanvas(design, opts)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode-failed'))), type, quality),
  )
}

/** Effective print resolution of an image layer in dpi (null for non-image layers / placeholders). */
export function effectiveDpi(layer: Layer): number | null {
  if (layer.type !== 'image' || !layer.assetId) return null
  return (layer.naturalWidth / layer.width) * 25.4
}
