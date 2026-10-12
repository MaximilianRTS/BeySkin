import { FRAME_DEFAULT_COLORS, newDesign, uid, type BlendMode, type Design, type FillLayer, type FrameLayer, type ImageLayer, type Layer, type ShapeLayer, type TextLayer } from './model'
import type { PatternId } from './library'
import { getTemplate } from '@/templates'

/**
 * Hand-built starting points. Only built-in content: fills, patterns, library
 * shapes, chip frames, text in the bundled fonts and empty picture placeholders
 * (assetId '') that the user fills with an own image. Every call to
 * createExample() returns a fresh design with new ids.
 */

/** Localised strings that end up on the sticker. */
export interface ExampleTexts {
  name: string
  team: string
}

export interface ExampleDef {
  id: string
  /** i18n key below `templates.` for the display name. */
  i18nKey: string
  templateId: string
  build: (txt: ExampleTexts) => Layer[]
}

// ---------- layer helpers ----------

interface Common {
  opacity?: number
  blend?: BlendMode
  rotation?: number
}

function base(name: string, x: number, y: number, o: Common = {}) {
  return {
    id: uid(),
    name,
    visible: true,
    locked: false,
    opacity: o.opacity ?? 1,
    blend: o.blend ?? ('source-over' as BlendMode),
    x,
    y,
    rotation: o.rotation ?? 0,
    flipX: false,
    flipY: false,
  }
}

function gradient(templateId: string, color: string, color2: string, angle: number): FillLayer {
  const t = getTemplate(templateId)
  return { ...base('Background', t.widthMm / 2, t.heightMm / 2), type: 'fill', color, color2, angle, pattern: null, patternScale: 4 }
}

/**
 * Pattern fill: `fg` drawn on `bg`. With bg black + blend 'screen' (or white +
 * 'multiply') only the pattern shows, so it can sit on top of a gradient.
 */
function pattern(templateId: string, id: PatternId, bg: string, fg: string, scale: number, angle: number, o: Common = {}): FillLayer {
  const t = getTemplate(templateId)
  return { ...base('Pattern', t.widthMm / 2, t.heightMm / 2, o), type: 'fill', color: bg, color2: fg, angle, pattern: id, patternScale: scale }
}

function shape(shapeId: string, x: number, y: number, width: number, color: string, stroke: string | null, o: Common & { strokeWidth?: number } = {}): ShapeLayer {
  return {
    ...base(shapeId, x, y, o),
    type: 'shape',
    shapeId,
    width,
    color,
    strokeColor: stroke ?? '#000000',
    strokeWidth: stroke ? (o.strokeWidth ?? 0.4) : 0,
  }
}

interface TextOpts extends Common {
  font?: string
  stroke?: string | null
  strokeWidth?: number
  shadow?: string | null
  /** Shadow offset and blur in mm (default: hard 0.5 mm drop shadow). */
  shadowX?: number
  shadowY?: number
  shadowBlur?: number
  glow?: string | null
  glowSize?: number
  /** Letter spacing in mm. */
  spacing?: number
  /** Arc in degrees (> 0 = rainbow). */
  curve?: number
  italic?: boolean
}

function text(value: string, x: number, y: number, size: number, color: string, o: TextOpts = {}): TextLayer {
  return {
    ...base(value, x, y, o),
    type: 'text',
    text: value,
    fontFamily: o.font ?? 'Bangers',
    fontSize: size,
    bold: false,
    italic: o.italic ?? false,
    color,
    strokeColor: o.stroke ?? '#000000',
    strokeWidth: o.stroke ? (o.strokeWidth ?? 0.4) : 0,
    align: 'center',
    ...(o.shadow ? { shadowColor: o.shadow, shadowX: o.shadowX ?? 0.5, shadowY: o.shadowY ?? 0.5, shadowBlur: o.shadowBlur ?? 0 } : {}),
    ...(o.glow ? { glowColor: o.glow, glowSize: o.glowSize ?? 0.8 } : {}),
    ...(o.spacing ? { letterSpacing: o.spacing } : {}),
    ...(o.curve ? { curve: o.curve } : {}),
  }
}

/** Empty picture placeholder (square unless `aspect` = width / height is given). */
function picture(x: number, y: number, width: number, mask: ImageLayer['mask'] = null, aspect = 1): ImageLayer {
  return {
    ...base('Picture', x, y),
    type: 'image',
    assetId: '',
    naturalWidth: Math.round(1000 * aspect),
    naturalHeight: 1000,
    width,
    mask,
  }
}

