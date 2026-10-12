import type { Canvas2D } from '../render'

/**
 * Procedural background patterns. Everything is drawn with plain Canvas2D path
 * calls (no DOM, no Path2D, no Math.random) so it runs on the editor canvas, in
 * OffscreenCanvas workers and in tests with a mock context. The result only
 * depends on the arguments.
 *
 * Geometry is drawn in a frame centred on the rectangle and rotated by `angle`.
 * Within that frame every pattern covers the square [-R, R]^2 with
 * R = half the rectangle diagonal, so the (rotated) rectangle is always covered.
 */

export const PATTERN_IDS = [
  'stripes',
  'dots',
  'speedlines',
  'hex',
  'checker',
  'chevron',
  'carbon',
  'halftone',
  'zigzag',
  'grid',
  'rays',
  'scales',
  'camo',
  'lightning',
  'stars',
  'shards',
  'circuit',
  'flames',
] as const
export type PatternId = (typeof PATTERN_IDS)[number]

/** Keeps loops bounded for degenerate parameters. */
const MAX_TILES_PER_AXIS = 360

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cells per period of the scattered patterns below: content repeats every CELLS tiles. */
const CELLS = 6

/**
 * PRNG for lattice cell (i, j). Wraps the indices every CELLS cells, so painters
 * built on it are periodic with CELLS * s and can be drawn as a tiled CanvasPattern.
 */
function cellRng(i: number, j: number, seed: number): () => number {
  const wi = ((i % CELLS) + CELLS) % CELLS
  const wj = ((j % CELLS) + CELLS) % CELLS
  return rng(seed + wi * 7919 + wj * 104729)
}

interface Frame {
  /** Half extent of the square that must be covered. */
  R: number
  /** Effective tile size (mm). */
  s: number
  color: string
  color2: string
}

type Painter = (ctx: Canvas2D, f: Frame) => void

const TAU = Math.PI * 2

// ---------- painters ----------

const stripes: Painter = (ctx, f) => {
  const { R, s } = f
  // diagonal: extra 45 degrees on top of the user angle
  ctx.rotate(-Math.PI / 4)
  const period = s
  const n = Math.ceil(R / period) + 1
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let i = -n; i <= n; i++) ctx.rect(i * period, -R * 1.5, period * 0.5, R * 3)
  ctx.fill()
}

const dots: Painter = (ctx, f) => {
  const { R, s } = f
  const n = Math.ceil(R / s) + 1
  const r = s * 0.28
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = i * s
      const y = j * s
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, TAU)
    }
  }
  ctx.fill()
}

const speedlines: Painter = (ctx, f) => {
  const { R, s } = f
  const rand = rng(0x5eed1 + Math.round(s * 100))
  ctx.fillStyle = f.color
  ctx.beginPath()
  // Parallel manga speed lines running along the frame x axis, tapered at both ends.
  let y = -R
  while (y < R) {
    const thick = s * (0.04 + rand() * 0.34)
    const len = R * 2 * (0.35 + rand() * 0.65)
    const x0 = -R + rand() * (R * 2 - len)
    const x1 = x0 + len
    const cx = x0 + len * (0.25 + rand() * 0.5)
    ctx.moveTo(x0, y)
    ctx.quadraticCurveTo(cx, y - thick, x1, y)
    ctx.quadraticCurveTo(cx, y + thick, x0, y)
    ctx.closePath()
    y += s * (0.35 + rand() * 0.45)
  }
  ctx.fill()
}

const hex: Painter = (ctx, f) => {
  const { R } = f
  const s = Math.max(f.s, R / 60)
  const rr = s / Math.sqrt(3) // circumradius for flat-to-flat width s
  const dy = rr * 1.5
  const rows = Math.min(MAX_TILES_PER_AXIS, Math.ceil(R / dy) + 2)
  const cols = Math.ceil(R / s) + 2
  ctx.strokeStyle = f.color
  ctx.lineWidth = Math.max(0.05, s * 0.09)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let j = -rows; j <= rows; j++) {
    const off = (j & 1) * (s / 2)
    for (let i = -cols; i <= cols; i++) {
      const cx = i * s + off
      const cy = j * dy
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
  }
  ctx.stroke()
}

