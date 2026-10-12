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
  /** Layers sharing a group id are selected and moved together (≥ 2 members). */
  groupId?: string | null
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
  /** Adjustments in percent (100 = unchanged); missing = neutral. */
  brightness?: number
  contrast?: number
  saturation?: number
  /** Hue rotation in degrees. */
  hue?: number
  /** 0–100 %. */
  grayscale?: number
  /** Background removal: pixels close to this colour become transparent; null = off. */
  keyColor?: string | null
  /** Percent of the maximum colour distance removed completely. */
  keyTolerance?: number
  /** Percent width of the soft transition beyond the tolerance. */
  keySoftness?: number
}

/** Values of the optional image fields that change nothing. */
export const IMAGE_ADJUST_DEFAULTS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  grayscale: 0,
  keyColor: null as string | null,
  keyTolerance: 15,
  keySoftness: 5,
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
  /** Extra space between letters in mm (may be negative). */
  letterSpacing?: number
  /** Text on an arc: angle in degrees, > 0 bends upwards (rainbow), < 0 downwards (smile), 0 = straight. */
  curve?: number
  /** Drop shadow colour; null = off. Offset and blur in mm. */
  shadowColor?: string | null
  shadowX?: number
  shadowY?: number
  shadowBlur?: number
  /** Outer glow colour; null = off. */
  glowColor?: string | null
  /** Glow size in mm. */
  glowSize?: number
}

/** Values of the optional text effect fields that leave the text plain. */
export const TEXT_EFFECT_DEFAULTS = {
  letterSpacing: 0,
  curve: 0,
  shadowColor: null as string | null,
  shadowX: 0.4,
  shadowY: 0.4,
  shadowBlur: 0.4,
  glowColor: null as string | null,
  glowSize: 0.8,
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
    l.groupId ??= null
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
      for (const [k, v] of Object.entries(IMAGE_ADJUST_DEFAULTS)) (l as unknown as Record<string, unknown>)[k] ??= v
    } else if (l.type === 'text') {
      for (const [k, v] of Object.entries(TEXT_EFFECT_DEFAULTS)) (l as unknown as Record<string, unknown>)[k] ??= v
    }
  }
  return d
}

/**
 * Moves and scales layers (in place) from one label size to another: positions
 * follow the label proportionally, sizes keep their aspect ratio and fit.
 */
export function scaleLayers(layers: Layer[], from: LabelSize, to: LabelSize): void {
  const f = Math.min(to.widthMm / from.widthMm, to.heightMm / from.heightMm)
  for (const l of layers) {
    if (l.type === 'fill') continue
    l.x = (l.x / from.widthMm) * to.widthMm
    l.y = (l.y / from.heightMm) * to.heightMm
    if (l.type === 'text') l.fontSize *= f
    else l.width *= f
  }
}

interface LabelSize {
  widthMm: number
  heightMm: number
}

/** Deep copy that also strips Vue/Pinia proxies. Designs are plain JSON by construction. */
export function cloneDesign(design: Design): Design {
  return JSON.parse(JSON.stringify(design)) as Design
}
