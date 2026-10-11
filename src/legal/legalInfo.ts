import { CONTACT_EMAIL as CONFIG_CONTACT_EMAIL } from '@/config'

/**
 * Operator data used on all legal pages. Fill in the placeholders before going live.
 * The contact e-mail comes from VITE_CONTACT_EMAIL (see src/config.ts).
 */
export const OPERATOR_NAME = 'Maximilian Reitsberger'
export const OPERATOR_ADDRESS = 'Baldhamerstraße 99, 85591 Vaterstetten'
export const CONTACT_EMAIL: string = CONFIG_CONTACT_EMAIL
/** Shown instead of the e-mail address while VITE_CONTACT_EMAIL is not set. */
export const CONTACT_EMAIL_PLACEHOLDER = '[E-Mail-Adresse – bitte eintragen]'

/** Static hosting provider. Change these when moving (e.g. to Cloudflare Pages). */
export const HOSTING_PROVIDER = 'GitHub Pages (GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA)'
export const HOSTING_PROVIDER_SHORT = 'GitHub Pages'
export const HOSTING_PRIVACY_URL = 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'

/** Competent data protection supervisory authority (depends on the operator's federal state). */
export const SUPERVISORY_AUTHORITY =
  'Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, www.lda.bayern.de'

/** ISO date of the last revision of the legal texts. */
export const LAST_UPDATED = '2026-10-12'

export function formatLastUpdated(locale: 'de' | 'en'): string {
  const [y, m, d] = LAST_UPDATED.split('-').map(Number)
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}
