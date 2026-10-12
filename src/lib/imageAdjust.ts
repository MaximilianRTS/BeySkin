import { IMAGE_ADJUST_DEFAULTS, type ImageLayer } from './model'

/**
 * Image adjustments (CSS-filter style) and background removal by colour key.
 * Pure functions on RGBA pixel data; assets.ts runs them on OffscreenCanvas and
 * caches the result per asset + parameters (the "variant key").
 */

export interface Adjustments {
  /** Percent, 100 = unchanged. */
  brightness: number
  contrast: number
  saturation: number
  /** Degrees. */
  hue: number
  /** Percent, 0 = unchanged. */
  grayscale: number
}

export interface ColorKey {
  color: string
  /** Percent of the maximum RGB distance that becomes fully transparent. */
  tolerance: number
  /** Percent width of the soft transition beyond the tolerance. */
  softness: number
}

export const NEUTRAL_ADJUSTMENTS: Adjustments = { brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0 }

/** The layer's adjustments, or null when they would not change anything. */
export function layerAdjustments(layer: ImageLayer): Adjustments | null {
  const a: Adjustments = {
    brightness: layer.brightness ?? 100,
    contrast: layer.contrast ?? 100,
    saturation: layer.saturation ?? 100,
    hue: layer.hue ?? 0,
    grayscale: layer.grayscale ?? 0,
  }
  const neutral = (Object.keys(a) as (keyof Adjustments)[]).every((k) => a[k] === NEUTRAL_ADJUSTMENTS[k])
  return neutral ? null : a
}

export function layerColorKey(layer: ImageLayer): ColorKey | null {
  if (!layer.keyColor) return null
  const tolerance = layer.keyTolerance ?? IMAGE_ADJUST_DEFAULTS.keyTolerance
  const softness = layer.keySoftness ?? IMAGE_ADJUST_DEFAULTS.keySoftness
  if (tolerance <= 0 && softness <= 0) return null
  return { color: layer.keyColor.toLowerCase(), tolerance, softness }
}

/** ctx.filter string for the adjustments (same order as applyAdjustments). */
export function cssFilter(a: Adjustments): string {
  const parts: string[] = []
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness / 100})`)
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast / 100})`)
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation / 100})`)
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`)
  if (a.grayscale !== 0) parts.push(`grayscale(${a.grayscale / 100})`)
  return parts.join(' ') || 'none'
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

const MAX_DIST = Math.sqrt(3) * 255

/** Makes pixels close to the key colour transparent (in place, unpremultiplied RGBA). */
export function applyColorKey(data: Uint8ClampedArray, key: ColorKey): void {
  const [kr, kg, kb] = hexToRgb(key.color)
  const tol = (Math.max(0, key.tolerance) / 100) * MAX_DIST
  const soft = (Math.max(0, key.softness) / 100) * MAX_DIST
  const tol2 = tol * tol
  const outer = tol + soft
  const outer2 = outer * outer
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const dr = data[i] - kr
    const dg = data[i + 1] - kg
    const db = data[i + 2] - kb
    const d2 = dr * dr + dg * dg + db * db
    if (d2 <= tol2) data[i + 3] = 0
    else if (d2 < outer2) data[i + 3] = Math.round((data[i + 3] * (Math.sqrt(d2) - tol)) / soft)
  }
}

type Matrix = [number, number, number, number, number, number, number, number, number]

// Colour matrices from the Filter Effects spec (saturate, hue-rotate, grayscale).
function saturateMatrix(s: number): Matrix {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ]
}

function hueMatrix(deg: number): Matrix {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ]
}

