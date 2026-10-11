import { ref } from 'vue'
import { createStore, del, get, keys, set } from 'idb-keyval'

/**
 * Image asset store. Uploaded images are downscaled once, stored as Blobs in
 * IndexedDB under a content hash and referenced from layers by id. This keeps
 * designs small (no base64 in JSON) and deduplicates repeated uploads.
 */

/** Longest edge after import. 4096 px covers a 112 mm label at > 900 dpi. */
export const MAX_IMPORT_EDGE = 4096

// Internal IndexedDB name from the pre-release name – kept so saved designs survive the rename.
const store = createStore('spinlabel-assets', 'assets')
const metaStore = createStore('beyskin-asset-meta', 'meta')

export interface AssetMeta {
  id: string
  name: string
  width: number
  height: number
  addedAt: string
}

/** MIME type used when dragging a stored image from "My images" onto the canvas. */
export const ASSET_DRAG_TYPE = 'application/x-beyskin-asset'

/** Bumped whenever images are added or removed, so the "My images" panel can refresh. */
export const assetsVersion = ref(0)
const bitmapCache = new Map<string, Promise<ImageBitmap>>()

export interface ImportedAsset {
  id: string
  width: number
  height: number
}

async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function downscale(bitmap: ImageBitmap, type: string): Promise<Blob | null> {
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= MAX_IMPORT_EDGE) return null
  const f = MAX_IMPORT_EDGE / longest
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * f), Math.round(bitmap.height * f))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  // Keep transparency for PNG/WebP/GIF sources, JPEG stays JPEG.
  const outType = type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  return canvas.convertToBlob({ type: outType, quality: 0.92 })
}

export async function importImage(file: Blob, name = ''): Promise<ImportedAsset> {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image')
  // imageOrientation: 'from-image' applies EXIF rotation; re-encoding below also drops EXIF metadata.
  let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const resized = await downscale(bitmap, file.type)
  let blob: Blob = resized ?? file
  if (resized) {
    bitmap.close()
    bitmap = await createImageBitmap(resized)
  } else if (file.type === 'image/jpeg') {
    // Re-encode JPEGs so EXIF (GPS, camera) never ends up in exported or uploaded projects.
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
  }
  const id = await hashBlob(blob)
  if (!(await get(id, store))) await set(id, blob, store)
  bitmapCache.set(id, Promise.resolve(bitmap))
  const meta: AssetMeta = { id, name: name || (await get<AssetMeta>(id, metaStore))?.name || '', width: bitmap.width, height: bitmap.height, addedAt: new Date().toISOString() }
  await set(id, meta, metaStore).catch(() => {})
  assetsVersion.value++
  return { id, width: bitmap.width, height: bitmap.height }
}

export async function putAssetBlob(id: string, blob: Blob): Promise<void> {
  await set(id, blob, store)
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, store)
}

export function getBitmap(id: string): Promise<ImageBitmap> {
  let p = bitmapCache.get(id)
  if (!p) {
    p = getAssetBlob(id).then((blob) => {
      if (!blob) throw new Error(`missing-asset:${id}`)
      return createImageBitmap(blob)
    })
    p.catch(() => bitmapCache.delete(id))
    bitmapCache.set(id, p)
  }
  return p
}

/** Synchronous lookup for the render loop; returns null until the bitmap is decoded. */
const ready = new Map<string, ImageBitmap>()
export function getBitmapSync(id: string, onReady?: () => void): ImageBitmap | null {
  if (!id) return null
  const hit = ready.get(id)
  if (hit) return hit
  getBitmap(id)
    .then((bmp) => {
      ready.set(id, bmp)
      onReady?.()
    })
    .catch(() => {})
  return null
}

/** All stored images, newest first (images from before metadata existed get it on the fly). */
export async function listAssets(): Promise<AssetMeta[]> {
  const out: AssetMeta[] = []
  for (const id of await keys<string>(store)) {
    let meta = await get<AssetMeta>(id, metaStore)
    if (!meta) {
      try {
        const bmp = await getBitmap(id)
        meta = { id, name: '', width: bmp.width, height: bmp.height, addedAt: '' }
        await set(id, meta, metaStore)
      } catch {
        continue
      }
    }
    out.push(meta)
  }
  return out.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

const thumbCache = new Map<string, Promise<string>>()
/** Small object-URL thumbnail (max 192 px) for the image library. */
export function assetThumbUrl(id: string): Promise<string> {
  let p = thumbCache.get(id)
  if (!p) {
    p = getBitmap(id).then(async (bmp) => {
      const f = 192 / Math.max(bmp.width, bmp.height)
      const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * f)), Math.max(1, Math.round(bmp.height * f)))
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      return URL.createObjectURL(await c.convertToBlob({ type: 'image/png' }))
    })
    p.catch(() => thumbCache.delete(id))
    thumbCache.set(id, p)
  }
  return p
}

export async function deleteAsset(id: string): Promise<void> {
  await del(id, store)
  await del(id, metaStore)
  bitmapCache.delete(id)
  ready.delete(id)
  const thumb = thumbCache.get(id)
  thumbCache.delete(id)
  thumb?.then((u) => URL.revokeObjectURL(u)).catch(() => {})
  assetsVersion.value++
}

/** Downscaled alpha channel of an image, used for click-through hit testing. */
export interface AlphaMask {
  w: number
  h: number
  alpha: Uint8Array
}
const alphaMasks = new Map<string, AlphaMask | null>()

/** Returns the alpha mask once computed; starts computing it on first request. */
export function getAlphaMaskSync(id: string): AlphaMask | null {
  if (alphaMasks.has(id)) return alphaMasks.get(id) ?? null
  alphaMasks.set(id, null)
  getBitmap(id)
    .then((bmp) => {
      const f = Math.min(1, 256 / Math.max(bmp.width, bmp.height))
      const w = Math.max(1, Math.round(bmp.width * f))
      const h = Math.max(1, Math.round(bmp.height * f))
      const c = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!
      c.drawImage(bmp, 0, 0, w, h)
      const rgba = c.getImageData(0, 0, w, h).data
      const alpha = new Uint8Array(w * h)
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]
      alphaMasks.set(id, { w, h, alpha })
    })
    .catch(() => alphaMasks.delete(id))
  return null
}

/** Removes assets no longer referenced by any saved design. */
export async function collectGarbage(referenced: Set<string>): Promise<number> {
  let removed = 0
  for (const key of await keys<string>(store)) {
    if (!referenced.has(key)) {
      await del(key, store)
      await del(key, metaStore)
      bitmapCache.delete(key)
      ready.delete(key)
      removed++
    }
  }
  return removed
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/

/** Only accepts base64 image data URLs; anything else (remote URLs, SVG) is rejected. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = DATA_URL_RE.exec(dataUrl)
  if (!m) throw new Error('invalid-image-data')
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}
