/**
 * Pure text layout in mm: straight lines, letter spacing and text on an arc.
 * The renderer, hit testing and selection handles all use the same result, so
 * the box always matches what is drawn. `measure` returns the advance width of
 * a string in mm at the layer's font size.
 */

export const LINE_HEIGHT = 1.15
/** Below this curvature (degrees) text is set straight. */
const MIN_CURVE = 0.5

export interface TextLayoutInput {
  text: string
  fontSize: number
  align: 'left' | 'center' | 'right'
  /** Extra space between letters in mm. */
  letterSpacing?: number
  /** Arc angle in degrees: > 0 bends like a rainbow, < 0 like a smile. */
  curve?: number
}

/** One piece of text drawn with textBaseline 'middle'. Coordinates in mm from the box centre. */
export interface TextRun {
  text: string
  x: number
  y: number
  /** Rotation in radians (clockwise). */
  rot: number
  align: 'left' | 'center' | 'right'
}

export interface TextLayout {
  /** Box size in mm (without outline). */
  w: number
  h: number
  runs: TextRun[]
}

export type Measure = (s: string) => number

let segmenter: Intl.Segmenter | null | undefined
/** Splits into user-perceived characters (keeps emoji and accents together). */
export function graphemes(s: string): string[] {
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : [...s]
}

interface Glyph {
  text: string
  /** Left edge from the line start (mm). */
  left: number
  adv: number
}

/** Per-letter positions of a line; prefix measuring keeps the font's kerning. */
function glyphLine(line: string, measure: Measure, spacing: number): { glyphs: Glyph[]; width: number } {
  const parts = graphemes(line)
  const glyphs: Glyph[] = []
  const exact = parts.length <= 120
  let prefix = ''
  let prev = 0
  let sum = 0
  parts.forEach((ch, i) => {
    let adv: number
    if (exact) {
      prefix += ch
      const now = measure(prefix)
      adv = now - prev
      prev = now
    } else adv = measure(ch)
    glyphs.push({ text: ch, left: sum + i * spacing, adv })
    sum += adv
  })
  return { glyphs, width: Math.max(0, sum + Math.max(0, parts.length - 1) * spacing) }
}

export function layoutText(input: TextLayoutInput, measure: Measure): TextLayout {
  const lines = input.text.split('\n')
  const spacing = input.letterSpacing ?? 0
  const curve = Math.max(-360, Math.min(360, input.curve ?? 0))
  const lh = input.fontSize * LINE_HEIGHT
  const h = lines.length * lh
  const top = -((lines.length - 1) * lh) / 2
  const minW = input.fontSize / 100

  // Plain text: whole lines, exactly like before effects existed.
  if (!spacing && Math.abs(curve) < MIN_CURVE) {
    const w = Math.max(minW, ...lines.map((l) => measure(l)))
    const x = input.align === 'left' ? -w / 2 : input.align === 'right' ? w / 2 : 0
    return { w, h, runs: lines.map((text, i) => ({ text, x, y: top + i * lh, rot: 0, align: input.align })) }
  }

  const laid = lines.map((l) => glyphLine(l, measure, spacing))
  const w = Math.max(minW, ...laid.map((l) => l.width))

  if (Math.abs(curve) < MIN_CURVE) {
    const runs: TextRun[] = []
    laid.forEach(({ glyphs, width }, i) => {
      const start = input.align === 'left' ? -w / 2 : input.align === 'right' ? w / 2 - width : -width / 2
      for (const g of glyphs) runs.push({ text: g.text, x: start + g.left + g.adv / 2, y: top + i * lh, rot: 0, align: 'center' })
    })
    return { w, h, runs }
  }

  // Arc: concentric circles around a common centre, the middle line at radius R.
  const sgn = Math.sign(curve)
  const theta = (Math.abs(curve) * Math.PI) / 180
  const mid = (lines.length - 1) / 2
  const R = Math.max(w / theta, mid * lh + input.fontSize * 0.6)
  const span = w / R
  const runs: TextRun[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  laid.forEach(({ glyphs, width }, i) => {
    const r = R + sgn * (mid - i) * lh
    const phi = width / r
    const start = input.align === 'left' ? -span / 2 : input.align === 'right' ? span / 2 - phi : -phi / 2
    for (const g of glyphs) {
      const a = start + (g.left + g.adv / 2) / r
      const x = r * Math.sin(a)
      const y = -sgn * r * Math.cos(a)
      const rot = sgn * a
      runs.push({ text: g.text, x, y, rot, align: 'center' })
      // Rotated letter box (advance × line height) for the bounds.
      const c = Math.abs(Math.cos(rot))
      const s = Math.abs(Math.sin(rot))
      const hw = (g.adv / 2) * c + (lh / 2) * s
      const hh = (g.adv / 2) * s + (lh / 2) * c
      minX = Math.min(minX, x - hw)
      maxX = Math.max(maxX, x + hw)
      minY = Math.min(minY, y - hh)
      maxY = Math.max(maxY, y + hh)
    }
  })
  if (!runs.length) return { w, h, runs }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  for (const r of runs) {
    r.x -= cx
    r.y -= cy
  }
  return { w: Math.max(minW, maxX - minX), h: Math.max(minW, maxY - minY), runs }
}
