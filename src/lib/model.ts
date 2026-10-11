/**
 * Design document model. All geometry is in millimetres relative to the
 * template's bounding box (origin top-left). Images are referenced by asset id;
 * the binary data lives in the asset store (see assets.ts).
 */

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'

export const BLEND_MODES: BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
]

interface LayerBase {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blend: BlendMode
  /** Centre position in mm. */
  x: number
  y: number
  /** Degrees, clockwise. */
  rotation: number
  flipX: boolean
  flipY: boolean
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  /** Empty string = placeholder (e.g. from a share link) that the user fills with an own image. */
  assetId: string
  /** Natural pixel size of the asset, used for aspect ratio and DPI checks. */
  naturalWidth: number
  naturalHeight: number
  /** Rendered width in mm; height follows the aspect ratio. */
  width: number
  /**
   * 'circle' crops the picture to a circle (diameter = shorter side); 'frame' shows
   * it only through the opening of the design's chip frame (like behind a window).
   */
  mask?: 'circle' | 'frame' | null
}

export interface TextLayer extends LayerBase {
  type: 'text'
  text: string
  fontFamily: string
  /** Cap size in mm. */
  fontSize: number
  bold: boolean
  italic: boolean
  color: string
  strokeColor: string
  /** Outline width in mm, 0 = none. */
  strokeWidth: number
  align: 'left' | 'center' | 'right'
}

export interface FillLayer extends LayerBase {
  type: 'fill'
  color: string
  /** Second colour: gradient end, or the pattern colour when `pattern` is set. */
  color2: string | null
  /** Gradient / pattern angle in degrees. */
  angle: number
  /** Built-in pattern drawn with color2 on top of color (see lib/library/patterns). */
  pattern: string | null
  /** Pattern tile size in mm. */
  patternScale: number
}

/** Vector shape from the built-in sticker library (lib/library/shapes). */
export interface ShapeLayer extends LayerBase {
  type: 'shape'
  shapeId: string
  /** Width in mm; height follows the shape's aspect ratio. */
  width: number
  color: string
  strokeColor: string
  /** Outline width in mm, 0 = none. */
  strokeWidth: number
}

/** Built-in vector frame (lib/library/chipFrames), square, every part recolourable. */
export interface FrameLayer extends LayerBase {
  type: 'frame'
  frameId: string
  /** Width = height in mm. */
  width: number
  ringColor: string
  accentColor: string
  bandColor: string
  /** null = transparent opening (the picture underneath shows through). */
  centerColor: string | null
  /** Free text set along the colour band (e.g. a name); empty = none. */
  bandText: string
  bandTextColor: string
  bandTextFont: string
}

/** Classic black/white chip frame with the Bey Companion coral as band colour. */
export const FRAME_DEFAULT_COLORS = {
  ringColor: '#000000',
  accentColor: '#ffffff',
  bandColor: '#e8423a',
  centerColor: null,
  bandText: '',
  bandTextColor: '#ffffff',
  bandTextFont: 'Russo One',
} as const

export type Layer = ImageLayer | TextLayer | FillLayer | ShapeLayer | FrameLayer

export interface Design {
  id: string
  version: 2
  name: string
  templateId: string
  layers: Layer[]
  createdAt: string
  updatedAt: string
}

export function uid(): string {
  return crypto.randomUUID()
}

export function newDesign(templateId: string, name = ''): Design {
  const now = new Date().toISOString()
  return { id: uid(), version: 2, name, templateId, layers: [], createdAt: now, updatedAt: now }
}

/** Size of a layer's unrotated box in mm. Text size is measured by the renderer. */
export function imageLayerHeight(layer: ImageLayer): number {
  return (layer.width * layer.naturalHeight) / layer.naturalWidth
}

/**
 * Fills fields that older saved designs may lack (layers created before a feature
 * existed), so the UI never shows values that do not match the rendering.
 */
export function normalizeDesign(d: Design): Design {
  // Chip pictures used to be auto-cropped to their own circle; show them through the frame instead.
  const hasFrame = d.layers.some((l) => l.type === 'frame')
  for (const l of d.layers as Layer[]) {
    if (d.templateId === 'gear_chip' && l.type === 'image' && l.mask === 'circle') l.mask = hasFrame ? 'frame' : null
    if (l.type === 'frame') {
      l.ringColor ??= FRAME_DEFAULT_COLORS.ringColor
      l.accentColor ??= FRAME_DEFAULT_COLORS.accentColor
      l.bandColor ??= FRAME_DEFAULT_COLORS.bandColor
      if (l.centerColor === undefined) l.centerColor = null
      l.bandText ??= ''
      l.bandTextColor ??= FRAME_DEFAULT_COLORS.bandTextColor
      l.bandTextFont ??= FRAME_DEFAULT_COLORS.bandTextFont
    } else if (l.type === 'fill') {
      l.pattern ??= null
      l.patternScale ??= 4
    } else if (l.type === 'image') {
      l.mask ??= null
    }
  }
  return d
}

/** Deep copy that also strips Vue/Pinia proxies. Designs are plain JSON by construction. */
export function cloneDesign(design: Design): Design {
  return JSON.parse(JSON.stringify(design)) as Design
}
