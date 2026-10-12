import { describe, expect, it } from 'vitest'
import { calibrationGeometry, cropMarkLines, DEFAULT_PRINT_OPTIONS, fillLastPage, planSheet, type PlanJob } from '../pdf'
import { getTemplate } from '@/templates'

const opts = { ...DEFAULT_PRINT_OPTIONS }
const job = (id: string, templateId: string, quantity: number): PlanJob => ({ design: { id, templateId }, quantity })

describe('planSheet', () => {
  it('sizes every sticker by template, bleed and printer scale', () => {
    const t = getTemplate('battlepass')
    const plan = planSheet([job('a', 'battlepass', 2)], { ...opts, bleedMm: 2, scaleX: 1.01, scaleY: 0.99 })
    expect(plan.items).toHaveLength(2)
    for (const it of plan.items) {
      expect(it.id).toBe('a')
      expect(it.w).toBeCloseTo((t.widthMm + 4) * 1.01)
      expect(it.h).toBeCloseTo((t.heightMm + 4) * 0.99)
      // The cut line starts inside the bleed.
      expect(it.cutX).toBeCloseTo(it.x + 2 * 1.01)
      expect(it.cutY).toBeCloseTo(it.y + 2 * 0.99)
    }
  })

  it('skips designs with quantity 0', () => {
    const plan = planSheet([job('a', 'gear_chip', 0), job('b', 'gear_chip', 3)], opts)
    expect(plan.items.map((i) => i.id)).toEqual(['b', 'b', 'b'])
  })

  it('keeps the calibration header free on page 1', () => {
    const plan = planSheet([job('a', 'gear_chip', 5)], { ...opts, calibration: true })
    const without = planSheet([job('a', 'gear_chip', 5)], { ...opts, calibration: false })
    const minY = (p: typeof plan) => Math.min(...p.items.filter((i) => i.page === 0).map((i) => i.y))
    expect(minY(plan)).toBeGreaterThan(minY(without) + 10)
  })

  it('reports usage per page between 0 and 1', () => {
    const plan = planSheet([job('a', 'battlepass', 20)], opts)
    expect(plan.usage).toHaveLength(plan.pages)
    for (const u of plan.usage) {
      expect(u).toBeGreaterThan(0)
      expect(u).toBeLessThanOrEqual(1)
    }
  })

  it('returns an empty plan without jobs', () => {
    const plan = planSheet([], opts)
    expect(plan.pages).toBe(0)
    expect(plan.items).toEqual([])
    expect(plan.usage).toEqual([])
  })
})

describe('fillLastPage', () => {
  it('fills the last page without adding a page', () => {
    const jobs = [job('bp', 'battlepass', 3), job('chip', 'gear_chip', 2)]
    const before = planSheet(jobs, opts)
    const qty = fillLastPage(jobs, opts)
    const filled = jobs.map((j) => ({ ...j, quantity: qty.get(j.design.id)! }))
    const after = planSheet(filled, opts)
    expect(after.pages).toBe(before.pages)
    expect(after.items.length).toBeGreaterThan(before.items.length)
    // Every design got more copies (round robin), none got fewer.
    for (const j of jobs) expect(qty.get(j.design.id)!).toBeGreaterThan(j.quantity)
    // One more copy of anything would need a new page.
    for (const j of jobs) {
      const more = filled.map((f) => (f.design.id === j.design.id ? { ...f, quantity: f.quantity + 1 } : f))
      if (qty.get(j.design.id)! < 99) expect(planSheet(more, opts).pages).toBeGreaterThan(before.pages)
    }
  })

  it('leaves designs with quantity 0 alone', () => {
    const qty = fillLastPage([job('a', 'gear_chip', 1), job('b', 'gear_chip', 0)], opts)
    expect(qty.get('b')).toBe(0)
    expect(qty.get('a')!).toBeGreaterThan(1)
  })

  it('respects the maximum quantity', () => {
    const qty = fillLastPage([job('a', 'gear_chip', 1)], opts, 10)
    expect(qty.get('a')).toBe(10)
  })

  it('changes nothing when there is nothing to print', () => {
    const qty = fillLastPage([job('a', 'gear_chip', 0)], opts)
    expect(qty.get('a')).toBe(0)
  })
})

describe('sheet geometry helpers', () => {
  it('draws two lines per corner, outside the box', () => {
    const lines = cropMarkLines(10, 20, 30, 40)
    expect(lines).toHaveLength(8)
    for (const [x1, y1, x2, y2] of lines) {
      const outside = (x: number, y: number) => x < 10 || x > 40 || y < 20 || y > 60
      expect(outside(x1, y1) && outside(x2, y2)).toBe(true)
    }
  })

  it('scales the calibration ruler with the printer correction', () => {
    const g = calibrationGeometry({ scaleX: 1.02, scaleY: 0.98 })
    expect(g.ruler.len).toBeCloseTo(51)
    expect(g.square.w).toBeCloseTo(10.2)
    expect(g.square.h).toBeCloseTo(9.8)
    expect(g.ticks).toHaveLength(11)
    expect(g.ticks.at(-1)!.x - g.ticks[0].x).toBeCloseTo(51)
  })
})
