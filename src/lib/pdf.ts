import type { Design } from './model'
import { renderDesignCanvas } from './render'
import { layoutSheet, PAPER_SIZES, type PaperSize } from './sheet'
import { getTemplate, VISIBLE_TEMPLATES, type Point, type StickerTemplate } from '@/templates'

export interface PrintOptions {
  paper: PaperSize
  dpi: 300 | 600
  /** 0 = clip exactly at the cut line. >0 extends the artwork beyond it. */
  bleedMm: number
  cutLine: boolean
  cropMarks: boolean
  calibration: boolean
  /** Printer scale correction (1 = 100 %). Measured value / expected value. */
  scaleX: number
  scaleY: number
  footerText: string
  calibrationText: string
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paper: 'a4',
  dpi: 300,
  bleedMm: 1.5,
  cutLine: true,
  cropMarks: false,
  calibration: true,
  scaleX: 1,
  scaleY: 1,
  footerText: '',
  calibrationText: '',
}

const MARGIN = 8
const FOOTER = 6
const HEADER = 18
const CROP_LEN = 3
const CROP_OFFSET = 1
/** Font size of the calibration and footer text (pt). */
export const SHEET_TEXT_PT = 7

export interface PrintJob {
  design: Design
  quantity: number
}

export interface PrintResult {
  blob: Blob
  pages: number
  placed: number
  oversized: string[]
}

// ---------- sheet plan: shared by the PDF and the on-screen preview ----------

export type PlanOptions = Pick<PrintOptions, 'paper' | 'bleedMm' | 'cropMarks' | 'calibration' | 'scaleX' | 'scaleY'>
export interface PlanJob {
  design: Pick<Design, 'id' | 'templateId'>
  quantity: number
}

export interface PlacedSticker {
  /** Design id. */
  id: string
  page: number
  /** Image box incl. bleed and printer scale (mm). */
  x: number
  y: number
  w: number
  h: number
  /** Origin of the template outline (cut line) inside the box. */
  cutX: number
  cutY: number
}

export interface SheetPlan {
  orientation: 'portrait' | 'landscape'
  pageW: number
  pageH: number
  pages: number
  items: PlacedSticker[]
  /** Design ids that do not fit on the paper (unique). */
  oversized: string[]
  /** Share of the printable area covered by stickers, per page (0–1). */
  usage: number[]
}

/** Where every sticker goes. generatePdf and the preview both use this, so they cannot diverge. */
export function planSheet(jobs: PlanJob[], o: PlanOptions): SheetPlan {
  const gap = Math.max(3, o.bleedMm * 2 + (o.cropMarks ? CROP_OFFSET * 2 + CROP_LEN : 1))
  const sizes = new Map<string, { w: number; h: number }>()
  const items = jobs.flatMap((j) => {
    if (j.quantity <= 0) return []
    const t = getTemplate(j.design.templateId)
    const size = { w: (t.widthMm + o.bleedMm * 2) * o.scaleX, h: (t.heightMm + o.bleedMm * 2) * o.scaleY }
    sizes.set(j.design.id, size)
    return Array.from({ length: j.quantity }, () => ({ key: j.design.id, ...size }))
  })
  const header = o.calibration ? HEADER : 0
  const layout = layoutSheet(items, o.paper, { marginMm: MARGIN, gapMm: gap, footerMm: FOOTER, headerMm: header })
  const placed = layout.placements.map((p) => ({
    id: p.key,
    page: p.page,
    x: p.x,
    y: p.y,
    ...sizes.get(p.key)!,
    cutX: p.x + o.bleedMm * o.scaleX,
    cutY: p.y + o.bleedMm * o.scaleY,
  }))
  const usage = Array.from({ length: layout.pages }, (_, page) => {
    const area = (layout.pageW - MARGIN * 2) * (layout.pageH - MARGIN * 2 - FOOTER - (page === 0 ? header : 0))
    const used = placed.reduce((sum, p) => sum + (p.page === page ? p.w * p.h : 0), 0)
    return Math.min(1, used / area)
  })
  return {
    orientation: layout.orientation,
    pageW: layout.pageW,
    pageH: layout.pageH,
    pages: layout.pages,
    items: placed,
    oversized: [...new Set(layout.oversized)],
    usage,
  }
}

