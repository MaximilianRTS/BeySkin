// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every locale must contain exactly the keys of the English reference and keep
 * all {placeholders}. vue-i18n syntax characters (@ | { }) are only allowed as
 * placeholders or escaped literals like {'@'}.
 */
const ROOT = join(__dirname, '..', 'locales')
const REFERENCE = 'en'

type Dict = Record<string, unknown>
function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Dict, key))
    else out[key] = String(v)
  }
  return out
}

function load(lang: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(join(ROOT, lang))) {
    if (!file.endsWith('.json')) continue
    const ns = file.replace(/\.json$/, '')
    Object.assign(out, flatten(JSON.parse(readFileSync(join(ROOT, lang, file), 'utf8')), ns))
  }
  return out
}

const placeholders = (s: string) => (s.match(/\{[a-z_]+\}/gi) ?? []).sort()
const ref = load(REFERENCE)
const langs = readdirSync(ROOT).filter((d) => d !== REFERENCE)

describe.each(langs)('locale %s', (lang) => {
  const msgs = load(lang)
  it('has every key of the reference and no extras', () => {
    expect(Object.keys(msgs).sort()).toEqual(Object.keys(ref).sort())
  })
  it('keeps placeholders', () => {
    for (const [key, value] of Object.entries(ref)) {
      if (msgs[key] === undefined) continue
      expect(placeholders(msgs[key]), key).toEqual(placeholders(value))
    }
  })
  it('has no unescaped vue-i18n syntax characters', () => {
    for (const [key, value] of Object.entries(msgs)) {
      const stripped = value.replace(/\{'[^']*'\}/g, '').replace(/\{[a-z_]+\}/gi, '')
      expect(/[@|{}]/.test(stripped), `${key}: ${value}`).toBe(false)
    }
  })
  it('is not left in English', () => {
    if (lang === 'de') return
    const same = Object.entries(msgs).filter(([k, v]) => v === ref[k] && v.length > 12)
    // Some technical strings (e.g. "PNG · 300 dpi") may legitimately stay identical.
    expect(same.length, same.map(([k]) => k).join(', ')).toBeLessThan(Object.keys(ref).length * 0.08)
  })
})