const checker: Painter = (ctx, f) => {
  const { R, s } = f
  const n = Math.ceil(R / s) + 1
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      if (((i + j) & 1) === 0) ctx.rect(i * s, j * s, s, s)
    }
  }
  ctx.fill()
}

const chevron: Painter = (ctx, f) => {
  const { R, s } = f
  const k = 0.7 // slope of the V arms
  const t = s * 0.5 // band thickness
  const reach = k * R
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let yy = -R - reach - s; yy < R + s; yy += s) {
    ctx.moveTo(-R, yy + reach)
    ctx.lineTo(0, yy)
    ctx.lineTo(R, yy + reach)
    ctx.lineTo(R, yy + reach + t)
    ctx.lineTo(0, yy + t)
    ctx.lineTo(-R, yy + reach + t)
    ctx.closePath()
  }
  ctx.fill()
}

const carbon: Painter = (ctx, f) => {
  const { R } = f
  const c = f.s / 2 // cell size
  const n = Math.ceil(R / c) + 1
  const gap = c * 0.06
  const solid = new Array<[number, number, number, number]>()
  const shade = new Array<[number, number, number, number]>()
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = i * c + gap
      const y = j * c + gap
      const w = c - gap * 2
      if (((i + j) & 1) === 0) {
        // horizontal strand: lit top half, darker bottom half
        solid.push([x, y, w, w / 2])
        shade.push([x, y + w / 2, w, w / 2])
      } else {
        // vertical strand: lit left half, darker right half
        solid.push([x, y, w / 2, w])
        shade.push([x + w / 2, y, w / 2, w])
      }
    }
  }
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (const r of solid) ctx.rect(r[0], r[1], r[2], r[3])
  ctx.fill()
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  for (const r of shade) ctx.rect(r[0], r[1], r[2], r[3])
  ctx.fill()
}

const halftone: Painter = (ctx, f) => {
  const { R } = f
  const s = Math.max(f.s, R / 80) // not tileable (dot size varies): keep the dot count bounded
  const n = Math.ceil(R / s) + 1
  const maxR = s * 0.52
  ctx.fillStyle = f.color
  // Dot radius grows from left to right across the (rotated) frame.
  for (let i = -n; i <= n; i++) {
    const x = i * s
    const t = Math.min(1, Math.max(0, (x + R) / (2 * R)))
    const r = maxR * t
    if (r < 0.03) continue
    ctx.beginPath()
    for (let j = -n; j <= n; j++) {
      const y = j * s + (i & 1 ? s / 2 : 0)
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, TAU)
    }
    ctx.fill()
  }
}

const zigzag: Painter = (ctx, f) => {
  const { R, s } = f
  const amp = s * 0.35
  const rows = Math.ceil(R / s) + 1
  const steps = Math.ceil(R / (s / 2)) + 2
  ctx.strokeStyle = f.color
  ctx.lineWidth = Math.max(0.05, s * 0.16)
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  ctx.beginPath()
  for (let j = -rows; j <= rows; j++) {
    const y = j * s
    for (let i = -steps; i <= steps; i++) {
      const x = i * (s / 2)
      const yy = y + (i & 1 ? amp : -amp)
      if (i === -steps) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
  }
  ctx.stroke()
}

const grid: Painter = (ctx, f) => {
  const { R, s } = f
  const n = Math.ceil(R / s) + 1
  ctx.strokeStyle = f.color
  ctx.lineWidth = Math.max(0.05, s * 0.09)
  ctx.beginPath()
  for (let i = -n; i <= n; i++) {
    ctx.moveTo(i * s, -R * 1.2)
    ctx.lineTo(i * s, R * 1.2)
    ctx.moveTo(-R * 1.2, i * s)
    ctx.lineTo(R * 1.2, i * s)
  }
  ctx.stroke()
}

const rays: Painter = (ctx, f) => {
  const { R, s } = f
  // Ray count follows the tile size; always even so the colours alternate cleanly.
  let n = Math.round((TAU * (R / 2)) / (s * 2)) * 2
  n = Math.min(360, Math.max(8, n))
  const step = TAU / n
  const len = R * 1.5
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let i = 0; i < n; i += 2) {
    const a0 = i * step
    const a1 = a0 + step
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a0) * len, Math.sin(a0) * len)
    ctx.lineTo(Math.cos(a1) * len, Math.sin(a1) * len)
    ctx.closePath()
  }
  ctx.fill()
}

