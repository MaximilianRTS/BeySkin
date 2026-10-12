import { describe, expect, it } from 'vitest'
import { normalizeHex, pushRecent, RECENT_MAX } from '../recentColors'

describe('recent colours', () => {
  it('puts the newest first without duplicates', () => {
    let list: string[] = []
    list = pushRecent(list, '#FF0000')
    list = pushRecent(list, '#00ff00')
    list = pushRecent(list, '#ff0000')
    expect(list).toEqual(['#ff0000', '#00ff00'])
  })

  it('is limited in length and ignores invalid values', () => {
    let list: string[] = []
    for (let i = 0; i < 20; i++) list = pushRecent(list, '#0000' + i.toString(16).padStart(2, '0'))
    expect(list).toHaveLength(RECENT_MAX)
    expect(list[0]).toBe('#000013')
    expect(pushRecent(list, 'red')).toEqual(list)
  })

  it('normalises short hex', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('javascript:1')).toBeNull()
  })
})