type FrameColors = Pick<FrameLayer, 'ringColor' | 'accentColor' | 'bandColor' | 'centerColor' | 'bandText' | 'bandTextColor' | 'bandTextFont'>

function frame(frameId: string, size: number, colors: Partial<FrameColors>): FrameLayer {
  return { ...base('Frame', size / 2, size / 2), type: 'frame', frameId, width: size, ...FRAME_DEFAULT_COLORS, ...colors }
}

/**
 * Font size (mm) so that `value` fits into `maxWidth`, never above `size`.
 * `em` = average glyph width of the font relative to its size (rough, uppercase).
 */
function fit(value: string, maxWidth: number, size: number, em: number): number {
  const chars = Math.max(1, [...value].length)
  return +Math.min(size, maxWidth / (chars * em)).toFixed(2)
}

const EM = { Bangers: 0.5, 'Russo One': 0.72, Anton: 0.5, 'Black Ops One': 0.7, Bungee: 0.74, Orbitron: 0.8, Audiowide: 0.78 } as const

// ---------- the examples ----------

// Battle Pass label: the free area for a name is x ≈ 13–62 mm; the small tab on the
// right (x ≈ 98–110, y ≈ 1–13) fits a symbol or a small round picture.
const BP = 'battlepass'
const CHIP = 'gear_chip'
const CHIP_D = 17.1

