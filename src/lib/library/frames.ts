/**
 * Frames for round Gear Chip stickers. The geometry lives in chipFrames.ts as
 * vector paths (traced from the original templates), so frames stay sharp at any
 * zoom and every part can be recoloured. Layers only store the frame id, so
 * frames also work in share links and project files.
 *
 * Templates by Blader R (Reddit u/Dull-Tough-5511), used with credit.
 */
import { CHIP_FRAMES, getChipFrame, type ChipFrameDef } from './chipFrames'

export type FrameDef = ChipFrameDef
export const FRAMES: FrameDef[] = CHIP_FRAMES
export const getFrame = getChipFrame

export const FRAME_CREDIT = {
  author: 'Blader R',
  handle: 'u/Dull-Tough-5511',
  url: 'https://www.reddit.com/user/Dull-Tough-5511/',
} as const

/** Paint order: band below the ring, white accents on top. */
export const FRAME_PARTS = ['band', 'center', 'ring', 'accent'] as const
export type FramePart = (typeof FRAME_PARTS)[number]

const paths = new Map<string, Path2D>()
export function framePath(def: FrameDef, part: FramePart): Path2D {
  const key = `${def.id}:${part}`
  let p = paths.get(key)
  if (!p) {
    p = new Path2D(def[part])
    paths.set(key, p)
  }
  return p
}

export interface BandArc {
  /** Centre angle of the band in radians (canvas coordinates, y down). */
  center: number
  /** Angular extent in radians. */
  span: number
  rInner: number
  rOuter: number
}

const arcs = new Map<string, BandArc>()

/**
 * Where the colour band sits on the circle – used to set text along it. Samples
 * the band path around the circle and takes the longest continuous run.
 */
export function bandArc(def: FrameDef): BandArc {
  let arc = arcs.get(def.id)
  if (arc) return arc
  const ctx = new OffscreenCanvas(1, 1).getContext('2d')!
  const path = framePath(def, 'band')
  const inside = (a: number, r: number) => ctx.isPointInPath(path, 50 + r * Math.cos(a), 50 + r * Math.sin(a), 'evenodd')
  // Probe radius: middle of the outer ring zone where the band lives.
  const BINS = 720
  const hits = Array.from({ length: BINS }, (_, i) => inside((i / BINS) * Math.PI * 2, 45))
  let bestStart = 0
  let bestLen = 0
  for (let i = 0; i < BINS; i++) {
    if (!hits[i] || hits[(i - 1 + BINS) % BINS]) continue // only start at the beginning of a run
    let len = 0
    while (len < BINS && hits[(i + len) % BINS]) len++
    if (len > bestLen) {
      bestLen = len
      bestStart = i
    }
  }
  if (!bestLen && hits.every(Boolean)) bestLen = BINS
  const span = (bestLen / BINS) * Math.PI * 2
  const center = ((bestStart + bestLen / 2) / BINS) * Math.PI * 2
  // Radial extent of the band at its centre angle.
  let rInner = 45
  while (rInner > 25 && inside(center, rInner - 0.25)) rInner -= 0.25
  let rOuter = 45
  while (rOuter < 50 && inside(center, rOuter + 0.25)) rOuter += 0.25
  arc = { center, span, rInner, rOuter }
  arcs.set(def.id, arc)
  return arc
}
