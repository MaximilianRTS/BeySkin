import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ORDER,
  CUSTOM_MAX_MM,
  CUSTOM_MIN_MM,
  DEFAULT_TEMPLATE_ID,
  TEMPLATES,
  customTemplateId,
  getTemplate,
  isCustomTemplateId,
  isTemplateId,
  parseCustomId,
  safeMargin,
  templateName,
  type StickerTemplate,
} from '@/templates'
import { sanitizeDesign } from '../projectFile'

const CUSTOM_SAMPLES = ['custom-rect-60x40', 'custom-rect-60x40-r3', 'custom-ellipse-50x50', 'custom-rect-85.6x53.98-r3.18', 'custom-ellipse-5x250']

function checkOutline(t: StickerTemplate) {
  expect(t.outline.length).toBeGreaterThanOrEqual(4)
  const xs = t.outline.map((p) => p[0])
  const ys = t.outline.map((p) => p[1])
  for (const v of [...xs, ...ys]) expect(Number.isFinite(v)).toBe(true)
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.01)
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.01)
  expect(Math.max(...xs)).toBeLessThanOrEqual(t.widthMm + 0.01)
  expect(Math.max(...ys)).toBeLessThanOrEqual(t.heightMm + 0.01)
  expect(Math.max(...xs)).toBeCloseTo(t.widthMm, 1)
  expect(Math.max(...ys)).toBeCloseTo(t.heightMm, 1)
  // closed polygon without a duplicated closing point and with a real area
  const [fx, fy] = t.outline[0]
  const [lx, ly] = t.outline.at(-1)!
  expect(Math.hypot(fx - lx, fy - ly)).toBeGreaterThan(1e-6)
  let area = 0
  t.outline.forEach(([x, y], i) => {
    const [nx, ny] = t.outline[(i + 1) % t.outline.length]
    area += x * ny - nx * y
  })
  expect(Math.abs(area) / 2).toBeGreaterThan(t.widthMm * t.heightMm * 0.5)
}

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s outline fits its bounding box', (_, t) => checkOutline(t))

  it.each(CUSTOM_SAMPLES.map((id) => [id]))('custom %s outline fits its bounding box', (id) => checkOutline(getTemplate(id)))

  it('has unique ids, known categories and sane safe margins', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) {
      expect(CATEGORY_ORDER).toContain(t.category)
      expect(t.id.startsWith('custom-')).toBe(false)
      const safe = safeMargin(t)
      expect(safe).toBeGreaterThan(0)
      expect(safe * 2).toBeLessThan(Math.min(t.widthMm, t.heightMm))
    }
    expect(getTemplate('gear_chip').safeMm).toBe(1)
    expect(getTemplate('player_card').safeMm).toBe(2)
  })

  it('player card is ISO/IEC 7810 ID-1', () => {
    const t = getTemplate('player_card')
    expect(t.widthMm).toBe(85.6)
    expect(t.heightMm).toBe(53.98)
    expect(t.measured).toBe(true)
  })

  it('estimated sizes are flagged as not measured', () => {
    expect(getTemplate('launcher_x').measured).toBe(false)
    expect(getTemplate('deck_case').measured).toBe(false)
  })

  it('falls back to the default template for unknown ids', () => {
    expect(getTemplate('nope').id).toBe(DEFAULT_TEMPLATE_ID)
    expect(getTemplate('custom-rect-1000x10').id).toBe(DEFAULT_TEMPLATE_ID)
  })
})

