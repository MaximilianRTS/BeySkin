import type { Design, Layer } from './model'
import { sanitizeDesign } from './projectFile'

/**
 * Share links without a server: the design is compressed into the URL fragment
 * (#/s/<data>). Fragments are never sent to the web server, so nothing is stored
 * or hosted. Uploaded images are not included – they become placeholders the
 * recipient fills with their own pictures ("remix").
 */

const VERSION = '1'
/** Discord's message limit; longer links get a warning in the UI. */
export const COMFORTABLE_LINK_LENGTH = 2000
const MAX_DATA_LENGTH = 200_000

const LAYER_DEFAULTS: Partial<Record<string, unknown>> = {
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  rotation: 0,
  flipX: false,
  flipY: false,
}

const round = (v: number) => Math.round(v * 100) / 100

function compactLayer(layer: Layer): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(layer)) {
    if (key === 'id') continue
    if (key === 'assetId') {
      out.assetId = ''
      continue
    }
    if (LAYER_DEFAULTS[key] === value) continue
    out[key] = typeof value === 'number' ? round(value) : value
  }
  return out
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data as Uint8Array<ArrayBuffer>)
      controller.close()
    },
  })
  return new Uint8Array(await new Response(source.pipeThrough(stream)).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export async function encodeDesign(design: Design): Promise<string> {
  const payload = {
    t: design.templateId,
    n: design.name || undefined,
    l: design.layers.map(compactLayer),
  }
  const json = new TextEncoder().encode(JSON.stringify(payload))
  return VERSION + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeDesign(data: string): Promise<Design> {
  if (!data || data.length > MAX_DATA_LENGTH || data[0] !== VERSION || !/^[A-Za-z0-9_-]+$/.test(data.slice(1))) {
    throw new Error('invalid-share-link')
  }
  let payload: { t?: unknown; n?: unknown; l?: unknown }
  try {
    const bytes = await pipe(fromBase64Url(data.slice(1)), new DecompressionStream('deflate-raw'))
    if (bytes.length > 2_000_000) throw new Error('too-large')
    payload = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('invalid-share-link')
  }
  const layers = (Array.isArray(payload.l) ? payload.l : []).map((l) => ({ ...LAYER_DEFAULTS, ...(l as object) }))
  return sanitizeDesign({ templateId: payload.t, name: payload.n, layers }, new Set(), { placeholders: true })
}

export function shareUrl(data: string): string {
  return `${location.origin}${location.pathname}#/s/${data}`
}

export function countPlaceholders(design: Design): number {
  return design.layers.filter((l) => l.type === 'image').length
}
