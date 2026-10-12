import { describe, expect, it } from 'vitest'
import { EXAMPLES, createExample, exampleTemplateId, getExample } from '../examples'
import { PATTERN_IDS, getFrame, getShape } from '../library'
import { FONTS } from '../render'
import { sanitizeDesign } from '../projectFile'
import { getTemplate, isTemplateId } from '@/templates'
import enTemplates from '@/i18n/locales/en/templates.json'

const TEXTS = { name: 'YOUR NAME', team: 'TEAM NAME' }

describe('example designs', () => {
  it('cover the main templates with unique ids and names', () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length)
    const count = (id: string) => EXAMPLES.filter((e) => e.templateId === id).length
    expect(count('battlepass')).toBeGreaterThanOrEqual(2)
    expect(count('gear_chip')).toBeGreaterThanOrEqual(2)
    expect(count('player_card')).toBeGreaterThanOrEqual(1)
    for (const ex of EXAMPLES) {
      expect((enTemplates as Record<string, string>)[ex.i18nKey], ex.i18nKey).toBeTruthy()
      expect(getExample(ex.id)).toBe(ex)
    }
  })

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s only uses built-in content inside the label', (_, ex) => {
    expect(isTemplateId(ex.templateId)).toBe(true)
    const t = getTemplate(ex.templateId)
    const d = createExample(ex, TEXTS)
    expect(d.templateId).toBe(ex.templateId)
    expect(d.layers.length).toBeGreaterThanOrEqual(3)
    for (const l of d.layers) {
      if (l.type === 'fill') {
        if (l.pattern) expect(PATTERN_IDS).toContain(l.pattern)
        continue
      }
      expect(l.x).toBeGreaterThanOrEqual(0)
      expect(l.x).toBeLessThanOrEqual(t.widthMm)
      expect(l.y).toBeGreaterThanOrEqual(0)
      expect(l.y).toBeLessThanOrEqual(t.heightMm)
      if (l.type === 'shape') expect(getShape(l.shapeId), l.shapeId).toBeDefined()
      if (l.type === 'frame') expect(getFrame(l.frameId), l.frameId).toBeDefined()
      if (l.type === 'text') expect(FONTS as readonly string[]).toContain(l.fontFamily)
      if (l.type === 'image') expect(l.assetId).toBe('')
    }
  })

  it('creates fresh ids on every call', () => {
    for (const ex of EXAMPLES) {
      const a = createExample(ex, TEXTS, 'A')
      const b = createExample(ex, TEXTS, 'B')
      expect(a.id).not.toBe(b.id)
      expect(a.name).toBe('A')
      const ids = [...a.layers, ...b.layers].map((l) => l.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('opens Gear Chip examples on the Lock Chip (same sticker), others on their own template', () => {
    const chip = getExample('chip-flame')!
    expect(exampleTemplateId(chip, 'lock_chip')).toBe('lock_chip')
    expect(exampleTemplateId(chip, 'gear_chip')).toBe('gear_chip')
    expect(exampleTemplateId(chip, 'battlepass')).toBe('gear_chip')
    expect(exampleTemplateId(getExample('bp-speed')!, 'lock_chip')).toBe('battlepass')
    const own = createExample(chip, TEXTS)
    const lock = createExample(chip, TEXTS, '', 'lock_chip')
    expect(lock.templateId).toBe('lock_chip')
    // Scaled down to the smaller Lock Chip sticker, still centred.
    const f = getTemplate('lock_chip').widthMm / getTemplate('gear_chip').widthMm
    const frameOf = (d: typeof own) => d.layers.find((l) => l.type === 'frame')!
    expect(frameOf(lock).x).toBeCloseTo(getTemplate('lock_chip').widthMm / 2)
    expect((frameOf(lock) as { width: number }).width).toBeCloseTo((frameOf(own) as { width: number }).width * f)
  })

  it('uses the given texts', () => {
    const d = createExample(getExample('badge-tournament')!, { name: 'KAI', team: 'BLUE' })
    const texts = d.layers.flatMap((l) => (l.type === 'text' ? [l.text] : []))
    expect(texts).toContain('KAI')
    expect(texts).toContain('BLUE')
  })

  it('survives the share-link / project sanitizer unchanged in structure', () => {
    for (const ex of EXAMPLES) {
      const d = createExample(ex, TEXTS)
      const s = sanitizeDesign(JSON.parse(JSON.stringify(d)), new Set(), { placeholders: true })
      expect(s.templateId).toBe(d.templateId)
      expect(s.layers.map((l) => l.type)).toEqual(d.layers.map((l) => l.type))
    }
  })
})
