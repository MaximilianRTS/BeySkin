import { blobToDataUrl, dataUrlToBlob, getAssetBlob, importImage } from './assets'
import { BLEND_MODES, IMAGE_ADJUST_DEFAULTS, newDesign, TEXT_EFFECT_DEFAULTS, uid, type BlendMode, type Design, type ImageLayer, type Layer } from './model'
import { isTemplateId } from '@/templates'

/**
 * Portable project file: designs plus embedded image assets (base64).
 * Also used as the payload for gallery uploads.
 */
export const PROJECT_FORMAT = 'beyskin-project'
/** Pre-release name of the format; still accepted on import. */
const LEGACY_FORMATS = ['spinlabel-project']

export interface ProjectFile {
  format: typeof PROJECT_FORMAT
  version: 2
  designs: Design[]
  assets: Record<string, string>
}

export async function buildProjectFile(designs: Design[]): Promise<ProjectFile> {
  const assets: Record<string, string> = {}
  for (const d of designs) {
    for (const l of d.layers) {
      if (l.type === 'image' && !assets[l.assetId]) {
        const blob = await getAssetBlob(l.assetId)
        if (blob) assets[l.assetId] = await blobToDataUrl(blob)
      }
    }
  }
  return { format: PROJECT_FORMAT, version: 2, designs: JSON.parse(JSON.stringify(designs)), assets }
}

export async function projectFileBlob(designs: Design[]): Promise<Blob> {
  return new Blob([JSON.stringify(await buildProjectFile(designs))], { type: 'application/json' })
}

// ---------- validation ----------

const num = (v: unknown, fallback: number, min = -1e4, max = 1e4) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const str = (v: unknown, fallback: string, maxLen = 500) => (typeof v === 'string' ? v.slice(0, maxLen) : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback)
/** Optional colour: null (= effect off) unless a valid hex colour is given. */
const optColor = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null)
const blend = (v: unknown): BlendMode => (BLEND_MODES.includes(v as BlendMode) ? (v as BlendMode) : 'source-over')

export interface SanitizeOptions {
  /** Keep image layers whose asset is unknown as empty placeholders (share links). */
  placeholders?: boolean
}

const SHAPE_ID_RE = /^[a-z0-9-]{1,40}$/

