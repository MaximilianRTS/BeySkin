import { ellipse, roundedRect } from './geometry'
import type { CustomShape, CustomSpec, StickerTemplate } from './types'

/**
 * User-defined sizes. The Design model only stores a template id, so the size is
 * encoded in the id itself: `custom-rect-60x40`, `custom-rect-60x40-r3`,
 * `custom-ellipse-50x50`. Numbers are mm with at most two decimals and no
 * trailing zeros; only this canonical form is a valid id (one id per size, so
 * per-template drafts and caches never split).
 */

export const CUSTOM_MIN_MM = 5
/** Larger sizes would not fit the printable area of an A4/Letter page anyway. */
export const CUSTOM_MAX_MM = 250
export const CUSTOM_PREFIX = 'custom-'

const NUM = '(\\d{1,3}(?:\\.\\d{1,2})?)'
const CUSTOM_RE = new RegExp(`^custom-(rect|ellipse)-${NUM}x${NUM}(?:-r${NUM})?$`)

const round2 = (v: number) => Math.round(v * 100) / 100

/** 60 → "60", 53.980 → "53.98" (used in ids and labels). */
export function formatMm(v: number): string {
  return String(round2(v))
}

/** Clamps and rounds a size so that it can be encoded in an id. */
export function normalizeCustomSpec(spec: Partial<CustomSpec>): CustomSpec {
  const shape: CustomShape = spec.shape === 'ellipse' ? 'ellipse' : 'rect'
  const size = (v: unknown) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : 50
    return Math.min(CUSTOM_MAX_MM, Math.max(CUSTOM_MIN_MM, round2(n)))
  }
  const widthMm = size(spec.widthMm)
  const heightMm = size(spec.heightMm)
  let radiusMm = 0
  if (shape === 'rect' && typeof spec.radiusMm === 'number' && Number.isFinite(spec.radiusMm)) {
    // floor, so rounding never pushes the radius past half the short side
    radiusMm = Math.floor(Math.min(Math.max(0, spec.radiusMm), Math.min(widthMm, heightMm) / 2) * 100) / 100
  }
  return { shape, widthMm, heightMm, radiusMm }
}

export function customTemplateId(spec: Partial<CustomSpec>): string {
  const c = normalizeCustomSpec(spec)
  const r = c.shape === 'rect' && c.radiusMm > 0 ? `-r${formatMm(c.radiusMm)}` : ''
  return `${CUSTOM_PREFIX}${c.shape}-${formatMm(c.widthMm)}x${formatMm(c.heightMm)}${r}`
}

/** Spec for a canonical custom id, otherwise null (out of range, odd formatting, unknown shape). */
export function parseCustomId(id: string): CustomSpec | null {
  const m = CUSTOM_RE.exec(id)
  if (!m) return null
  const shape = m[1] as CustomShape
  if (shape === 'ellipse' && m[4] !== undefined) return null
  const spec = normalizeCustomSpec({ shape, widthMm: Number(m[2]), heightMm: Number(m[3]), radiusMm: m[4] ? Number(m[4]) : 0 })
  return customTemplateId(spec) === id ? spec : null
}

export function buildCustomTemplate(spec: CustomSpec): StickerTemplate {
  const { shape, widthMm: w, heightMm: h, radiusMm: r } = spec
  return {
    id: customTemplateId(spec),
    i18nKey: 'custom',
    category: 'custom',
    widthMm: w,
    heightMm: h,
    outline: shape === 'ellipse' ? ellipse(w, h, 128) : roundedRect(w, h, r),
    // The user chose the size, so it is exact by definition.
    measured: true,
    previewModel: 'flat',
    safeMm: Math.min(1.5, Math.round(Math.min(w, h)) / 10),
    custom: spec,
  }
}
