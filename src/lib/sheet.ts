/**
 * Print sheet layout: packs sticker bounding boxes (plus bleed) onto pages
 * using first-fit shelf packing. Pure functions – unit tested.
 */

export const PAPER_SIZES = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const
export type PaperSize = keyof typeof PAPER_SIZES

export interface SheetItem<T = unknown> {
  key: T
  w: number
  h: number
}

export interface Placement<T = unknown> {
  key: T
  page: number
  x: number
  y: number
}

export interface SheetLayout<T = unknown> {
  orientation: 'portrait' | 'landscape'
  pageW: number
  pageH: number
  pages: number
  placements: Placement<T>[]
  /** Items that are larger than the printable area. */
  oversized: T[]
}

export interface PackOptions {
  marginMm: number
  gapMm: number
  /** Space reserved at the bottom of every page (footer). */
  footerMm: number
  /** Space reserved at the top of the first page (calibration ruler). */
  headerMm: number
}

/**
 * First-fit decreasing height: items are sorted by height and each one goes into
 * the first shelf (on any page) that still has room, so small stickers fill the
 * gaps next to large labels instead of opening new rows.
 */
function pack<T>(items: SheetItem<T>[], pageW: number, pageH: number, o: PackOptions): Omit<SheetLayout<T>, 'orientation'> {
  interface Shelf {
    page: number
    y: number
    h: number
    x: number
  }
  const placements: Placement<T>[] = []
  const oversized: T[] = []
  const right = pageW - o.marginMm
  const bottom = pageH - o.marginMm - o.footerMm
  const top = (page: number) => o.marginMm + (page === 0 ? o.headerMm : 0)
  const shelves: Shelf[] = []
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w)

  for (const it of sorted) {
    if (it.w > right - o.marginMm + 1e-6 || it.h > bottom - top(1) + 1e-6) {
      oversized.push(it.key)
      continue
    }
    let shelf = shelves.find((sh) => it.h <= sh.h + 1e-6 && sh.x + it.w <= right + 1e-6)
    if (!shelf) {
      const last = shelves.at(-1)
      let page = last?.page ?? 0
      let y = last ? last.y + last.h + o.gapMm : top(0)
      if (y + it.h > bottom + 1e-6) {
        page = last ? last.page + 1 : 0
        y = top(page)
      }
      shelf = { page, y, h: it.h, x: o.marginMm }
      shelves.push(shelf)
    }
    placements.push({ key: it.key, page: shelf.page, x: shelf.x, y: shelf.y })
    shelf.x += it.w + o.gapMm
  }
  const pages = placements.length ? Math.max(...placements.map((p) => p.page)) + 1 : 0
  return { pageW, pageH, pages, placements, oversized }
}

/** Packs in portrait and landscape and returns whichever needs fewer pages. */
export function layoutSheet<T>(items: SheetItem<T>[], paper: PaperSize, o: PackOptions): SheetLayout<T> {
  const { w, h } = PAPER_SIZES[paper]
  const portrait = { orientation: 'portrait' as const, ...pack(items, w, h, o) }
  const landscape = { orientation: 'landscape' as const, ...pack(items, h, w, o) }
  if (landscape.oversized.length < portrait.oversized.length) return landscape
  if (landscape.oversized.length > portrait.oversized.length) return portrait
  return landscape.pages < portrait.pages ? landscape : portrait
}
