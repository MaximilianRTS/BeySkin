import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** True when the build was configured with a Supabase project (see docs/SETUP-SUPABASE.md). */
export const galleryEnabled: boolean = Boolean(url && anonKey)

/**
 * Shared Supabase client, or null when the gallery is not configured – the rest of the
 * app (editor, export) works fully offline in that case.
 *
 * Auth notes for the hash router (createWebHashHistory):
 *  - PKCE puts the one-time `?code=` in the real query string (before the `#`), so it
 *    does not collide with `#/route` paths. The implicit flow would append
 *    `#access_token=…` and clobber the router hash, hence PKCE is mandatory here.
 *  - supabase-js exchanges the code on load (detectSessionInUrl) and removes it from the URL.
 *  - The redirect target must be `origin + pathname` (see {@link authRedirectUrl}) and be
 *    listed in the Supabase "Redirect URLs" allow-list.
 */
export const supabase: SupabaseClient | null =
  galleryEnabled && url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null

/** Where OAuth / magic-link e-mails send the user back to (no hash, no query). */
export function authRedirectUrl(): string {
  return window.location.origin + window.location.pathname
}