const scales: Painter = (ctx, f) => {
  const { R } = f
  const s = Math.max(f.s, R / 40) // each scale costs several path ops: keep the count sane
  const r = s / 2
  const rows = Math.min(MAX_TILES_PER_AXIS, Math.ceil(R / r) + 3)
  const cols = Math.ceil(R / s) + 2
  ctx.fillStyle = f.color2
  ctx.strokeStyle = f.color
  ctx.lineWidth = Math.max(0.05, s * 0.07)
  ctx.lineJoin = 'round'
  // Top to bottom: lower rows overlap the pointed tips of the rows above.
  for (let j = -rows; j <= rows; j++) {
    const off = (j & 1) * r
    const cy = j * r
    for (let i = -cols; i <= cols; i++) {
      const cx = i * s + off
      ctx.beginPath()
      ctx.moveTo(cx - r, cy)
      ctx.arc(cx, cy, r, Math.PI, 0)
      ctx.quadraticCurveTo(cx + r, cy + r * 0.9, cx, cy + r * 1.5)
      ctx.quadraticCurveTo(cx - r, cy + r * 0.9, cx - r, cy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      // inner scale line
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.5, cy + r * 0.1)
      ctx.arc(cx, cy + r * 0.1, r * 0.5, Math.PI, 0)
      ctx.stroke()
    }
  }
}

// The scattered patterns below draw one motif per lattice cell from cellRng(),
// so they repeat every CELLS cells and are tiled like the regular lattices.

/** Tile size floor for the scattered patterns: bounds the cell count when drawn directly. */
const scatterTile = (s: number, R: number) => Math.max(s, R / 60)

/** Multiplies the current alpha (keeps the layer opacity set by the caller). */
function withAlpha(ctx: Canvas2D, base: number, a: number) {
  ctx.globalAlpha = base * a
}

/** Smooth closed blob through k jittered points (quadratic curves through the edge midpoints). */
function blob(ctx: Canvas2D, cx: number, cy: number, rx: number, ry: number, rot: number, rand: () => number) {
  const k = 9
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  const pts: [number, number][] = []
  for (let i = 0; i < k; i++) {
    const a = (i / k) * TAU
    const f = 0.55 + rand() * 0.7
    const x = Math.cos(a) * rx * f
    const y = Math.sin(a) * ry * f
    pts.push([cx + x * cs - y * sn, cy + x * sn + y * cs])
  }
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const
  const m0 = mid(pts[k - 1], pts[0])
  ctx.moveTo(m0[0], m0[1])
  for (let i = 0; i < k; i++) {
    const m = mid(pts[i], pts[(i + 1) % k])
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1])
  }
  ctx.closePath()
}

const camo: Painter = (ctx, f) => {
  const { R } = f
  const s = Math.max(f.s, R / 30) // up to eight blobs per cell: fewer, larger cells
  const n = Math.ceil(R / s) + 2
  const base = ctx.globalAlpha
  ctx.fillStyle = f.color
  // Three tones (alpha steps of the pattern colour); every spot is a cluster of
  // overlapping blobs, which gives the irregular woodland silhouettes.
  const passes = [
    [0.4, 0xca40, 0.35, 0.5, 3],
    [0.72, 0xca41, 0.45, 0.42, 3],
    [1, 0xca42, 0.6, 0.32, 2],
  ] as const
  for (const [alpha, seed, skip, size, parts] of passes) {
    withAlpha(ctx, base, alpha)
    ctx.beginPath()
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const rand = cellRng(i, j, seed)
        if (rand() < skip) continue
        let cx = (i + rand()) * s
        let cy = (j + rand()) * s
        const rot = (rand() - 0.5) * 0.8
        for (let p = 0; p < parts; p++) {
          const r = s * size * (0.7 + rand() * 0.6)
          blob(ctx, cx, cy, r * 1.5, r * 0.85, rot + (rand() - 0.5) * 0.6, rand)
          cx += (rand() - 0.3) * s * 0.7
          cy += (rand() - 0.5) * s * 0.45
        }
      }
    }
    ctx.fill()
  }
  ctx.globalAlpha = base
}

