// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  applyAdjustments,
  applyColorKey,
  cssFilter,
  hexToRgb,
  layerAdjustments,
  layerColorKey,
  NEUTRAL_ADJUSTMENTS,
  parseVariantKey,
  pickKeyColor,
  variantKey,
} from '../imageAdjust'
import type { ImageLayer } from '../model'

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba)

function image(extra: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'i', name: 'I', type: 'image', visible: true, locked: false, opacity: 1, blend: 'source-over',
    x: 0, y: 0, rotation: 0, flipX: false, flipY: false, assetId: 'abc', naturalWidth: 10, naturalHeight: 10, width: 10,
    ...extra,
  }
}

describe('colour key', () => {
  it('removes matching pixels, keeps others and fades the soft edge', () => {
    const data = px(255, 255, 255, 255, 250, 250, 250, 255, 0, 0, 0, 255, 200, 200, 200, 255)
    applyColorKey(data, { color: '#ffffff', tolerance: 5, softness: 20 })
    expect(data[3]).toBe(0)
    expect(data[7]).toBe(0)
    expect(data[11]).toBe(255)
    expect(data[15]).toBeGreaterThan(0)
    expect(data[15]).toBeLessThan(255)
  })

  it('is off without colour or with zero tolerance and softness', () => {
    expect(layerColorKey(image())).toBeNull()
    expect(layerColorKey(image({ keyColor: '#00FF00', keyTolerance: 0, keySoftness: 0 }))).toBeNull()
    expect(layerColorKey(image({ keyColor: '#00FF00', keyTolerance: 10, keySoftness: 0 }))).toEqual({ color: '#00ff00', tolerance: 10, softness: 0 })
  })

  it('guesses the background from the corners, ignoring one odd corner', () => {
    const w = 10
    const h = 10
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set([0, 200, 0, 255], i * 4)
    data.set([255, 0, 0, 255], 0) // top-left corner pixel differs
    expect(pickKeyColor(data, w, h)).toBe('#00c800')
    expect(pickKeyColor(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull()
  })

  it('parses hex colours', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#102030')).toEqual([16, 32, 48])
  })
})

describe('adjustments', () => {
  it('neutral values need no processing', () => {
    expect(layerAdjustments(image())).toBeNull()
    expect(layerAdjustments(image({ ...NEUTRAL_ADJUSTMENTS }))).toBeNull()
    expect(cssFilter({ ...NEUTRAL_ADJUSTMENTS, brightness: 150, hue: 30 })).toBe('brightness(1.5) hue-rotate(30deg)')
  })

  it('matches the CSS filter formulas', () => {
    const d = px(100, 50, 200, 255)
    applyAdjustments(d, { ...NEUTRAL_ADJUSTMENTS, brightness: 200 })
    expect([...d.slice(0, 3)]).toEqual([200, 100, 255])

    const g = px(255, 0, 0, 255)
    applyAdjustments(g, { ...NEUTRAL_ADJUSTMENTS, grayscale: 100 })
    expect(g[0]).toBe(g[1])
    expect(g[1]).toBe(g[2])
    expect(g[0]).toBe(54)

    const s = px(255, 0, 0, 255)
    applyAdjustments(s, { ...NEUTRAL_ADJUSTMENTS, saturation: 0 })
    expect(s[0]).toBe(s[2])

    const c = px(200, 100, 128, 255)
    applyAdjustments(c, { ...NEUTRAL_ADJUSTMENTS, contrast: 0 })
    expect([...c.slice(0, 3)]).toEqual([128, 128, 128])

    const h = px(10, 20, 30, 255)
    applyAdjustments(h, { ...NEUTRAL_ADJUSTMENTS, hue: 360 })
    expect([...h.slice(0, 3)]).toEqual([10, 20, 30])
  })
})

describe('variant keys', () => {
  it('uses the plain asset id when nothing is processed and round-trips params', () => {
    expect(variantKey('abc', { key: null, adjust: null })).toBe('abc')
    const params = { key: { color: '#ffffff', tolerance: 10, softness: 5 }, adjust: null }
    const k = variantKey('abc', params)
    expect(k).not.toBe(variantKey('abc', { ...params, key: { ...params.key, tolerance: 11 } }))
    expect(parseVariantKey(k)).toEqual({ assetId: 'abc', params })
  })
})
