import { describe, expect, it } from 'vitest'
import {
  alignOffset,
  boundsOf,
  boxesIntersect,
  cleanGroups,
  distributeOffsets,
  normalizeAngle,
  rectFromPoints,
  snapAxis,
  transformAround,
  unionBoxes,
  type Box,
} from '../selection'

const box = (x1: number, y1: number, x2: number, y2: number): Box => ({ x1, y1, x2, y2 })

describe('bounds', () => {
  it('handles unrotated and rotated boxes', () => {
    expect(boundsOf({ x: 10, y: 5, rotation: 0 }, { w: 4, h: 2 })).toEqual(box(8, 4, 12, 6))
    const b = boundsOf({ x: 0, y: 0, rotation: 90 }, { w: 4, h: 2 })
    expect(b.x1).toBeCloseTo(-1)
    expect(b.y2).toBeCloseTo(2)
  })

  it('unions boxes', () => {
    expect(unionBoxes([])).toBeNull()
    expect(unionBoxes([box(0, 0, 2, 2), box(5, -1, 6, 1)])).toEqual(box(0, -1, 6, 2))
  })

  it('tests marquee overlap in any drag direction', () => {
    const rect = rectFromPoints({ x: 10, y: 10 }, { x: 0, y: 0 })
    expect(rect).toEqual(box(0, 0, 10, 10))
    expect(boxesIntersect(rect, box(9, 9, 20, 20))).toBe(true)
    expect(boxesIntersect(rect, box(10, 2, 12, 4))).toBe(true) // touching
    expect(boxesIntersect(rect, box(11, 2, 12, 4))).toBe(false)
  })
})

describe('align', () => {
  const target = box(0, 0, 100, 40)
  it('moves boxes flush with edges and centres', () => {
    expect(alignOffset(box(10, 10, 20, 20), target, 'left')).toEqual({ dx: -10, dy: 0 })
    expect(alignOffset(box(10, 10, 20, 20), target, 'right')).toEqual({ dx: 80, dy: 0 })
    expect(alignOffset(box(10, 10, 20, 20), target, 'hcenter')).toEqual({ dx: 35, dy: 0 })
    expect(alignOffset(box(10, 10, 20, 20), target, 'top')).toEqual({ dx: 0, dy: -10 })
    expect(alignOffset(box(10, 10, 20, 20), target, 'vcenter')).toEqual({ dx: 0, dy: 5 })
    expect(alignOffset(box(10, 10, 20, 20), target, 'bottom')).toEqual({ dx: 0, dy: 20 })
  })
})

describe('distribute', () => {
  it('needs at least three boxes', () => {
    expect(distributeOffsets([box(0, 0, 1, 1), box(5, 0, 6, 1)], 'x', 'gaps')).toEqual([0, 0])
  })

  it('spaces centres evenly and keeps the outer ones', () => {
    // input order is not the visual order
    const boxes = [box(18, 0, 22, 1), box(0, 0, 2, 1), box(4, 0, 6, 1)]
    const d = distributeOffsets(boxes, 'x', 'centers')
    const centres = boxes.map((b, i) => (b.x1 + b.x2) / 2 + d[i])
    expect(centres[1]).toBeCloseTo(1)
    expect(centres[0]).toBeCloseTo(20)
    expect(centres[2]).toBeCloseTo(10.5)
  })

  it('makes the gaps equal and keeps the outer edges', () => {
    const boxes = [box(0, 0, 0, 10), box(0, 0, 0, 2), box(0, 6, 0, 8), box(0, 20, 0, 30)]
    const d = distributeOffsets(boxes, 'y', 'gaps')
    const moved = boxes.map((b, i) => ({ y1: b.y1 + d[i], y2: b.y2 + d[i] })).sort((a, b) => a.y1 - b.y1)
    expect(moved[0].y1).toBeCloseTo(0)
    expect(moved.at(-1)!.y2).toBeCloseTo(30)
    const gaps = moved.slice(1).map((m, i) => m.y1 - moved[i].y2)
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0])
  })
})

describe('snapping', () => {
  it('picks the closest target within the threshold', () => {
    const r = snapAxis([10, 15, 20], [0, 21, 50], 2)
    expect(r.shift).toBeCloseTo(1)
    expect(r.guides).toEqual([21])
  })

  it('reports every line that lines up', () => {
    const r = snapAxis([9.5, 15, 20.5], [10, 21, 30], 1)
    expect(r.shift).toBeCloseTo(0.5)
    expect(r.guides.sort()).toEqual([10, 21])
  })

  it('does nothing outside the threshold', () => {
    expect(snapAxis([10], [13], 2)).toEqual({ shift: 0, guides: [] })
  })
})

describe('group transform', () => {
  it('scales offsets from the centre', () => {
    const p = transformAround({ x: 12, y: 10 }, { x: 10, y: 10 }, 2, 0)
    expect(p).toEqual({ x: 14, y: 10 })
  })

  it('rotates clockwise in screen coordinates', () => {
    const p = transformAround({ x: 11, y: 10 }, { x: 10, y: 10 }, 1, 90)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(11)
  })

  it('normalizes angles', () => {
    expect(normalizeAngle(190)).toBe(-170)
    expect(normalizeAngle(-180)).toBe(-180)
    expect(normalizeAngle(720 + 45)).toBe(45)
  })
})

describe('cleanGroups', () => {
  it('removes groups with a single member', () => {
    const layers = [{ groupId: 'a' }, { groupId: 'a' }, { groupId: 'b' }, { groupId: null }, {}]
    expect(cleanGroups(layers)).toBe(true)
    expect(layers.map((l) => l.groupId ?? null)).toEqual(['a', 'a', null, null, null])
    expect(cleanGroups(layers)).toBe(false)
  })
})
