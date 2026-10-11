import { BATTLE_PASS_OUTLINE } from './battlepassOutline'
import type { Point, StickerTemplate } from './types'

export type { Point, StickerTemplate, TemplateCategory, PreviewModel } from './types'

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

export const TEMPLATES: StickerTemplate[] = [
  {
    id: 'battlepass',
    i18nKey: 'battlepass',
    category: 'battlepass',
    widthMm: 111.55,
    heightMm: 25.64,
    outline: BATTLE_PASS_OUTLINE,
    measured: true,
    previewModel: 'battlepass',
  },
  {
    // Gear Chip sticker on top of a Bey, print size 17.1 mm (measured by the user).
    id: 'gear_chip',
    i18nKey: 'gear_chip',
    category: 'bey',
    widthMm: 17.1,
    heightMm: 17.1,
    outline: ellipse(17.1, 17.1, 128),
    measured: true,
    previewModel: 'chip',
  },
]

export const DEFAULT_TEMPLATE_ID = 'battlepass'

export function getTemplate(id: string): StickerTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}
