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
}

/** Painter-specific minimum tile sizes that depend on the full frame size. */
function effectiveTile(id: PatternId, s: number, R: number): number {
  if (id === 'hex') return Math.max(s, R / 60)
  if (id === 'scales') return Math.max(s, R / 40)
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
