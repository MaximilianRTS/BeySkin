import { describe, expect, it } from 'vitest'
import { layoutSheet } from '../sheet'

const opts = { marginMm: 8, gapMm: 4, footerMm: 6, headerMm: 0 }

describe('layoutSheet', () => {
  it('places Battle Pass labels two per row on landscape A4', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ key: i, w: 114.55, h: 28.64 }))
    const layout = layoutSheet(items, 'a4', opts)
    expect(layout.pages).toBe(1)
    expect(layout.oversized).toEqual([])
    // Everything must stay inside the printable area.
    for (const p of layout.placements) {
      expect(p.x).toBeGreaterThanOrEqual(8)
      expect(p.x + 114.55).toBeLessThanOrEqual(layout.pageW - 8 + 1e-6)
      expect(p.y + 28.64).toBeLessThanOrEqual(layout.pageH - 8 - 6 + 1e-6)
    }
  })

  it('never overlaps items', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ key: i, w: i % 2 ? 60 : 85, h: i % 2 ? 20 : 55 }))
    const layout = layoutSheet(items, 'letter', opts)
    const boxes = layout.placements.map((p) => {
      const it = items[p.key]
      return { page: p.page, x1: p.x, y1: p.y, x2: p.x + it.w, y2: p.y + it.h }
    })
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.page !== b.page) continue
        const overlap = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
        expect(overlap).toBe(false)
      }
    expect(layout.placements).toHaveLength(30)
  })

  it('fills the gaps next to large labels with small stickers', () => {
    // 6 Battle Pass labels + 12 gear chips (with 1.5 mm bleed) on A4.
    const items = [
      ...Array.from({ length: 6 }, (_, i) => ({ key: `bp${i}`, w: 114.55, h: 28.64 })),
      ...Array.from({ length: 12 }, (_, i) => ({ key: `chip${i}`, w: 20.1, h: 20.1 })),
    ]
    const layout = layoutSheet(items, 'a4', opts)
    expect(layout.pages).toBe(1)
    // At least some chips share a row with a Battle Pass label.
    const bpRows = new Set(layout.placements.filter((p) => String(p.key).startsWith('bp')).map((p) => p.y))
    const chipsBeside = layout.placements.filter((p) => String(p.key).startsWith('chip') && bpRows.has(p.y))
    expect(chipsBeside.length).toBeGreaterThan(0)
  })

  it('reports items larger than the paper', () => {
    const layout = layoutSheet([{ key: 'huge', w: 400, h: 50 }], 'a4', opts)
    expect(layout.oversized).toEqual(['huge'])
    expect(layout.pages).toBe(0)
  })
})
