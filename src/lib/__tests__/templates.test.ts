import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '@/templates'

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s outline fits its bounding box', (_, t) => {
    const xs = t.outline.map((p) => p[0])
    const ys = t.outline.map((p) => p[1])
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.01)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.01)
    expect(Math.max(...xs)).toBeCloseTo(t.widthMm, 1)
    expect(Math.max(...ys)).toBeCloseTo(t.heightMm, 1)
  })

  it('has unique ids', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length)
  })
})