/** Lightning bolt outline, height 1, centred on the origin. */
const BOLT: [number, number][] = [
  [-0.06, -0.5],
  [0.27, -0.5],
  [0.07, -0.1],
  [0.29, -0.1],
  [-0.17, 0.5],
  [-0.02, 0.05],
  [-0.24, 0.05],
]

const lightning: Painter = (ctx, f) => {
  const { R } = f
  const s = scatterTile(f.s, R)
  const n = Math.ceil(R / s) + 2
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const rand = cellRng(i, j, 0xb017)
      const size = s * (0.55 + rand() * 0.35)
      const a = 0.3 + (rand() - 0.5) * 0.9 // mostly leaning forward
      const cx = (i + 0.5 + (j & 1) * 0.5 + (rand() - 0.5) * 0.25) * s
      const cy = (j + 0.5 + (rand() - 0.5) * 0.25) * s
      const cs = Math.cos(a)
      const sn = Math.sin(a)
      BOLT.forEach(([bx, by], k) => {
        const x = cx + (bx * cs - by * sn) * size
        const y = cy + (bx * sn + by * cs) * size
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
  }
  ctx.fill()
}

const stars: Painter = (ctx, f) => {
  const { R } = f
  const s = scatterTile(f.s, R)
  const n = Math.ceil(R / s) + 2
  const dot = (x: number, y: number, r: number) => {
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, TAU)
  }
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const rand = cellRng(i, j, 0x57a2)
      const cx = (i + 0.2 + rand() * 0.6) * s
      const cy = (j + 0.2 + rand() * 0.6) * s
      const kind = rand()
      if (kind < 0.55) {
        // five-pointed star
        const ro = s * (0.14 + rand() * 0.2)
        const rot = rand() * TAU
        for (let k = 0; k < 10; k++) {
          const a = rot + (k / 10) * TAU
          const r = k & 1 ? ro * 0.42 : ro
          if (k === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
          else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        }
        ctx.closePath()
      } else if (kind < 0.85) {
        // four-pointed sparkle with concave sides
        const r = s * (0.12 + rand() * 0.16)
        ctx.moveTo(cx, cy - r)
        ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 0.12, cx + r, cy)
        ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.12, cx, cy + r)
        ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.12, cx - r, cy)
        ctx.quadraticCurveTo(cx - r * 0.12, cy - r * 0.12, cx, cy - r)
        ctx.closePath()
      } else {
        dot(cx, cy, s * 0.06)
      }
      if (rand() < 0.5) dot((i + rand()) * s, (j + rand()) * s, s * 0.035)
    }
  }
  ctx.fill()
}

/** Low-poly shards: a jittered triangle lattice, triangles shaded in four alpha steps. */
const shards: Painter = (ctx, f) => {
  const { R } = f
  const s = scatterTile(f.s, R)
  const n = Math.ceil(R / s) + 2
  const vertex = (i: number, j: number): [number, number] => {
    const r = cellRng(i, j, 0x5a4d)
    return [(i + (r() - 0.5) * 0.5) * s, (j + (r() - 0.5) * 0.5) * s]
  }
  const LEVELS = [0.18, 0.4, 0.7, 1]
  const buckets: [number, number][][][] = LEVELS.map(() => [])
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      const a = vertex(i, j)
      const b = vertex(i + 1, j)
      const c = vertex(i + 1, j + 1)
      const d = vertex(i, j + 1)
      const rand = cellRng(i, j, 0x5a4e)
      const tris = rand() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]
      for (const tri of tris) {
        const v = rand()
        if (v < 0.3) continue // leave some background showing
        buckets[Math.min(LEVELS.length - 1, Math.floor(((v - 0.3) / 0.7) * LEVELS.length))].push(tri)
      }
    }
  }
  const base = ctx.globalAlpha
  ctx.fillStyle = f.color
  LEVELS.forEach((level, k) => {
    if (!buckets[k].length) return
    withAlpha(ctx, base, level)
    ctx.beginPath()
    for (const [p, q, r] of buckets[k]) {
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(q[0], q[1])
      ctx.lineTo(r[0], r[1])
      ctx.closePath()
    }
    ctx.fill()
  })
  ctx.globalAlpha = base
}

