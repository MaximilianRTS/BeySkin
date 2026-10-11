import { ref } from 'vue'

export type ThemePref = 'system' | 'dark' | 'light'

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem('theme')
    if (v === 'dark' || v === 'light') return v
  } catch {
    // ignore
  }
  return 'system'
}

export const themePref = ref<ThemePref>(readPref())
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null

export function applyTheme() {
  const pref = themePref.value
  const light = pref === 'light' || (pref === 'system' && !!media?.matches)
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
}

media?.addEventListener('change', applyTheme)

export function setTheme(pref: ThemePref) {
  themePref.value = pref
  try {
    localStorage.setItem('theme', pref)
  } catch {
    // ignore
  }
  applyTheme()
}