function sanitizeLayer(raw: Record<string, unknown>, knownAssets: Set<string>, opts: SanitizeOptions = {}): Layer | null {
  const base = {
    id: uid(),
    name: str(raw.name, 'Layer', 80),
    visible: bool(raw.visible, true),
    locked: bool(raw.locked, false),
    opacity: num(raw.opacity, 1, 0, 1),
    blend: blend(raw.blend),
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    rotation: num(raw.rotation, 0, -3600, 3600),
    flipX: bool(raw.flipX, false),
    flipY: bool(raw.flipY, false),
    groupId: typeof raw.groupId === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(raw.groupId) ? raw.groupId : null,
  }
  switch (raw.type) {
    case 'image': {
      let assetId = str(raw.assetId, '', 64)
      if (!knownAssets.has(assetId)) {
        if (!opts.placeholders) return null
        assetId = ''
      }
      return {
        ...base,
        type: 'image',
        assetId,
        naturalWidth: num(raw.naturalWidth, 1, 1, 20000),
        naturalHeight: num(raw.naturalHeight, 1, 1, 20000),
        width: num(raw.width, 50, 0.1, 5000),
        mask: raw.mask === 'circle' || raw.mask === 'frame' ? raw.mask : null,
        brightness: num(raw.brightness, IMAGE_ADJUST_DEFAULTS.brightness, 0, 200),
        contrast: num(raw.contrast, IMAGE_ADJUST_DEFAULTS.contrast, 0, 200),
        saturation: num(raw.saturation, IMAGE_ADJUST_DEFAULTS.saturation, 0, 200),
        hue: num(raw.hue, IMAGE_ADJUST_DEFAULTS.hue, -180, 180),
        grayscale: num(raw.grayscale, IMAGE_ADJUST_DEFAULTS.grayscale, 0, 100),
        keyColor: optColor(raw.keyColor),
        keyTolerance: num(raw.keyTolerance, IMAGE_ADJUST_DEFAULTS.keyTolerance, 0, 100),
        keySoftness: num(raw.keySoftness, IMAGE_ADJUST_DEFAULTS.keySoftness, 0, 100),
      }
    }
    case 'text':
      return {
        ...base,
        type: 'text',
        text: str(raw.text, '', 2000),
        fontFamily: str(raw.fontFamily, 'Arial', 60),
        fontSize: num(raw.fontSize, 6, 0.5, 500),
        bold: bool(raw.bold, false),
        italic: bool(raw.italic, false),
        color: color(raw.color, '#ffffff'),
        strokeColor: color(raw.strokeColor, '#000000'),
        strokeWidth: num(raw.strokeWidth, 0, 0, 20),
        align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
        letterSpacing: num(raw.letterSpacing, TEXT_EFFECT_DEFAULTS.letterSpacing, -10, 50),
        curve: num(raw.curve, TEXT_EFFECT_DEFAULTS.curve, -360, 360),
        shadowColor: optColor(raw.shadowColor),
        shadowX: num(raw.shadowX, TEXT_EFFECT_DEFAULTS.shadowX, -50, 50),
        shadowY: num(raw.shadowY, TEXT_EFFECT_DEFAULTS.shadowY, -50, 50),
        shadowBlur: num(raw.shadowBlur, TEXT_EFFECT_DEFAULTS.shadowBlur, 0, 20),
        glowColor: optColor(raw.glowColor),
        glowSize: num(raw.glowSize, TEXT_EFFECT_DEFAULTS.glowSize, 0, 20),
      }
    case 'fill':
      return {
        ...base,
        type: 'fill',
        color: color(raw.color, '#ffffff'),
        color2: raw.color2 == null ? null : color(raw.color2, '#000000'),
        angle: num(raw.angle, 0, -360, 360),
        pattern: typeof raw.pattern === 'string' && SHAPE_ID_RE.test(raw.pattern) ? raw.pattern : null,
        patternScale: num(raw.patternScale, 4, 0.5, 50),
      }
    case 'frame': {
      const frameId = typeof raw.frameId === 'string' && SHAPE_ID_RE.test(raw.frameId) ? raw.frameId : null
      if (!frameId) return null
      return {
        ...base,
        type: 'frame',
        frameId,
        width: num(raw.width, 17.1, 0.5, 2000),
        ringColor: color(raw.ringColor, '#000000'),
        accentColor: color(raw.accentColor, '#ffffff'),
        bandColor: color(raw.bandColor, '#e8423a'),
        centerColor: raw.centerColor == null ? null : color(raw.centerColor, '#ffffff'),
        bandText: str(raw.bandText, '', 40),
        bandTextColor: color(raw.bandTextColor, '#ffffff'),
        bandTextFont: str(raw.bandTextFont, 'Russo One', 60),
      }
    }
    case 'shape': {
      const shapeId = typeof raw.shapeId === 'string' && SHAPE_ID_RE.test(raw.shapeId) ? raw.shapeId : null
      if (!shapeId) return null
      return {
        ...base,
        type: 'shape',
        shapeId,
        width: num(raw.width, 20, 0.5, 2000),
        color: color(raw.color, '#ffffff'),
        strokeColor: color(raw.strokeColor, '#000000'),
        strokeWidth: num(raw.strokeWidth, 0, 0, 20),
      }
    }
    default:
      return null
  }
}

export function sanitizeDesign(raw: Record<string, unknown>, knownAssets: Set<string>, opts: SanitizeOptions = {}): Design {
  const templateId = isTemplateId(raw.templateId) ? raw.templateId : 'battlepass'
  const d = newDesign(templateId, str(raw.name, '', 80))
  const layers = Array.isArray(raw.layers) ? raw.layers : []
  d.layers = layers
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .slice(0, 200)
    .map((l) => sanitizeLayer(l, knownAssets, opts))
    .filter((l): l is Layer => l !== null)
  return d
}

