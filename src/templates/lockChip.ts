import type { Point } from './types'

/**
 * Lock Chip head geometry in mm, shared by the 3D model and the template picker icon.
 * Measured: 21.68 mm across (tab tip to the opposite edge). The proportions come from a
 * top-down photo: tip radius ≈ 1.29 × body radius, tabs ±26° wide at the body with a
 * flat, rounded tip of ±7.5°.
 */
export const LOCK_CHIP_ACROSS = 21.68
export const LOCK_CHIP_BODY_R = LOCK_CHIP_ACROSS / (1 + 1.29)
export const LOCK_CHIP_TAB_R = LOCK_CHIP_ACROSS - LOCK_CHIP_BODY_R
const TAB_BASE = (26 * Math.PI) / 180
const TAB_TIP = (7.5 * Math.PI) / 180
/** Tab directions; y points down like on the sticker, so 90° is the bottom. */
const TAB_ANGLES = [90, 210, 330].map((d) => (d * Math.PI) / 180)
/** Small slot cut into the middle of each tab tip. */
const NOTCH = { depth: 0.8, halfWidth: 0.3 }

/**
 * Round outline with three broad, flat-tipped tabs, centred on the origin.
 * The tip slots need a fine sampling (≤ 0.5°); leave them out for small icons.
 */
export function lockChipOutline(steps = 720, notches = true): Point[] {
  const notchHalf = NOTCH.halfWidth / LOCK_CHIP_TAB_R
  const pts: Point[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    let r = LOCK_CHIP_BODY_R
    for (const ta of TAB_ANGLES) {
      const d = Math.abs(Math.atan2(Math.sin(a - ta), Math.cos(a - ta)))
      if (d >= TAB_BASE) continue
      // Smoothstep ramp: rounded corners at the body and at the tip.
      const k = Math.min(1, (TAB_BASE - d) / (TAB_BASE - TAB_TIP))
      r = Math.max(r, LOCK_CHIP_BODY_R + (LOCK_CHIP_TAB_R - LOCK_CHIP_BODY_R) * k * k * (3 - 2 * k))
      if (notches && d < notchHalf) r -= NOTCH.depth
    }
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}