describe('custom templates', () => {
  it('builds canonical ids', () => {
    expect(customTemplateId({ shape: 'rect', widthMm: 60, heightMm: 40, radiusMm: 3 })).toBe('custom-rect-60x40-r3')
    expect(customTemplateId({ shape: 'rect', widthMm: 60, heightMm: 40, radiusMm: 0 })).toBe('custom-rect-60x40')
    expect(customTemplateId({ shape: 'ellipse', widthMm: 50, heightMm: 50, radiusMm: 9 })).toBe('custom-ellipse-50x50')
    expect(customTemplateId({ shape: 'rect', widthMm: 85.6, heightMm: 53.98, radiusMm: 3.18 })).toBe('custom-rect-85.6x53.98-r3.18')
    expect(customTemplateId({ shape: 'rect', widthMm: 33.333333, heightMm: 20.006, radiusMm: 0 })).toBe('custom-rect-33.33x20.01')
  })

  it('clamps sizes and radius', () => {
    expect(customTemplateId({ shape: 'rect', widthMm: 1, heightMm: 9999, radiusMm: 0 })).toBe(`custom-rect-${CUSTOM_MIN_MM}x${CUSTOM_MAX_MM}`)
    expect(customTemplateId({ shape: 'rect', widthMm: 20, heightMm: 10, radiusMm: 50 })).toBe('custom-rect-20x10-r5')
    expect(customTemplateId({ shape: 'rect', widthMm: 20, heightMm: 10, radiusMm: -3 })).toBe('custom-rect-20x10')
    expect(customTemplateId({ shape: 'rect', widthMm: Number.NaN, heightMm: Infinity, radiusMm: Number.NaN })).toMatch(/^custom-rect-\d+x\d+$/)
  })

  it('round-trips id → spec → id and template sizes', () => {
    for (const id of CUSTOM_SAMPLES) {
      const spec = parseCustomId(id)
      expect(spec, id).not.toBeNull()
      expect(customTemplateId(spec!)).toBe(id)
      const t = getTemplate(id)
      expect(t.id).toBe(id)
      expect(t.widthMm).toBe(spec!.widthMm)
      expect(t.heightMm).toBe(spec!.heightMm)
      expect(t.category).toBe('custom')
      expect(t.previewModel).toBe('flat')
      expect(t.i18nKey).toBe('custom')
    }
  })

  it('memoises: the same id returns the same object', () => {
    expect(getTemplate('custom-rect-61x41-r2')).toBe(getTemplate('custom-rect-61x41-r2'))
  })

  it('rejects malformed or non-canonical ids', () => {
    for (const id of [
      'custom-rect-060x40',
      'custom-rect-60.0x40',
      'custom-rect-60.123x40',
      'custom-rect-60x40-r0',
      'custom-rect-4x40',
      'custom-rect-251x40',
      'custom-rect-20x10-r6',
      'custom-ellipse-50x50-r3',
      'custom-star-50x50',
      'custom-rect-60x40 ',
      'custom-rect--60x40',
      'custom-rect-1e2x40',
      '',
    ]) {
      expect(parseCustomId(id), id).toBeNull()
      expect(isTemplateId(id), id).toBe(false)
    }
  })

  it('isTemplateId accepts built-in and custom ids only', () => {
    for (const t of TEMPLATES) expect(isTemplateId(t.id)).toBe(true)
    expect(isTemplateId('custom-rect-60x40-r3')).toBe(true)
    expect(isTemplateId(42)).toBe(false)
    expect(isTemplateId(null)).toBe(false)
    expect(isCustomTemplateId('battlepass')).toBe(false)
    expect(isCustomTemplateId('custom-ellipse-30x20')).toBe(true)
  })

  it('names custom templates with their size', () => {
    const t = (key: string, named: Record<string, unknown>) => `${key}|${JSON.stringify(named)}`
    expect(templateName(t, getTemplate('battlepass'))).toBe('templates.battlepass|{}')
    expect(templateName(t, getTemplate('custom-rect-60x40.5'))).toBe('templates.custom_name|{"w":"60","h":"40.5"}')
    expect(templateName(t, getTemplate('custom-ellipse-30x30'))).toBe('templates.custom_name_ellipse|{"w":"30","h":"30"}')
  })

  it('project import keeps custom template ids', () => {
    expect(sanitizeDesign({ templateId: 'custom-rect-60x40-r3', layers: [] }, new Set()).templateId).toBe('custom-rect-60x40-r3')
    expect(sanitizeDesign({ templateId: 'player_card', layers: [] }, new Set()).templateId).toBe('player_card')
    expect(sanitizeDesign({ templateId: 'custom-rect-999x40', layers: [] }, new Set()).templateId).toBe('battlepass')
    expect(sanitizeDesign({ templateId: { evil: true }, layers: [] }, new Set()).templateId).toBe('battlepass')
  })
})