/** Circuit board: traces between lattice nodes (straight or 45 degrees) plus round vias. */
const circuit: Painter = (ctx, f) => {
  const { R } = f
  const s = scatterTile(f.s, R)
  const n = Math.ceil(R / s) + 2
  const vias: [number, number][] = []
  ctx.strokeStyle = f.color
  ctx.lineWidth = Math.max(0.05, s * 0.1)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const rand = cellRng(i, j, 0xc1c0)
      const x = i * s
      const y = j * s
      const r = rand()
      if (r < 0.36) {
        ctx.moveTo(x, y)
        ctx.lineTo(x + s, y)
      } else if (r < 0.56) {
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + s)
      } else if (r < 0.76) {
        // straight, then a 45 degree jog to the row below or above
        const dy = r < 0.66 ? s : -s
        ctx.moveTo(x, y)
        ctx.lineTo(x + s * 0.5, y)
        ctx.lineTo(x + s, y + dy * 0.5)
        ctx.lineTo(x + s, y + dy)
      }
      if (rand() < 0.25) vias.push([x, y])
    }
  }
  ctx.stroke()
  const pad = s * 0.17
  ctx.fillStyle = f.color
  ctx.beginPath()
  for (const [x, y] of vias) {
    ctx.moveTo(x + pad, y)
    ctx.arc(x, y, pad, 0, TAU)
  }
  ctx.fill()
  ctx.fillStyle = f.color2
  ctx.beginPath()
  for (const [x, y] of vias) {
    ctx.moveTo(x + pad * 0.45, y)
    ctx.arc(x, y, pad * 0.45, 0, TAU)
  }
  ctx.fill()
}

/** Flame spacing relative to the tile size: [tongue spacing, band height]. */
const FLAME_W = 1
const FLAME_ROW = 1.2

/**
 * Stacked bands whose top edge is a row of flame tongues, alternating between the
 * pattern and the background colour, so every band shows flames licking upwards.
 */
const flames: Painter = (ctx, f) => {
  const { R } = f
  const s = Math.max(f.s, R / 40) // a few curves per tongue: keep the count sane
  const w = s * FLAME_W
  const rh = s * FLAME_ROW
  const rows = Math.ceil(R / rh) + 3
  const cols = Math.ceil(R / w) + 2
  const left = -cols * w - w / 2
  const right = cols * w + w / 2
  // Top to bottom: each band covers the lower part of the one above.
  for (let j = -rows; j <= rows; j++) {
    const y = j * rh
    const off = (j & 1) * (w / 2)
    ctx.fillStyle = j & 1 ? f.color2 : f.color
    ctx.beginPath()
    ctx.moveTo(left + off, y + rh * 2)
    ctx.lineTo(left + off, y)
    for (let i = -cols; i <= cols; i++) {
      const rand = cellRng(i, j, 0xf1a3)
      const h = rh * (0.75 + rand() * 0.5)
      const lean = w * (0.15 + rand() * 0.3)
      const x = i * w + off
      // up the left flank to the tip, down the hollow right flank to the next valley
      ctx.bezierCurveTo(x - w * 0.6, y - h * 0.4, x + lean - w * 0.45, y - h * 0.75, x + lean, y - h)
      ctx.bezierCurveTo(x + lean - w * 0.05, y - h * 0.5, x + w * 0.15, y - h * 0.2, x + w / 2, y)
    }
    ctx.lineTo(right + off, y + rh * 2)
    ctx.closePath()
    ctx.fill()
  }
}

const PAINTERS: Record<PatternId, Painter> = {
  stripes,
  dots,
  speedlines,
  hex,
  checker,
  chevron,
  carbon,
  halftone,
  zigzag,
  grid,
  rays,
  scales,
  camo,
  lightning,
  stars,
  shards,
  circuit,
  flames,
}

/**
 * Repeat period (mm) of the tileable patterns for an effective tile size `s`.
 * The painters put a lattice point at the frame origin, so one period starting
 * at (0,0) is exactly one tile. Non-periodic patterns are drawn directly.
 */