/**
 * "Fill page": adds copies round-robin over the designs being printed as long as
 * everything still fits on the same number of pages. Returns the quantity per design id.
 */
export function fillLastPage(jobs: PlanJob[], o: PlanOptions, max = 99): Map<string, number> {
  const qty = new Map(jobs.map((j) => [j.design.id, j.quantity]))
  const start = planSheet(jobs, o)
  if (!start.pages) return qty
  const pagesFor = () => planSheet(jobs.map((j) => ({ design: j.design, quantity: qty.get(j.design.id)! })), o).pages
  let open = jobs.filter((j) => j.quantity > 0 && !start.oversized.includes(j.design.id)).map((j) => j.design.id)
  while (open.length) {
    open = open.filter((id) => {
      const q = qty.get(id)!
      if (q >= max) return false
      qty.set(id, q + 1)
      if (pagesFor() <= start.pages) return true
      qty.set(id, q)
      return false
    })
  }
  return qty
}

/** Calibration square and 50 mm ruler on page 1 (mm). */
export function calibrationGeometry(o: Pick<PrintOptions, 'scaleX' | 'scaleY'>) {
  const rx = MARGIN + 14
  return {
    square: { x: MARGIN, y: MARGIN, w: 10 * o.scaleX, h: 10 * o.scaleY },
    ruler: { x: rx, y: MARGIN + 9, len: 50 * o.scaleX },
    /** Every 5 mm, long ticks every 10 mm. */
    ticks: Array.from({ length: 11 }, (_, i) => ({ x: rx + i * 5 * o.scaleX, len: i % 2 ? 1.2 : 2.5 })),
    text: { x: rx + 54, y: MARGIN + 1.5, maxW: 120 },
  }
}

/** Footer text block at the bottom of every page (mm). */
export function footerGeometry(pageW: number, pageH: number) {
  return { x: MARGIN, y: pageH - MARGIN / 2 - 2.4, maxW: pageW - MARGIN * 2 }
}

export function footerLabel(text: string, page: number, pages: number): string {
  return `${text}  ·  ${page + 1}/${pages}`
}

/** Crop mark lines [x1, y1, x2, y2] around a sticker box (mm). */
export function cropMarkLines(x: number, y: number, w: number, h: number): [number, number, number, number][] {
  const L = CROP_LEN
  const g = CROP_OFFSET
  return [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ].flatMap(([cx, cy, dx, dy]) => [
    [cx + dx * g, cy, cx + dx * (g + L), cy] as [number, number, number, number],
    [cx, cy + dy * g, cx, cy + dy * (g + L)] as [number, number, number, number],
  ])
}

/** Lets the browser paint (progress bar) between synchronous chunks of work. */
const nextFrame = () => new Promise((r) => setTimeout(r, 0))

/** Share of the progress bar used by rendering the designs; the rest is page assembly. */
const RENDER_SHARE = 0.75

export async function generatePdf(jobs: PrintJob[], o: PrintOptions, onProgress?: (p: number) => void): Promise<PrintResult> {
  const { jsPDF } = await import('jspdf')
  const plan = planSheet(jobs, o)

  const doc = new jsPDF({ orientation: plan.orientation, unit: 'mm', format: o.paper, compress: true })
  doc.setProperties({ title: 'BeySkin print sheet', creator: 'BeySkin' })
  // Asks PDF viewers to print at 100 % instead of "fit to page".
  doc.viewerPreferences({ PrintScaling: 'None' })

  // Render every distinct design that is placed once.
  const images = new Map<string, string>()
  const uniq = jobs.filter((j) => j.quantity > 0 && !plan.oversized.includes(j.design.id))
  for (let i = 0; i < uniq.length; i++) {
    const d = uniq[i].design
    const canvas = await renderDesignCanvas(d, {
      pxPerMm: o.dpi / 25.4,
      bleedMm: o.bleedMm,
      clip: o.bleedMm > 0 ? 'bleed' : 'outline',
      background: '#ffffff',
    })
    images.set(d.id, canvas.toDataURL('image/jpeg', 0.95))
    canvas.width = canvas.height = 0
    onProgress?.(((i + 1) / uniq.length) * RENDER_SHARE)
  }

  const byId = new Map(jobs.map((j) => [j.design.id, j.design]))
  for (let page = 0; page < plan.pages; page++) {
    if (page > 0) doc.addPage(o.paper, plan.orientation)
    if (page === 0 && o.calibration) drawCalibration(doc, o)
    for (const it of plan.items.filter((p) => p.page === page)) {
      const d = byId.get(it.id)!
      doc.addImage(images.get(d.id)!, 'JPEG', it.x, it.y, it.w, it.h, d.id, 'FAST')
      if (o.cutLine) drawOutline(doc, getTemplate(d.templateId).outline, it.cutX, it.cutY, o.scaleX, o.scaleY)
      if (o.cropMarks) drawCropMarks(doc, it.x, it.y, it.w, it.h)
    }
    drawFooter(doc, footerLabel(o.footerText, page, plan.pages), plan.pageH, plan.pageW)
    onProgress?.(RENDER_SHARE + ((page + 1) / plan.pages) * (0.97 - RENDER_SHARE))
    await nextFrame()
  }

  const blob = doc.output('blob')
  onProgress?.(1)
  return { blob, pages: plan.pages, placed: plan.items.length, oversized: plan.oversized }
}

