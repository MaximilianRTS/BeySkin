// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeDesign, encodeDesign } from '../share'
import { sanitizeDesign } from '../projectFile'
import { IMAGE_ADJUST_DEFAULTS, newDesign, normalizeDesign, TEXT_EFFECT_DEFAULTS, type Design, type ImageLayer, type TextLayer } from '../model'

const base = { visible: true, locked: false, opacity: 1, blend: 'source-over' as const, rotation: 0, flipX: false, flipY: false }

function oldText(): TextLayer {
  return { ...base, id: 't', name: 'T', type: 'text', x: 10, y: 10, text: 'HI', fontFamily: 'Bangers', fontSize: 6, bold: false, italic: false, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, align: 'center' }
}
function oldImage(): ImageLayer {
  return { ...base, id: 'i', name: 'I', type: 'image', x: 10, y: 10, assetId: 'a1', naturalWidth: 100, naturalHeight: 50, width: 20 }
}

describe('effect fields compatibility', () => {
  it('normalizeDesign fills neutral defaults for old layers', () => {
    const d = newDesign('battlepass')
    d.layers = [oldText(), oldImage()]
    normalizeDesign(d)
    expect(d.layers[0]).toMatchObject(TEXT_EFFECT_DEFAULTS)
    expect(d.layers[1]).toMatchObject(IMAGE_ADJUST_DEFAULTS)
  })

  it('sanitizes and clamps untrusted effect values', () => {
    const d = sanitizeDesign(
      {
        templateId: 'battlepass',
        layers: [
          { ...oldText(), letterSpacing: 999, curve: -9999, shadowColor: 'url(x)', shadowBlur: -3, glowColor: '#00ff00', glowSize: 'big' },
          { ...oldImage(), brightness: 1e9, hue: 720, grayscale: -5, keyColor: '#ABCDEF', keyTolerance: 150, keySoftness: NaN },
        ],
      },
      new Set(['a1']),
    )
    const t = d.layers[0] as TextLayer
    expect(t.letterSpacing).toBe(50)
    expect(t.curve).toBe(-360)
    expect(t.shadowColor).toBeNull()
    expect(t.shadowBlur).toBe(0)
    expect(t.glowColor).toBe('#00ff00')
    expect(t.glowSize).toBe(TEXT_EFFECT_DEFAULTS.glowSize)
    const i = d.layers[1] as ImageLayer
    expect(i.brightness).toBe(200)
    expect(i.hue).toBe(180)
    expect(i.grayscale).toBe(0)
    expect(i.keyColor).toBe('#ABCDEF')
    expect(i.keyTolerance).toBe(100)
    expect(i.keySoftness).toBe(IMAGE_ADJUST_DEFAULTS.keySoftness)
  })

  it('share links stay short with effects off and keep effects that are on', async () => {
    const plain: Design = newDesign('battlepass')
    plain.layers = [oldText(), oldImage()]
    const withDefaults: Design = newDesign('battlepass')
    withDefaults.layers = [{ ...oldText(), ...TEXT_EFFECT_DEFAULTS }, { ...oldImage(), ...IMAGE_ADJUST_DEFAULTS }]
    expect((await encodeDesign(withDefaults)).length).toBe((await encodeDesign(plain)).length)

    const fx: Design = newDesign('battlepass')
    fx.layers = [
      { ...oldText(), ...TEXT_EFFECT_DEFAULTS, curve: 120, letterSpacing: 0.3, shadowColor: '#112233', shadowX: 1 },
      { ...oldImage(), ...IMAGE_ADJUST_DEFAULTS, saturation: 150, keyColor: '#ffffff', keyTolerance: 30 },
    ]
    const back = await decodeDesign(await encodeDesign(fx))
    expect(back.layers[0]).toMatchObject({ curve: 120, letterSpacing: 0.3, shadowColor: '#112233', shadowX: 1, shadowY: TEXT_EFFECT_DEFAULTS.shadowY, glowColor: null })
    expect(back.layers[1]).toMatchObject({ saturation: 150, keyColor: '#ffffff', keyTolerance: 30, keySoftness: IMAGE_ADJUST_DEFAULTS.keySoftness, brightness: 100 })
  })
})
