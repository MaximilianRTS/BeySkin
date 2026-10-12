import { describe, expect, it } from 'vitest'
import { PATTERN_IDS, SHAPES, drawPattern, getShape } from '../library'
import type { PatternId, ShapeCategory } from '../library'
import deShapes from '@/i18n/locales/de/shapes.json'
import enShapes from '@/i18n/locales/en/shapes.json'

const CATEGORIES: ShapeCategory[] = ['basic', 'action', 'symbols', 'frames']

/** Minimal SVG path tokenizer + bbox. Tracks the current point so relative commands work too. */
function parsePath(d: string) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  const xs: number[] = []
  const ys: number[] = []
  let i = 0
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  const add = (x: number, y: number) => {
    xs.push(x)
    ys.push(y)
  }
  const num = () => {
    const t = tokens[i++]
    const v = Number(t)
    if (t === undefined || !Number.isFinite(v)) throw new Error(`bad number ${t} in path`)
    return v
  }
  const known = 'MLHVCQAZ'
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    else if (cmd === 'M') cmd = 'L'
    else if (cmd === 'm') cmd = 'l'
    const up = cmd.toUpperCase()
    if (!known.includes(up)) throw new Error(`illegal command ${cmd}`)
    const rel = cmd !== up
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    switch (up) {
      case 'M':
      case 'L':
        cx = ox + num()
        cy = oy + num()
        if (up === 'M') {
          sx = cx
          sy = cy
        }
        add(cx, cy)
        break
      case 'H':
        cx = ox + num()
        add(cx, cy)
        break
      case 'V':
        cy = oy + num()
        add(cx, cy)
        break
      case 'C':
        add(ox + num(), oy + num())
        add(ox + num(), oy + num())
        cx = ox + num()
        cy = oy + num()
        add(cx, cy)
        break
      case 'Q':
        add(ox + num(), oy + num())
        cx = ox + num()
        cy = oy + num()
        add(cx, cy)
        break
      case 'A':
      {
        const rx = num()
        const ry = num()
        num() // x-axis-rotation
        num() // large-arc
        num() // sweep
        const ex = ox + num()
        const ey = oy + num()
        // half circle (endpoints = diameter): include the bulge, else endpoints only
        if (Math.abs(Math.hypot(ex - cx, ey - cy) - 2 * rx) < 0.05 && Math.abs(rx - ry) < 0.01) {
          const mx = (cx + ex) / 2
          const my = (cy + ey) / 2
          add(mx - rx, my - ry)
          add(mx + rx, my + ry)
        }
        cx = ex
        cy = ey
        add(cx, cy)
        break
      }
      case 'Z':
        cx = sx
        cy = sy
        break
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe('shape library', () => {
  it('has at least 28 shapes spread over all categories', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(28)
    for (const c of CATEGORIES) expect(SHAPES.filter((s) => s.category === c).length).toBeGreaterThanOrEqual(5)
  })

  it('has unique kebab-case ids and getShape works', () => {
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length)
    for (const s of SHAPES) {
      expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(getShape(s.id)).toBe(s)
      expect(CATEGORIES).toContain(s.category)
    }
    expect(getShape('does-not-exist')).toBeUndefined()
  })

  it.each(SHAPES.map((s) => [s.id, s] as const))('%s: valid path data inside its box', (_, s) => {
    expect(s.width).toBeGreaterThan(0)
    expect(s.height).toBeGreaterThan(0)
    expect(s.d).toMatch(/^M/)
    expect(s.d).not.toMatch(/NaN|Infinity|undefined/)
    // only allowed commands, no stray characters
    expect(s.d).toMatch(/^[MLCQAZHVmlcqazhv0-9.,\s-]+$/)
    const p = parsePath(s.d)
    const tx = s.width * 0.05
    const ty = s.height * 0.05
    expect(p.minX).toBeGreaterThanOrEqual(-tx)
    expect(p.minY).toBeGreaterThanOrEqual(-ty)
    expect(p.maxX).toBeLessThanOrEqual(s.width + tx)
    expect(p.maxY).toBeLessThanOrEqual(s.height + ty)
    // the artwork should actually use most of its box
    expect(p.maxX - p.minX).toBeGreaterThan(s.width * 0.6)
    expect(p.maxY - p.minY).toBeGreaterThan(s.height * 0.6)
  })

  it('marks hollow frames as evenodd', () => {
    for (const id of ['frame-rect', 'frame-rounded', 'ring', 'hex-frame', 'frame-cut']) {
      expect(getShape(id)?.evenodd, id).toBe(true)
    }
  })
})

describe('shape/pattern i18n', () => {
  const need = [
    'none',
    'library',
    ...CATEGORIES.map((c) => `category_${c}`),
    ...SHAPES.map((s) => s.id),
    ...PATTERN_IDS.map((p) => `pattern_${p}`),
  ]
  it.each([
    ['de', deShapes],
    ['en', enShapes],
  ] as const)('%s has all keys', (_, dict) => {
    const rec = dict as Record<string, string>
    for (const k of need) expect(rec[k], k).toBeTruthy()
  })
  it('de and en have identical key sets without extras', () => {
    expect(Object.keys(deShapes).sort()).toEqual(Object.keys(enShapes).sort())
    expect(Object.keys(deShapes).length).toBe(need.length)
  })
})

// ---------- patterns, using a recording mock context ----------