export const EXAMPLES: ExampleDef[] = [
  {
    id: 'bp-speed',
    i18nKey: 'example_bp_speed',
    templateId: BP,
    build: ({ name }) => [
      gradient(BP, '#0a0000', '#a01000', 0),
      pattern(BP, 'flames', '#000000', '#ff4d00', 14, 0, { blend: 'screen', opacity: 0.4 }),
      pattern(BP, 'speedlines', '#000000', '#ffb36b', 3, -8, { blend: 'screen', opacity: 0.35 }),
      shape('claws', 70, 12.5, 20, '#ff6a00', null, { opacity: 0.22, rotation: -18, blend: 'screen' }),
      shape('burst', 104.3, 7, 14.5, '#ffb000', null, { rotation: 10 }),
      shape('flame', 104.3, 6.6, 7.6, '#fff3c4', '#5a0400', { strokeWidth: 0.35 }),
      text(name, 38, 13.6, fit(name, 46, 12, EM['Black Ops One']), '#fff6e0', {
        font: 'Black Ops One',
        stroke: '#2a0000',
        strokeWidth: 0.5,
        glow: '#ff5a00',
        glowSize: 1.4,
        rotation: -3,
        spacing: 0.2,
      }),
    ],
  },
  {
    id: 'bp-neon',
    i18nKey: 'example_bp_neon',
    templateId: BP,
    build: ({ name }) => [
      gradient(BP, '#03020c', '#1d0645', 0),
      pattern(BP, 'circuit', '#000000', '#00e5ff', 6, 0, { blend: 'screen', opacity: 0.32 }),
      pattern(BP, 'hex', '#000000', '#ff2bd6', 3, 0, { blend: 'screen', opacity: 0.14 }),
      picture(104.3, 7.2, 11, 'circle'),
      shape('ring', 104.3, 7.2, 12.2, '#00e5ff', null),
      shape('ring', 104.3, 7.2, 13.6, '#ff2bd6', null, { opacity: 0.7 }),
      text(name, 38, 11.4, fit(name, 50, 9, EM.Orbitron + 0.03), '#d6feff', { font: 'Orbitron', glow: '#00e5ff', glowSize: 1.3, spacing: 0.3 }),
      text('— BLADER —', 38, 19.8, 3, '#ff5ce1', { font: 'Orbitron', glow: '#ff2bd6', glowSize: 0.7, spacing: 1 }),
    ],
  },
  {
    id: 'bp-camo',
    i18nKey: 'example_bp_camo',
    templateId: BP,
    build: ({ name }) => [
      pattern(BP, 'camo', '#08090a', '#262b30', 9, 20),
      pattern(BP, 'carbon', '#000000', '#ffffff', 1.6, 0, { blend: 'screen', opacity: 0.07 }),
      pattern(BP, 'speedlines', '#000000', '#c6ff00', 3, -8, { blend: 'screen', opacity: 0.16 }),
      shape('target', 104.3, 7.2, 10.5, '#c6ff00', null),
      shape('x-cross', 7, 19.5, 4, '#c6ff00', null, { opacity: 0.85 }),
      text(name, 38, 13.2, fit(name, 46, 11, EM['Black Ops One'] + 0.04), '#d8ff3a', {
        font: 'Black Ops One',
        stroke: '#0a0c0d',
        strokeWidth: 0.45,
        glow: '#7cff00',
        glowSize: 1,
        spacing: 0.4,
      }),
    ],
  },
  {
    id: 'chip-flame',
    i18nKey: 'example_chip_flame',
    templateId: CHIP,
    build: ({ name }) => [
      gradient(CHIP, '#3a0000', '#ff5a00', 90),
      pattern(CHIP, 'flames', '#000000', '#ffd23f', 3, 0, { blend: 'screen', opacity: 0.7 }),
      picture(CHIP_D / 2, CHIP_D / 2, 13, 'frame'),
      frame('chip-anime-left', CHIP_D, {
        ringColor: '#0b0b0b',
        accentColor: '#ffb000',
        bandColor: '#ff2d00',
        bandText: name,
        bandTextColor: '#ffffff',
        bandTextFont: 'Black Ops One',
      }),
    ],
  },
  {
    id: 'chip-thunder',
    i18nKey: 'example_chip_thunder',
    templateId: CHIP,
    build: () => [
      pattern(CHIP, 'rays', '#14043a', '#4d17c7', 2, 0),
      pattern(CHIP, 'lightning', '#000000', '#7df9ff', 3, 0, { blend: 'screen', opacity: 0.35 }),
      pattern(CHIP, 'stars', '#000000', '#ffffff', 3, 0, { blend: 'screen', opacity: 0.45 }),
      shape('bolt', CHIP_D / 2, CHIP_D / 2, 7, '#ffe14d', '#000000', { rotation: 10, strokeWidth: 0.35 }),
      frame('chip-textless-right', CHIP_D, { ringColor: '#000000', accentColor: '#7df9ff', bandColor: '#ffe14d' }),
    ],
  },
  {
    id: 'badge-tournament',
    i18nKey: 'example_badge',
    templateId: 'player_card',
    build: ({ name, team }) => [
      gradient('player_card', '#05040d', '#3a0a5e', 25),
      pattern('player_card', 'rays', '#000000', '#7c3cff', 7, 0, { blend: 'screen', opacity: 0.22 }),
      pattern('player_card', 'shards', '#000000', '#ffffff', 9, 0, { blend: 'screen', opacity: 0.1 }),
      picture(21.5, 27, 29, 'circle'),
      shape('ring', 21.5, 27, 31.5, '#b388ff', null),
      shape('ring', 21.5, 27, 34, '#ff2bd6', null, { opacity: 0.6 }),
      text('BLADER', 61, 13, 3, '#d1b3ff', { font: 'Press Start 2P', glow: '#7c3cff', glowSize: 0.8, spacing: 0.7 }),
      text(name, 61, 25.5, fit(name, 42, 11, EM.Bungee), '#ffffff', { font: 'Bungee', glow: '#b388ff', glowSize: 1.4, stroke: '#14052b', strokeWidth: 0.4 }),
      text(team, 61, 36.5, fit(team, 42, 4.2, EM['Russo One']), '#ffffff', { font: 'Russo One', opacity: 0.85, spacing: 0.3 }),
      shape('crown', 77, 46, 7, '#ffd23f', '#14052b', { strokeWidth: 0.3 }),
    ],
  },
  {
    id: 'launcher-lightning',
    i18nKey: 'example_launcher',
    templateId: 'launcher_x',
    build: ({ name }) => [
      gradient('launcher_x', '#000a24', '#0066ff', 0),
      pattern('launcher_x', 'lightning', '#000000', '#7df9ff', 5, 0, { blend: 'screen', opacity: 0.35 }),
      pattern('launcher_x', 'speedlines', '#000000', '#ffffff', 2.5, -6, { blend: 'screen', opacity: 0.2 }),
      text(name, 21, 8.2, fit(name, 34, 8.5, EM.Bungee), '#ffffff', { font: 'Bungee', stroke: '#000a24', strokeWidth: 0.4, glow: '#00e5ff', glowSize: 1.1, rotation: -3 }),
    ],
  },
]

export function getExample(id: string): ExampleDef | undefined {
  return EXAMPLES.find((e) => e.id === id)
}

/** A fresh, independent design (new design and layer ids) built from an example. */
export function createExample(ex: ExampleDef, texts: ExampleTexts, name = ''): Design {
  const d = newDesign(ex.templateId, name)
  d.layers = ex.build(texts)
  return d
}
