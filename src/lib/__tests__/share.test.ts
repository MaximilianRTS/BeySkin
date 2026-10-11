// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeDesign, encodeDesign } from '../share'
import { newDesign, type Design } from '../model'

function sample(): Design {
  const d = newDesign('battlepass', 'Dragon')
  const base = { visible: true, locked: false, opacity: 1, blend: 'source-over' as const, rotation: 0, flipX: false, flipY: false }
  d.layers = [
    { ...base, id: 'a', name: 'BG', type: 'fill', x: 0, y: 0, color: '#112233', color2: '#ff0000', angle: 30, pattern: 'stripes', patternScale: 3 },
    { ...base, id: 'b', name: 'Photo', type: 'image', x: 50.123, y: 12, rotation: 12.345, assetId: 'abc123', naturalWidth: 1600, naturalHeight: 400, width: 111.55 },
    { ...base, id: 'c', name: 'Bolt', type: 'shape', x: 90, y: 10, shapeId: 'lightning', width: 18, color: '#ffd23f', strokeColor: '#000000', strokeWidth: 0.4 },
    { ...base, id: 'd', name: 'Hi', type: 'text', x: 30, y: 12, text: 'HELLO\nWORLD', fontFamily: 'Bangers', fontSize: 8, bold: true, italic: false, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0.4, align: 'center', opacity: 0.8 },
  ]
  return d
}

describe('share links', () => {
  it('round-trips a design and turns images into placeholders', async () => {
    const data = await encodeDesign(sample())
    expect(data).toMatch(/^1[A-Za-z0-9_-]+$/)
    expect(data.length).toBeLessThan(1000)
    const d = await decodeDesign(data)
    expect(d.templateId).toBe('battlepass')
    expect(d.name).toBe('Dragon')
    expect(d.layers.map((l) => l.type)).toEqual(['fill', 'image', 'shape', 'text'])
    const img = d.layers[1]
    expect(img.type === 'image' && img.assetId).toBe('')
    expect(img.rotation).toBeCloseTo(12.35, 2)
    const text = d.layers[3]
    expect(text.type === 'text' && text.text).toBe('HELLO\nWORLD')
    expect(text.opacity).toBe(0.8)
    const fill = d.layers[0]
    expect(fill.type === 'fill' && fill.pattern).toBe('stripes')
  })

  it('rejects garbage and hostile payloads', async () => {
    await expect(decodeDesign('')).rejects.toThrow()
    await expect(decodeDesign('2abc')).rejects.toThrow()
    await expect(decodeDesign('1$$$')).rejects.toThrow()
    await expect(decodeDesign('1' + 'A'.repeat(300_000))).rejects.toThrow()
  })

  it('sanitizes values coming from a link', async () => {
    const d = sample()
    const text = d.layers[3]
    if (text.type === 'text') text.color = 'javascript:alert(1)'
    const back = await decodeDesign(await encodeDesign(d))
    const t2 = back.layers[3]
    expect(t2.type === 'text' && t2.color).toBe('#ffffff')
  })
})