/** Cut line with a white halo so it stays visible on any artwork. */
function drawOutline(doc: import('jspdf').jsPDF, outline: Point[], ox: number, oy: number, sx: number, sy: number) {
  const pts = outline.map(([x, y]) => [ox + x * sx, oy + y * sy])
  const stroke = (color: number, width: number) => {
    doc.setDrawColor(color)
    doc.setLineWidth(width)
    doc.setLineJoin('round')
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      doc.line(x1, y1, x2, y2)
    }
  }
  stroke(255, 0.45)
  stroke(40, 0.15)
}

function drawCropMarks(doc: import('jspdf').jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(0)
  doc.setLineWidth(0.15)
  for (const [x1, y1, x2, y2] of cropMarkLines(x, y, w, h)) doc.line(x1, y1, x2, y2)
}

/** 10 mm square + 50 mm ruler so users can verify "actual size" printing. */
function drawCalibration(doc: import('jspdf').jsPDF, o: Pick<PrintOptions, 'scaleX' | 'scaleY' | 'calibrationText'>) {
  const g = calibrationGeometry(o)
  doc.setDrawColor(0)
  doc.setLineWidth(0.2)
  doc.rect(g.square.x, g.square.y, g.square.w, g.square.h)
  doc.line(g.ruler.x, g.ruler.y, g.ruler.x + g.ruler.len, g.ruler.y)
  for (const tick of g.ticks) doc.line(tick.x, g.ruler.y, tick.x, g.ruler.y - tick.len)
  drawText(doc, o.calibrationText, g.text.x, g.text.y, g.text.maxW, { size: SHEET_TEXT_PT, color: 90 })
}

function drawFooter(doc: import('jspdf').jsPDF, text: string, pageH: number, pageW: number) {
  const g = footerGeometry(pageW, pageH)
  drawText(doc, text, g.x, g.y, g.maxW, { size: SHEET_TEXT_PT, color: 140 })
}

export const PT = 25.4 / 72
/** Characters the built-in PDF fonts (WinAnsi) can show; anything else is drawn via canvas. */
const WIN_ANSI = /^[\n\x20-\x7e\xa0-\xff‘’‚“”„–—…•€™]*$/

interface TextStyle {
  /** Font size in pt. */
  size: number
  color?: number
  bold?: boolean
}

/**
 * Wrapped text block at (x, y) = top-left; returns its height in mm. Latin text uses the
 * PDF font, other scripts (Japanese, Polish ł …) are rendered with the system font as image.
 */