// ---------- V1 (BeyBattlePass 1.x) import ----------

const V1_CUTOUT_W = 111.55
const V1_CUTOUT_H = 25.64

async function convertV1Layers(rawLayers: unknown[]): Promise<Layer[]> {
  const out: Layer[] = []
  for (const raw of rawLayers as Array<Record<string, unknown>>) {
    if (!raw || typeof raw.imageDataUrl !== 'string') continue
    const asset = await importImage(dataUrlToBlob(raw.imageDataUrl))
    // V1: layer height = scale × cutout height, pan is a fraction of the cutout size.
    const height = num(raw.scale, 1, 0.01, 100) * V1_CUTOUT_H
    const layer: ImageLayer = {
      id: uid(),
      type: 'image',
      name: str(raw.name, 'Layer', 80),
      visible: bool(raw.visible, true),
      locked: false,
      opacity: num(raw.opacity, 1, 0, 1),
      blend: raw.blendMode === 'normal' ? 'source-over' : blend(raw.blendMode),
      x: (0.5 + num(raw.panX, 0)) * V1_CUTOUT_W,
      y: (0.5 + num(raw.panY, 0)) * V1_CUTOUT_H,
      rotation: num(raw.rotation, 0),
      flipX: false,
      flipY: false,
      assetId: asset.id,
      naturalWidth: asset.width,
      naturalHeight: asset.height,
      width: (height * asset.width) / asset.height,
    }
    out.push(layer)
  }
  return out
}

async function importV1(data: Record<string, unknown>): Promise<Design[]> {
  const designs: Design[] = []
  const items = Array.isArray(data.sessionItems) ? (data.sessionItems as Array<Record<string, unknown>>) : []
  for (const item of items) {
    const d = newDesign('battlepass', str(item.imageName, '', 80))
    d.layers = await convertV1Layers(Array.isArray(item.layers) ? item.layers : [])
    designs.push(d)
  }
  if (Array.isArray(data.layers) && data.layers.length) {
    const d = newDesign('battlepass', 'Workspace')
    d.layers = await convertV1Layers(data.layers)
    designs.push(d)
  }
  return designs
}

// ---------- public import ----------

export async function importProjectText(text: string): Promise<Design[]> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('invalid-project')
  }
  if (!data || typeof data !== 'object') throw new Error('invalid-project')
  const obj = data as Record<string, unknown>
  if (obj.fileType === 'beytagger-project') return importV1(obj)
  const knownFormat = obj.format === PROJECT_FORMAT || LEGACY_FORMATS.includes(obj.format as string)
  if (!knownFormat || !Array.isArray(obj.designs)) throw new Error('invalid-project')

  // Assets are re-imported (and re-hashed) so the stored id always matches the content.
  const idMap = new Map<string, string>()
  const assets = (obj.assets && typeof obj.assets === 'object' ? obj.assets : {}) as Record<string, unknown>
  for (const [oldId, dataUrl] of Object.entries(assets)) {
    if (typeof dataUrl !== 'string') continue
    const asset = await importImage(dataUrlToBlob(dataUrl))
    idMap.set(oldId, asset.id)
  }
  const designs = (obj.designs as unknown[])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .slice(0, 200)
    .map((raw) => {
      const layers = Array.isArray(raw.layers) ? (raw.layers as Array<Record<string, unknown>>) : []
      const remapped = layers.map((l) =>
        l && l.type === 'image' ? { ...l, assetId: idMap.get(l.assetId as string) ?? '' } : l,
      )
      return sanitizeDesign({ ...raw, layers: remapped }, new Set(idMap.values()))
    })
  return designs
}

export async function importProjectFile(file: Blob): Promise<Design[]> {
  if (file.size > 60 * 1024 * 1024) throw new Error('file-too-large')
  return importProjectText(await file.text())
}

