import { BATTLE_PASS_OUTLINE } from './battlepassOutline'
import { buildCustomTemplate, formatMm, parseCustomId } from './custom'
import { ellipse, roundedRect } from './geometry'
import type { StickerTemplate, TemplateCategory } from './types'

export type { Point, StickerTemplate, TemplateCategory, PreviewModel, CustomShape, CustomSpec } from './types'
export { ellipse, roundedRect } from './geometry'
export { CUSTOM_MAX_MM, CUSTOM_MIN_MM, customTemplateId, formatMm, normalizeCustomSpec, parseCustomId } from './custom'

/** Default safe margin inside the cut line when a template does not set `safeMm`. */
export const DEFAULT_SAFE_MM = 1.5

export const TEMPLATES: StickerTemplate[] = [
  {
    id: 'battlepass',
    i18nKey: 'battlepass',
    category: 'battlepass',
    widthMm: 111.55,
    heightMm: 25.64,
    outline: BATTLE_PASS_OUTLINE,
    measured: true,
    previewModel: 'battlepass',
    safeMm: 1.5,
  },
  {
    // Gear Chip sticker on top of a Bey, print size 17.1 mm (measured by the user).
    id: 'gear_chip',
    i18nKey: 'gear_chip',
    category: 'bey',
    widthMm: 17.1,
    heightMm: 17.1,
    outline: ellipse(17.1, 17.1, 128),
    measured: true,
    previewModel: 'chip',
    safeMm: 1,
  },
  {
    // Tournament name badge / player card: ISO/IEC 7810 ID-1 (credit card size),
    // 85.60 x 53.98 mm with 3.18 mm corners – a standard, so it counts as measured.
    id: 'player_card',
    i18nKey: 'player_card',
    category: 'accessories',
    widthMm: 85.6,
    heightMm: 53.98,
    outline: roundedRect(85.6, 53.98, 3.18),
    measured: true,
    previewModel: 'flat',
    safeMm: 2,
  },
  {
    // ESTIMATE, not measured: label for the flat side of a Beyblade X string launcher.
    // Assumed 42 x 16 mm with 3 mm corners; replace once someone measures a real launcher.
    id: 'launcher_x',
    i18nKey: 'launcher_x',
    category: 'accessories',
    widthMm: 42,
    heightMm: 16,
    outline: roundedRect(42, 16, 3),
    measured: false,
    previewModel: 'flat',
    safeMm: 1.5,
  },
  {
    // ESTIMATE, not measured: lid label for a Beyblade X deck case.
    // Assumed 60 x 35 mm with 3 mm corners; replace once someone measures a real case.
    id: 'deck_case',
    i18nKey: 'deck_case',
    category: 'accessories',
    widthMm: 60,
    heightMm: 35,
    outline: roundedRect(60, 35, 3),
    measured: false,
    previewModel: 'flat',
    safeMm: 2,
  },
  {
    // Generic round label, common punch / sticker sheet size.
    id: 'round_25',
    i18nKey: 'round_25',
    category: 'generic',
    widthMm: 25,
    heightMm: 25,
    outline: ellipse(25, 25, 128),
    measured: true,
    previewModel: 'flat',
    safeMm: 1.5,
  },
  {
    id: 'round_40',
    i18nKey: 'round_40',
    category: 'generic',
    widthMm: 40,
    heightMm: 40,
    outline: ellipse(40, 40, 128),
    measured: true,
    previewModel: 'flat',
    safeMm: 2,
  },
]

export const DEFAULT_TEMPLATE_ID = 'battlepass'

/** Display order of the categories in the template picker. */
export const CATEGORY_ORDER: TemplateCategory[] = ['battlepass', 'bey', 'accessories', 'generic', 'custom']

/** Custom templates are built on demand; the cache keeps one object per id. */
const customCache = new Map<string, StickerTemplate>()
const CUSTOM_CACHE_LIMIT = 200

function customTemplate(id: string): StickerTemplate | undefined {
  let tpl = customCache.get(id)
  if (tpl) return tpl
  const spec = parseCustomId(id)
  if (!spec) return undefined
  tpl = buildCustomTemplate(spec)
  if (customCache.size >= CUSTOM_CACHE_LIMIT) customCache.delete(customCache.keys().next().value!)
  customCache.set(id, tpl)
  return tpl
}

/** Built-in or custom template; unknown ids fall back to the default template. */
export function getTemplate(id: string): StickerTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? customTemplate(id) ?? TEMPLATES[0]
}

/** True for built-in ids and canonical custom ids (`custom-rect-60x40-r3`, …). */
export function isTemplateId(id: unknown): id is string {
  return typeof id === 'string' && (TEMPLATES.some((t) => t.id === id) || parseCustomId(id) !== null)
}

export function isCustomTemplateId(id: string): boolean {
  return !TEMPLATES.some((t) => t.id === id) && parseCustomId(id) !== null
}

/** Safe margin inside the cut line in mm. */
export function safeMargin(tpl: StickerTemplate): number {
  return tpl.safeMm ?? DEFAULT_SAFE_MM
}

type Translate = (key: string, named: Record<string, unknown>) => string

/**
 * Localised display name. Custom sizes include their dimensions; plain
 * t(`templates.${i18nKey}`) also works for them and yields the generic name.
 */
export function templateName(t: Translate, tpl: StickerTemplate): string {
  if (!tpl.custom) return t(`templates.${tpl.i18nKey}`, {})
  const key = tpl.custom.shape === 'ellipse' ? 'templates.custom_name_ellipse' : 'templates.custom_name'
  return t(key, { w: formatMm(tpl.widthMm), h: formatMm(tpl.heightMm) })
}
