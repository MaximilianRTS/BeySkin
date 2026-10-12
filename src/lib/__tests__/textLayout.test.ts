// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LINE_HEIGHT, layoutText } from '../textLayout'

/** Monospace stand-in: every character is 1 mm wide. */
const mono = (s: string) => [...s].length

describe('text layout', () => {
  it('keeps the plain box for text without effects', () => {
    const l = layoutText({ text: 'HELLO\nHI', fontSize: 5, align: 'left' }, mono)
    expect(l.w).toBe(5)
    expect(l.h).toBeCloseTo(2 * 5 * LINE_HEIGHT)
    expect(l.runs).toHaveLength(2)
    expect(l.runs[0]).toMatchObject({ text: 'HELLO', x: -2.5, rot: 0, align: 'left' })
  })

  it('adds letter spacing between letters only', () => {
    const l = layoutText({ text: 'ABCD', fontSize: 5, align: 'center', letterSpacing: 0.5 }, mono)
    expect(l.w).toBeCloseTo(4 + 3 * 0.5)
    expect(l.runs.map((r) => r.text)).toEqual(['A', 'B', 'C', 'D'])
    expect(l.runs[0].x).toBeCloseTo(-l.w / 2 + 0.5)
    expect(l.runs[3].x).toBeCloseTo(l.w / 2 - 0.5)
  })

  it('aligns spaced lines like plain text', () => {
    const l = layoutText({ text: 'ABCD\nAB', fontSize: 5, align: 'right', letterSpacing: 1 }, mono)
    const last = l.runs[l.runs.length - 1]
    expect(last.x + 0.5).toBeCloseTo(l.w / 2)
  })

  it('bends text upwards for positive curve (rainbow)', () => {
    const l = layoutText({ text: 'ABCDEFGHIJ', fontSize: 2, align: 'center', curve: 180 }, mono)
    const first = l.runs[0]
    const mid = l.runs[5]
    const last = l.runs[9]
    // Ends lower than the middle, rotated towards the outside, symmetric.
    expect(first.y).toBeGreaterThan(mid.y)
    expect(first.rot).toBeLessThan(0)
    expect(last.rot).toBeCloseTo(-first.rot)
    expect(first.x).toBeCloseTo(-last.x)
    // Semicircle over 10 mm: radius = 10 / π, so the box is ~2R wide (plus letter size).
    const R = 10 / Math.PI
    expect(l.w).toBeGreaterThan(2 * R)
    expect(l.w).toBeLessThan(2 * R + 2 * LINE_HEIGHT * 2)
    expect(l.h).toBeGreaterThan(R)
    expect(l.h).toBeLessThan(R + 2 * LINE_HEIGHT * 2)
  })

  it('bends downwards for negative curve (smile)', () => {
    const l = layoutText({ text: 'ABCDEFGHIJ', fontSize: 2, align: 'center', curve: -120 }, mono)
    expect(l.runs[0].y).toBeLessThan(l.runs[5].y)
    expect(l.runs[0].rot).toBeGreaterThan(0)
  })

  it('centres the box on the letters', () => {
    const l = layoutText({ text: 'CURVED TEXT', fontSize: 3, align: 'left', curve: 90 }, mono)
    const xs = l.runs.map((r) => r.x)
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 5)
    for (const r of l.runs) {
      expect(Math.abs(r.x)).toBeLessThanOrEqual(l.w / 2)
      expect(Math.abs(r.y)).toBeLessThanOrEqual(l.h / 2)
    }
  })

  it('sets multiple lines on concentric arcs', () => {
    const l = layoutText({ text: 'TOP\nBOTTOM', fontSize: 2, align: 'center', curve: 60 }, mono)
    const top = l.runs.find((r) => r.text === 'O')!
    const bottom = l.runs.find((r) => r.text === 'M')!
    expect(top.y).toBeLessThan(bottom.y)
    expect(l.runs).toHaveLength(9)
  })

  it('treats a tiny curve as straight', () => {
    const l = layoutText({ text: 'AB', fontSize: 5, align: 'center', curve: 0.1 }, mono)
    expect(l.runs).toHaveLength(1)
  })
})