function grayscaleMatrix(g: number): Matrix {
  const k = 1 - Math.min(1, Math.max(0, g))
  return [
    0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
  ]
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Same result as cssFilter() via ctx.filter; fallback for browsers without canvas filters. */
export function applyAdjustments(data: Uint8ClampedArray, a: Adjustments): void {
  const b = a.brightness / 100
  const c = a.contrast / 100
  const matrices: Matrix[] = []
  if (a.saturation !== 100) matrices.push(saturateMatrix(a.saturation / 100))
  if (a.hue !== 0) matrices.push(hueMatrix(a.hue))
  if (a.grayscale !== 0) matrices.push(grayscaleMatrix(a.grayscale / 100))
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = data[i]
    let g = data[i + 1]
    let bl = data[i + 2]
    if (b !== 1) {
      r = clamp(r * b)
      g = clamp(g * b)
      bl = clamp(bl * b)
    }
    if (c !== 1) {
      r = clamp((r - 127.5) * c + 127.5)
      g = clamp((g - 127.5) * c + 127.5)
      bl = clamp((bl - 127.5) * c + 127.5)
    }
    for (const m of matrices) {
      const nr = clamp(m[0] * r + m[1] * g + m[2] * bl)
      const ng = clamp(m[3] * r + m[4] * g + m[5] * bl)
      const nb = clamp(m[6] * r + m[7] * g + m[8] * bl)
      r = nr
      g = ng
      bl = nb
    }
    data[i] = r
    data[i + 1] = g
    data[i + 2] = bl
  }
}

/**
 * Background colour guess for the "auto" button: average of a small patch in
 * every corner, then the corner colour closest to the others (ignores a single
 * odd corner). Null when all corners are already transparent.
 */
export function pickKeyColor(data: Uint8ClampedArray, w: number, h: number): string | null {
  const p = Math.max(1, Math.round(Math.min(w, h) * 0.03))
  const corners: [number, number, number][] = []
  for (const [x0, y0] of [[0, 0], [w - p, 0], [0, h - p], [w - p, h - p]]) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = y0; y < y0 + p; y++)
      for (let x = x0; x < x0 + p; x++) {
        const i = (y * w + x) * 4
        if (data[i + 3] < 128) continue
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        n++
      }
    if (n > (p * p) / 2) corners.push([r / n, g / n, b / n])
  }
  if (!corners.length) return null
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  let best = corners[0]
  let bestSum = Infinity
  for (const c of corners) {
    const sum = corners.reduce((s, o) => s + dist(c, o), 0)
    if (sum < bestSum) {
      bestSum = sum
      best = c
    }
  }
  return rgbToHex(best[0], best[1], best[2])
}

/** What a processed variant needs: colour key and (without canvas filter support) the adjustments. */
export interface VariantParams {
  key: ColorKey | null
  adjust: Adjustments | null
}

/** Cache key for a processed image; the plain asset id when nothing needs processing. */
export function variantKey(assetId: string, params: VariantParams): string {
  if (!params.key && !params.adjust) return assetId
  return `${assetId}|${JSON.stringify(params)}`
}

export function parseVariantKey(key: string): { assetId: string; params: VariantParams } {
  const sep = key.indexOf('|')
  if (sep < 0) return { assetId: key, params: { key: null, adjust: null } }
  return { assetId: key.slice(0, sep), params: JSON.parse(key.slice(sep + 1)) as VariantParams }
}

let filterSupport: boolean | null = null
/** Does canvas 2D support ctx.filter? Checked by actually drawing (Safari may expose a no-op). */
export function canvasFilterSupported(): boolean {
  if (filterSupport !== null) return filterSupport
  filterSupport = false
  try {
    const probe = (c: { getContext(t: '2d'): unknown } | null): boolean => {
      const ctx = c?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
      if (!ctx || !('filter' in ctx)) return false
      ctx.filter = 'grayscale(1)'
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      return Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 0
    }
    const kinds: boolean[] = []
    if (typeof OffscreenCanvas !== 'undefined') kinds.push(probe(new OffscreenCanvas(1, 1)))
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      kinds.push(probe(c))
    }
    filterSupport = kinds.length > 0 && kinds.every(Boolean)
  } catch {
    filterSupport = false
  }
  return filterSupport
}

/** Variant parameters of an image layer for the current browser. */
export function layerVariant(layer: ImageLayer): VariantParams {
  const adjust = layerAdjustments(layer)
  return { key: layerColorKey(layer), adjust: adjust && !canvasFilterSupported() ? adjust : null }
}

/** ctx.filter to apply while drawing the layer ('' = none, or handled by the processed variant). */
export function layerFilter(layer: ImageLayer): string {
  const adjust = layerAdjustments(layer)
  return adjust && canvasFilterSupported() ? cssFilter(adjust) : ''
}