function drawText(doc: import('jspdf').jsPDF, text: string, x: number, y: number, maxW: number, st: TextStyle): number {
  if (!text) return 0
  const lineH = st.size * PT * 1.3
  if (WIN_ANSI.test(text)) {
    doc.setFont('helvetica', st.bold ? 'bold' : 'normal')
    doc.setFontSize(st.size)
    doc.setTextColor(st.color ?? 0)
    const lines = doc.splitTextToSize(text, maxW) as string[]
    doc.text(lines, x, y, { baseline: 'top', lineHeightFactor: 1.3 })
    return lines.length * lineH
  }
  const pxPerMm = 300 / 25.4
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const font = `${st.bold ? '700' : '400'} ${st.size * PT * pxPerMm}px ${family}`
  ctx.font = font
  const lines = wrapText(ctx, text, maxW * pxPerMm)
  const width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width), 1))
  canvas.width = width
  canvas.height = Math.ceil(lines.length * lineH * pxPerMm)
  ctx.font = font // reset by the resize
  ctx.textBaseline = 'top'
  const c = st.color ?? 0
  ctx.fillStyle = `rgb(${c}, ${c}, ${c})`
  lines.forEach((l, i) => ctx.fillText(l, 0, i * lineH * pxPerMm + st.size * PT * pxPerMm * 0.1))
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, canvas.width / pxPerMm, canvas.height / pxPerMm)
  canvas.width = canvas.height = 0
  return lines.length * lineH
}

/** Greedy wrap that breaks at spaces, or anywhere for scripts without spaces (CJK). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxPx: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      const next = line + ch
      if (ctx.measureText(next).width <= maxPx || !line) {
        line = next
        continue
      }
      const cut = line.lastIndexOf(' ')
      if (ch !== ' ' && cut > 0) {
        out.push(line.slice(0, cut))
        line = line.slice(cut + 1) + ch
      } else {
        out.push(line)
        line = ch === ' ' ? '' : ch
      }
    }
    out.push(line)
  }
  return out
}

export interface TestPageOptions {
  paper: PaperSize
  scaleX: number
  scaleY: number
  title: string
  /** Numbered instructions. */
  steps: string[]
  /** Next to the ruler (same text as on print sheets). */
  calibrationText: string
  /** Heading above the label outlines; empty = no outlines. */
  outlinesTitle: string
  /** Display name of a template (the caller translates it). */
  templateName: (t: StickerTemplate) => string
  footerText: string
}

/**
 * Small PDF to check the printer before printing a full sheet: calibration ruler and square
 * (current scale applied), instructions and the cut outlines of all label templates.
 */
export async function generateTestPagePdf(o: TestPageOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: o.paper, compress: true })
  doc.setProperties({ title: 'BeySkin printer test page', creator: 'BeySkin' })
  doc.viewerPreferences({ PrintScaling: 'None' })
  const { w: pageW, h: pageH } = PAPER_SIZES[o.paper]
  const contentW = pageW - MARGIN * 2
  const bottom = pageH - MARGIN - FOOTER

  drawCalibration(doc, o)
  let y = MARGIN + HEADER
  y += drawText(doc, o.title, MARGIN, y, contentW, { size: 14, bold: true }) + 2
  o.steps.forEach((step, i) => {
    y += drawText(doc, `${i + 1}. ${step}`, MARGIN, y, contentW, { size: 9.5, color: 40 }) + 1.2
  })

  if (o.outlinesTitle) {
    y += 4
    y += drawText(doc, o.outlinesTitle, MARGIN, y, contentW, { size: 11, bold: true }) + 3
    // Simple shelf layout in template order; captions sit below each outline.
    const CAPTION = 5
    const GAP = 6
    let x = MARGIN
    let rowH = 0
    for (const t of VISIBLE_TEMPLATES.filter((tp) => !tp.custom)) {
      const w = t.widthMm * o.scaleX
      const h = t.heightMm * o.scaleY
      const caption = `${o.templateName(t)} · ${+t.widthMm.toFixed(1)} × ${+t.heightMm.toFixed(1)} mm`
      const boxW = Math.max(w, 30)
      if (x > MARGIN && x + boxW > pageW - MARGIN) {
        x = MARGIN
        y += rowH + GAP
        rowH = 0
      }
      if (y + h + CAPTION > bottom) {
        doc.addPage(o.paper, 'portrait')
        x = MARGIN
        y = MARGIN
        rowH = 0
      }
      drawOutline(doc, t.outline, x, y, o.scaleX, o.scaleY)
      const capH = drawText(doc, caption, x, y + h + 1.2, Math.max(boxW, 40), { size: 6.5, color: 90 })
      rowH = Math.max(rowH, h + 1.2 + capH)
      x += Math.max(boxW, 40) + GAP
    }
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    drawFooter(doc, `${o.footerText}  ·  ${p}/${pages}`, pageH, pageW)
  }
  return doc.output('blob')
}