function mockCtx() {
  const state = { m: [1, 0, 0, 1, 0, 0], stack: [] as number[][], clipped: false, bad: 0 }
  /** Points recorded after clip(), transformed into rectangle space. */
  const pts: [number, number][] = []
  const calls: Record<string, number> = {}
  const rec = (x: number, y: number) => {
    if (!(Number.isFinite(x) && Number.isFinite(y))) state.bad++
    if (!state.clipped) return
    const [a, b, c, d, e, f] = state.m
    pts.push([a * x + c * y + e, b * x + d * y + f])
  }
  const target: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
  }
  const methods: Record<string, (...a: number[]) => void> = {
    save: () => state.stack.push([...state.m]),
    restore: () => {
      state.m = state.stack.pop()!
    },
    translate: (x, y) => {
      const [a, b, c, d, e, f] = state.m
      state.m = [a, b, c, d, a * x + c * y + e, b * x + d * y + f]
    },
    rotate: (r) => {
      if (!Number.isFinite(r)) state.bad++
      const [a, b, c, d, e, f] = state.m
      const cs = Math.cos(r)
      const sn = Math.sin(r)
      state.m = [a * cs + c * sn, b * cs + d * sn, -a * sn + c * cs, -b * sn + d * cs, e, f]
    },
    scale: (x, y) => {
      const [a, b, c, d, e, f] = state.m
      state.m = [a * x, b * x, c * y, d * y, e, f]
    },
    beginPath: () => {},
    closePath: () => {},
    clip: () => {
      state.clipped = true
    },
    fill: () => {},
    stroke: () => {},
    moveTo: (x, y) => rec(x, y),
    lineTo: (x, y) => rec(x, y),
    quadraticCurveTo: (cx, cy, x, y) => {
      rec(cx, cy)
      rec(x, y)
    },
    bezierCurveTo: (a, b, c, d, x, y) => {
      rec(a, b)
      rec(c, d)
      rec(x, y)
    },
    rect: (x, y, w, h) => {
      rec(x, y)
      rec(x + w, y + h)
    },
    arc: (x, y, r) => {
      if (!(Number.isFinite(r) && r >= 0)) state.bad++
      rec(x - r, y - r)
      rec(x + r, y + r)
    },
  }
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in methods) {
        return (...a: number[]) => {
          calls[k] = (calls[k] ?? 0) + 1
          methods[k](...a)
        }
      }
      return t[k]
    },
    set(t, k: string, v) {
      t[k] = v
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pts, calls, state }
}

describe('patterns', () => {
  it('lists the 18 unique pattern ids', () => {
    expect(PATTERN_IDS.length).toBe(18)
    expect(new Set(PATTERN_IDS).size).toBe(PATTERN_IDS.length)
    for (const id of ['camo', 'lightning', 'stars', 'shards', 'circuit', 'flames']) expect(PATTERN_IDS).toContain(id)
  })

  it.each(['camo', 'lightning', 'stars', 'shards', 'circuit', 'flames'] as const)('%s stays bounded for tiny tiles on big labels', (id) => {
    const m = mockCtx()
    drawPattern(m.ctx, id, 250, 250, '#fff', '#000', 0.3, 0)
    const ops = Object.values(m.calls).reduce((a, b) => a + b, 0)
    expect(ops).toBeLessThan(400_000)
    expect(m.state.bad).toBe(0)
  })

  it('scattered patterns keep the caller alpha (layer opacity)', () => {
    for (const id of ['camo', 'shards'] as const) {
      const m = mockCtx()
      ;(m.ctx as unknown as { globalAlpha: number }).globalAlpha = 0.5
      drawPattern(m.ctx, id, 40, 40, '#fff', '#000', 5, 0)
      expect((m.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(0.5)
    }
  })

  const combos: [PatternId, number, number, number, number][] = []
  for (const id of PATTERN_IDS) {
    for (const [w, h, scale, angle] of [
      [90, 60, 6, 0],
      [90, 60, 3, 33],
      [40, 100, 12, 90],
      [70, 70, 1, -45],
      [120, 30, 20, 200],
    ] as const)
      combos.push([id, w, h, scale, angle])
  }

  it.each(combos)('%s %ix%i scale %f angle %f: finite geometry reaching all rect sides', (id, w, h, scale, angle) => {
    const m = mockCtx()
    drawPattern(m.ctx, id, w, h, '#fff', '#000', scale, angle)
    expect(m.state.stack.length).toBe(0) // save/restore balanced
    expect((m.calls.fill ?? 0) + (m.calls.stroke ?? 0)).toBeGreaterThan(0)
    expect(m.pts.length).toBeGreaterThan(4)
    expect(m.state.bad).toBe(0)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of m.pts) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    // tiled patterns: the outermost tile may start up to one tile size inside the edge
    expect(minX).toBeLessThanOrEqual(scale)
    expect(minY).toBeLessThanOrEqual(scale)
    expect(maxX).toBeGreaterThanOrEqual(w - scale)
    expect(maxY).toBeGreaterThanOrEqual(h - scale)
  })

  it.each(PATTERN_IDS.map((p) => [p]))('%s is deterministic', (id) => {
    const a = mockCtx()
    const b = mockCtx()
    drawPattern(a.ctx, id, 80, 50, '#f00', '#00f', 5, 20)
    drawPattern(b.ctx, id, 80, 50, '#f00', '#00f', 5, 20)
    expect(a.pts).toEqual(b.pts)
    expect(a.calls).toEqual(b.calls)
  })

  it('survives degenerate parameters', () => {
    for (const id of PATTERN_IDS) {
      const m = mockCtx()
      drawPattern(m.ctx, id, 50, 50, '#fff', '#000', 0, Number.NaN)
      drawPattern(m.ctx, id, 50, 50, '#fff', '#000', 1e9, 0)
      drawPattern(m.ctx, id, 0, 50, '#fff', '#000', 5, 0)
      expect(m.state.stack.length).toBe(0)
      expect(m.state.bad).toBe(0)
    }
  })
})
