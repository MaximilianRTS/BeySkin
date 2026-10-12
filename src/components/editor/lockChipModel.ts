import * as THREE from 'three'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { LOCK_CHIP_BODY_R as BODY_R, lockChipOutline } from '@/templates/lockChip'

/**
 * Procedural Lock Chip (1 unit = 1 mm, sticker seat at y = 0, part hangs below).
 * Measured on the real part: 21.68 mm across (tab tip to the opposite edge),
 * 12.48 mm tall, 8.89 mm bore in the peg. Everything else is eyeballed from photos.
 */
const HEIGHT = 12.48
const BORE_R = 8.89 / 2

/** Floor of the sticker recess (the sticker itself is drawn just above y = 0). */
const FLANGE_TOP = -0.05
/** The round centre around the sticker stands a little proud of the tabs … */
const CENTRE_TOP = 0.55
const TAB_TOP = CENTRE_TOP - 0.2
/** … and the tabs slope gently down towards their tips. */
const TAB_DROOP_DEG = 9
const FLANGE = 2.2
const SKIRT = 1.3
const PEG_TOP = FLANGE_TOP - FLANGE - SKIRT
const PEG_BOTTOM = FLANGE_TOP + 0.3 - HEIGHT
const PEG_R = 6.4
const GROOVES = 8
const LUG = { w: 3.2, h: 1.6, out: 1.0 }

/** Head outline with the sticker recess; shape y becomes world z (towards the sticker's bottom edge). */
function headShape(stickerD: number): THREE.Shape {
  const shape = new THREE.Shape(lockChipOutline().map(([x, y]) => new THREE.Vector2(x, y)))
  shape.holes.push(circlePath(stickerD / 2 + 0.05))
  return shape
}

function circlePath(r: number): THREE.Path {
  const p = new THREE.Path()
  p.absarc(0, 0, r, 0, Math.PI * 2, true)
  return p
}

/** Extrudes a shape downwards from y = top (shape y becomes world z). */
function extrudeDown(shape: THREE.Shape, depth: number, top: number, bevel = 0): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 48,
  })
  geo.rotateX(Math.PI / 2)
  geo.translate(0, top - bevel, 0)
  return geo
}

/** Bends everything outside the round body downwards, so the tabs droop. */
function droopTabs(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const fine = new TessellateModifier(0.6, 8).modify(geo)
  const pos = fine.attributes.position
  const start = BODY_R - 0.3
  const slope = Math.tan((TAB_DROOP_DEG * Math.PI) / 180)
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i))
    if (r > start) pos.setY(i, pos.getY(i) - (r - start) * slope)
  }
  fine.computeVertexNormals()
  return fine
}

/** Peg cross-section: round with vertical grooves, hollow bore. */
function pegShape(): THREE.Shape {
  const pts: THREE.Vector2[] = []
  const steps = 240
  const grooveHalf = 0.42 / PEG_R
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const k = (a / (Math.PI * 2)) * GROOVES
    const d = Math.abs(k - Math.round(k)) * ((Math.PI * 2) / GROOVES)
    const r = d < grooveHalf ? PEG_R - 0.55 : PEG_R
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r))
  }
  const shape = new THREE.Shape(pts)
  shape.holes.push(circlePath(BORE_R))
  return shape
}

/** Default plastic colour of the Lock Chip body. */
export const LOCK_CHIP_COLOR = '#141518'

/** The whole body shares one material; change its colour with `material.color.set(…)`. */
export function buildLockChip(stickerD: number, color = LOCK_CHIP_COLOR): { group: THREE.Group; material: THREE.MeshStandardMaterial } {
  const black = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.05, side: THREE.DoubleSide })
  const group = new THREE.Group()

  // Head: one piece with the tabs (sloping down, slots in the tips) around the sticker recess.
  group.add(new THREE.Mesh(droopTabs(extrudeDown(headShape(stickerD), TAB_TOP - FLANGE_TOP + FLANGE, TAB_TOP, 0.3)), black))

  // Floor of the recess the sticker sits on.
  const seat = new THREE.Shape()
  seat.absarc(0, 0, stickerD / 2 + 0.2, 0, Math.PI * 2, false)
  group.add(new THREE.Mesh(extrudeDown(seat, FLANGE, FLANGE_TOP), black))

  // Round centre ring, a step above the tabs.
  const centre = new THREE.Shape()
  centre.absarc(0, 0, BODY_R, 0, Math.PI * 2, false)
  centre.holes.push(circlePath(stickerD / 2 + 0.05))
  group.add(new THREE.Mesh(extrudeDown(centre, CENTRE_TOP - TAB_TOP + 0.4, CENTRE_TOP, 0.15), black))

  // Tapered skirt under the flange; its underside closes the top of the bore.
  const skirt = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, PEG_TOP),
      new THREE.Vector2(PEG_R + 0.6, PEG_TOP),
      new THREE.Vector2(BODY_R - 0.4, FLANGE_TOP - FLANGE + 0.01),
    ],
    96,
  )
  group.add(new THREE.Mesh(skirt, black))

  // Grooved, hollow peg with two lock lugs at the bottom.
  group.add(new THREE.Mesh(extrudeDown(pegShape(), PEG_TOP - PEG_BOTTOM, PEG_TOP), black))
  for (const side of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(LUG.out + 1.2, LUG.h, LUG.w), black)
    lug.position.set(side * (PEG_R + LUG.out / 2 - 0.6), PEG_BOTTOM + LUG.h / 2, 0)
    group.add(lug)
  }
  return { group, material: black }
}

/** Vertical extent (top, bottom) for camera framing. */
export const LOCK_CHIP_SPAN = { top: CENTRE_TOP, bottom: PEG_BOTTOM }
