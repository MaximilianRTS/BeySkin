import type { Design } from './model'
import { renderDesignCanvas } from './render'
import { layoutSheet, type PaperSize } from './sheet'
import { getTemplate, type Point } from '@/templates'

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

export async function generatePdf(jobs: PrintJob[], o: PrintOptions, onProgress?: (p: number) => void): Promise<PrintResult> {
  const { jsPDF } = await import('jspdf')
  const gap = Math.max(3, o.bleedMm * 2 + (o.cropMarks ? CROP_OFFSET * 2 + CROP_LEN : 1))

  const items = jobs.flatMap((j) => {
    const t = getTemplate(j.design.templateId)
    return Array.from({ length: j.quantity }, () => ({
      key: j.design.id,
      w: (t.widthMm + o.bleedMm * 2) * o.scaleX,
      h: (t.heightMm + o.bleedMm * 2) * o.scaleY,
    }))
  })
  const layout = layoutSheet(items, o.paper, { marginMm: MARGIN, gapMm: gap, footerMm: FOOTER, headerMm: o.calibration ? HEADER : 0 })

  const doc = new jsPDF({ orientation: layout.orientation, unit: 'mm', format: o.paper, compress: true })
  doc.setProperties({ title: 'BeySkin print sheet', creator: 'BeySkin' })

  // Render every distinct design once.
  const images = new Map<string, string>()
  const uniq = jobs.filter((j) => j.quantity > 0)
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
    onProgress?.((i + 1) / uniq.length)
  }

  const byId = new Map(jobs.map((j) => [j.design.id, j.design]))
  for (let page = 0; page < layout.pages; page++) {
    if (page > 0) doc.addPage(o.paper, layout.orientation)
    if (page === 0 && o.calibration) drawCalibration(doc, o)
    for (const pl of layout.placements.filter((p) => p.page === page)) {
      const d = byId.get(pl.key)!
      const t = getTemplate(d.templateId)
      const w = (t.widthMm + o.bleedMm * 2) * o.scaleX
      const h = (t.heightMm + o.bleedMm * 2) * o.scaleY
      doc.addImage(images.get(d.id)!, 'JPEG', pl.x, pl.y, w, h, d.id, 'FAST')
      const ox = pl.x + o.bleedMm * o.scaleX
      const oy = pl.y + o.bleedMm * o.scaleY
      if (o.cutLine) drawOutline(doc, t.outline, ox, oy, o.scaleX, o.scaleY)
      if (o.cropMarks) drawCropMarks(doc, pl.x, pl.y, w, h)
    }
    doc.setFontSize(7)
    doc.setTextColor(140)
    doc.text(`${o.footerText}  ·  ${page + 1}/${layout.pages}`, MARGIN, layout.pageH - MARGIN / 2)
  }

  return {
    blob: doc.output('blob'),
    pages: layout.pages,
    placed: layout.placements.length,
    oversized: [...new Set(layout.oversized)],
  }
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
  const L = CROP_LEN
  const g = CROP_OFFSET
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ]) {
    doc.line(cx + dx * g, cy, cx + dx * (g + L), cy)
    doc.line(cx, cy + dy * g, cx, cy + dy * (g + L))
  }
}

/** 20 mm square + 50 mm ruler so users can verify "actual size" printing. */
function drawCalibration(doc: import('jspdf').jsPDF, o: PrintOptions) {
  const x = MARGIN
  const y = MARGIN
  doc.setDrawColor(0)
  doc.setLineWidth(0.2)
  doc.rect(x, y, 10 * o.scaleX, 10 * o.scaleY)
  const rx = x + 14
  const ry = y + 9
  doc.line(rx, ry, rx + 50 * o.scaleX, ry)
  for (let i = 0; i <= 50; i += 5) {
    const tick = i % 10 === 0 ? 2.5 : 1.2
    doc.line(rx + i * o.scaleX, ry, rx + i * o.scaleX, ry - tick)
  }
  doc.setFontSize(7)
  doc.setTextColor(90)
  doc.text(o.calibrationText, rx + 54, y + 4, { maxWidth: 120 })
}
