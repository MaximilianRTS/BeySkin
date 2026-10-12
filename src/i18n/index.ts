import { createI18n, type LocaleMessageDictionary, type VueMessageType } from 'vue-i18n'

/**
 * Messages live in src/i18n/locales/<lang>/<namespace>.json and are merged
 * under their namespace, e.g. locales/de/gallery.json → t('gallery.title').
 */
const modules = import.meta.glob<{ default: LocaleMessageDictionary<VueMessageType> }>('./locales/*/*.json', { eager: true })

const messages: Record<string, Record<string, LocaleMessageDictionary<VueMessageType>>> = {}
for (const [path, mod] of Object.entries(modules)) {
  const [, lang, ns] = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)!
  messages[lang] ??= {}
  messages[lang][ns] = mod.default
}

/** Native names are shown in the language menu (never translated). */
export const LOCALE_NAMES = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ja: '日本語',
} as const
export type Locale = keyof typeof LOCALE_NAMES
export const SUPPORTED_LOCALES = Object.keys(LOCALE_NAMES) as Locale[]

function isLocale(v: string): v is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(v)
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('locale')
    if (saved && isLocale(saved)) return saved
  } catch {
    // storage blocked (private mode) – fall through to browser language
  }
  // Some privacy modes report an empty list; navigator.language is still set there.
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const lang of preferred) {
    if (!lang) continue
    const base = lang.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages,
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem('locale', locale)
  } catch {
    // ignore
  }
}
