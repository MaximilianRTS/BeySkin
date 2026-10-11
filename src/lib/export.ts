import { blobToDataUrl } from './assets'
import type { Design } from './model'
import { renderDesignBlob } from './render'
import { getTemplate } from '@/templates'

/** Transparent PNG of one label at the given resolution. */
export function exportPng(design: Design, dpi: number, bleedMm = 0): Promise<Blob> {
  return renderDesignBlob(design, { pxPerMm: dpi / 25.4, bleedMm, clip: bleedMm > 0 ? 'bleed' : 'outline' })
}

/**
 * SVG for cutting plotters (Cricut, Silhouette, Brother): the artwork as an
 * embedded PNG plus the cut outline as a vector path, both in real millimetres.
 */
export async function exportCutSvg(design: Design, dpi: number, bleedMm: number): Promise<Blob> {
  const t = getTemplate(design.templateId)
  const png = await exportPng(design, dpi, bleedMm)
  const href = await blobToDataUrl(png)
  const w = t.widthMm + bleedMm * 2
  const h = t.heightMm + bleedMm * 2
  const d =
    t.outline.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + bleedMm).toFixed(3)} ${(y + bleedMm).toFixed(3)}`).join(' ') + ' Z'
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <g id="print">
    <image width="${w}" height="${h}" preserveAspectRatio="none" xlink:href="${href}" href="${href}"/>
  </g>
  <g id="cut">
    <path d="${d}" fill="none" stroke="#ff0000" stroke-width="0.1"/>
  </g>
</svg>`
  return new Blob([svg], { type: 'image/svg+xml' })
}