const PERIOD: Partial<Record<PatternId, (s: number) => [number, number]>> = {
  dots: (s) => [s, s],
  hex: (s) => [s, Math.sqrt(3) * s],
  checker: (s) => [2 * s, 2 * s],
  carbon: (s) => [s, s],
  zigzag: (s) => [s, s],
  grid: (s) => [s, s],
  scales: (s) => [s, s],
  camo: (s) => [CELLS * s, CELLS * s],
  lightning: (s) => [CELLS * s, CELLS * s],
  stars: (s) => [CELLS * s, CELLS * s],
  shards: (s) => [CELLS * s, CELLS * s],
  circuit: (s) => [CELLS * s, CELLS * s],
  flames: (s) => [CELLS * FLAME_W * s, CELLS * FLAME_ROW * s],
}

const SCATTERED: ReadonlySet<PatternId> = new Set(['camo', 'lightning', 'stars', 'shards', 'circuit', 'flames'])

/** Painter-specific minimum tile sizes that depend on the full frame size. */
function effectiveTile(id: PatternId, s: number, R: number): number {
  if (id === 'hex') return Math.max(s, R / 60)
  if (id === 'scales' || id === 'flames') return Math.max(s, R / 40)
  if (id === 'camo') return Math.max(s, R / 30)
  if (SCATTERED.has(id)) return scatterTile(s, R)
  return s
}

const MAX_TILE_PX = 2048

/**
 * Paints one period into a small canvas and fills the frame with it as a
 * CanvasPattern. Cost no longer depends on how many tiles fit into the label,
 * which keeps the editor responsive for fine patterns (hex at 0.5 mm was >1 s
 * per frame when drawn as one path). Returns false when not supported (tests).
 */
function drawTiled(ctx: Canvas2D, painter: Painter, f: Frame, tw: number, th: number): boolean {
  if (typeof OffscreenCanvas === 'undefined' || typeof ctx.getTransform !== 'function' || typeof ctx.createPattern !== 'function') {
    return false
  }
  const m = ctx.getTransform()
  const pxPerMm = Math.hypot(m.a, m.b)
  if (!(pxPerMm > 0)) return false
  const W = Math.max(1, Math.min(MAX_TILE_PX, Math.round(tw * pxPerMm)))
  const H = Math.max(1, Math.min(MAX_TILE_PX, Math.round(th * pxPerMm)))
  const tile = new OffscreenCanvas(W, H)
  const t = tile.getContext('2d')
  if (!t) return false
  t.scale(W / tw, H / th)
  // A small frame around the origin covers the tile plus its neighbours, so
  // shapes crossing the tile border wrap seamlessly.
  painter(t, { ...f, R: Math.max(tw, th) * 2 })
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return false
  pattern.setTransform(new DOMMatrix().scale(tw / W, th / H))
  ctx.fillStyle = pattern
  ctx.fillRect(-f.R, -f.R, f.R * 2, f.R * 2)
  return true
}

/**
 * Draws pattern `id` into the rectangle (0,0,w,h) (units: mm, ctx already scaled).
 * `color` = pattern colour, `color2` = background colour (already filled by the
 * caller), `scale` = tile size in mm (about 1-20), `angle` in degrees around the
 * rectangle centre.
 */
export function drawPattern(
  ctx: Canvas2D,
  id: PatternId,
  w: number,
  h: number,
  color: string,
  color2: string,
  scale: number,
  angle: number,
): void {
  const painter = PAINTERS[id]
  if (!painter || !(w > 0) || !(h > 0)) return
  const R = Math.hypot(w, h) / 2
  // clamp the tile size and keep the tile count bounded
  let s = Number.isFinite(scale) ? Math.max(0.3, Math.min(60, scale)) : 6
  s = Math.max(s, (R * 2) / MAX_TILES_PER_AXIS)
  const deg = Number.isFinite(angle) ? angle : 0

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.translate(w / 2, h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  const frame = { R, s, color, color2 }
  const period = PERIOD[id]
  const tiled = period ? drawTiled(ctx, painter, { ...frame, s: effectiveTile(id, s, R) }, ...period(effectiveTile(id, s, R))) : false
  if (!tiled) painter(ctx, frame)
  ctx.restore()
}
