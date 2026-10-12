import type { Point } from './types'

/** Polygon for a rounded rectangle, corners approximated with `segments` points each. */
export function roundedRect(w: number, h: number, r: number, segments = 8): Point[] {
  const rr = Math.min(r, w / 2, h / 2)
  if (rr <= 0) return [[0, 0], [w, 0], [w, h], [0, h]]
  const corners: Array<[cx: number, cy: number, start: number]> = [
    [w - rr, rr, -Math.PI / 2],
    [w - rr, h - rr, 0],
    [rr, h - rr, Math.PI / 2],
    [rr, rr, Math.PI],
  ]
  const pts: Point[] = []
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = start + (i / segments) * (Math.PI / 2)
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
  }
  return pts
}

export function ellipse(w: number, h: number, segments = 96): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)])
  }
  return pts
}
