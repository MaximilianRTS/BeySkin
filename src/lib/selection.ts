/**
 * Pure geometry for multi-selection: bounding boxes, marquee tests, align /
 * distribute offsets, snapping and group transforms. All values in mm.
 */

export interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}
type Pt = { x: number; y: number }
export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeMode = 'centers' | 'gaps'

/** Axis-aligned bounds of a w×h box centred at (x, y) and rotated by `rotation` degrees. */
export function boundsOf(l: { x: number; y: number; rotation: number }, size: { w: number; h: number }): Box {
  const a = (l.rotation * Math.PI) / 180
  const hw = (Math.abs(size.w * Math.cos(a)) + Math.abs(size.h * Math.sin(a))) / 2
  const hh = (Math.abs(size.w * Math.sin(a)) + Math.abs(size.h * Math.cos(a))) / 2
  return { x1: l.x - hw, y1: l.y - hh, x2: l.x + hw, y2: l.y + hh }
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  return {
    x1: Math.min(...boxes.map((b) => b.x1)),
    y1: Math.min(...boxes.map((b) => b.y1)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
  }
}

/** Overlap test; touching edges count (a marquee only has to reach a layer). */
export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2
}

/** Box spanned by two corner points in any order (marquee). */
export function rectFromPoints(a: Pt, b: Pt): Box {
  return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }
}

export function boxCenter(b: Box): Pt {
  return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }
}

/** Shift that moves `box` flush with an edge (or the centre) of `target`. */
export function alignOffset(box: Box, target: Box, where: AlignEdge): { dx: number; dy: number } {
  const c = boxCenter(box)
  const tc = boxCenter(target)
  switch (where) {
    case 'left':
      return { dx: target.x1 - box.x1, dy: 0 }
    case 'hcenter':
      return { dx: tc.x - c.x, dy: 0 }
    case 'right':
      return { dx: target.x2 - box.x2, dy: 0 }
    case 'top':
      return { dx: 0, dy: target.y1 - box.y1 }
    case 'vcenter':
      return { dx: 0, dy: tc.y - c.y }
    case 'bottom':
      return { dx: 0, dy: target.y2 - box.y2 }
  }
}

/**
 * Shifts along one axis (per input box, same order) that spread the boxes evenly.
 * 'centers': equal distance between centres, the outermost centres stay.
 * 'gaps': equal space between neighbours, the outer edges of the group stay.
 */
export function distributeOffsets(boxes: Box[], axis: 'x' | 'y', mode: DistributeMode): number[] {
  const out = boxes.map(() => 0)
  if (boxes.length < 3) return out
  const lo = (b: Box) => (axis === 'x' ? b.x1 : b.y1)
  const hi = (b: Box) => (axis === 'x' ? b.x2 : b.y2)
  const mid = (b: Box) => (lo(b) + hi(b)) / 2
  const order = boxes.map((_, i) => i).sort((a, b) => mid(boxes[a]) - mid(boxes[b]))
  if (mode === 'centers') {
    const first = mid(boxes[order[0]])
    const step = (mid(boxes[order[order.length - 1]]) - first) / (order.length - 1)
    order.forEach((i, k) => (out[i] = first + k * step - mid(boxes[i])))
  } else {
    const start = Math.min(...boxes.map(lo))
    const span = Math.max(...boxes.map(hi)) - start
    const total = boxes.reduce((s, b) => s + hi(b) - lo(b), 0)
    const gap = (span - total) / (boxes.length - 1)
    let pos = start
    for (const i of order) {
      out[i] = pos - lo(boxes[i])
      pos += hi(boxes[i]) - lo(boxes[i]) + gap
    }
  }
  return out
}

/** Snap lines of a box along one axis: start edge, centre, end edge. */
export function boxLines(b: Box, axis: 'x' | 'y'): number[] {
  return axis === 'x' ? [b.x1, (b.x1 + b.x2) / 2, b.x2] : [b.y1, (b.y1 + b.y2) / 2, b.y2]
}

/**
 * Smallest shift (at most `threshold`) that puts one of the moving `lines` onto a
 * target line. Returns the shift plus every target it lands on (for the guides).
 */
export function snapAxis(lines: number[], targets: number[], threshold: number): { shift: number; guides: number[] } {
  let best: number | null = null
  for (const l of lines)
    for (const t of targets) {
      const d = t - l
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
  if (best === null) return { shift: 0, guides: [] }
  const shift = best
  const guides = [...new Set(targets.filter((t) => lines.some((l) => Math.abs(l + shift - t) < 1e-6)))]
  return { shift, guides }
}

/** Point `p` scaled by `f` and rotated by `deg` (clockwise, y down) around `c`. */
export function transformAround(p: Pt, c: Pt, f: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180
  const dx = (p.x - c.x) * f
  const dy = (p.y - c.y) * f
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) }
}

/** Angle in [-180, 180). */
export function normalizeAngle(deg: number): number {
  return (((deg % 360) + 540) % 360) - 180
}

/** A group needs at least two members: clears ids that only one layer still carries. */
export function cleanGroups(layers: Array<{ groupId?: string | null }>): boolean {
  const count = new Map<string, number>()
  for (const l of layers) if (l.groupId) count.set(l.groupId, (count.get(l.groupId) ?? 0) + 1)
  let changed = false
  for (const l of layers) {
    if (l.groupId && count.get(l.groupId)! < 2) {
      l.groupId = null
      changed = true
    }
  }
  return changed
}
