import { ref } from 'vue'

/** Recently used colours, shared by every colour field and kept in localStorage. */

export const RECENT_MAX = 10
const STORAGE_KEY = 'beyskin-recent-colors'
const HEX_RE = /^#[0-9a-f]{6}$/

/** Lower-case #rrggbb, or null for anything else. */
export function normalizeHex(v: string): string | null {
  let c = v.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(c)) c = '#' + [...c.slice(1)].map((x) => x + x).join('')
  return HEX_RE.test(c) ? c : null
}

/** New list with `color` in front, without duplicates, at most `max` long. */
export function pushRecent(list: readonly string[], color: string, max = RECENT_MAX): string[] {
  const c = normalizeHex(color)
  if (!c) return [...list]
  return [c, ...list.filter((x) => x !== c)].slice(0, max)
}

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.reduceRight<string[]>((acc, v) => (typeof v === 'string' ? pushRecent(acc, v) : acc), [])
  } catch {
    return []
  }
}

export const recentColors = ref<string[]>(load())

export function recordColor(color: string) {
  const next = pushRecent(recentColors.value, color)
  if (next.join() === recentColors.value.join()) return
  recentColors.value = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage blocked (private mode) – keep the list for this session only
  }
}
