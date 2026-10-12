import { describe, expect, it } from 'vitest'
import { makeQr, qrSvg } from '../qr'

describe('qr', () => {
  it('encodes a share link with a 4-module quiet zone', () => {
    const qr = makeQr('https://example.com/BeySkin/#/s/abc123')
    // Version 1 is 21 modules; the border adds 4 on every side.
    expect(qr.size).toBeGreaterThanOrEqual(21 + 8)
    expect(qr.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/)
    expect(qrSvg(qr)).toContain('fill="#fff"')
  })

  it('throws for data beyond QR capacity', () => {
    expect(() => makeQr('x'.repeat(5000))).toThrow()
  })
})
