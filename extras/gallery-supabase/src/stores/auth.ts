import type { User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { FORBIDDEN_TEXT_CHARS, RPC, T_PROFILES } from '@/services/gallery'
import { authRedirectUrl, galleryEnabled, supabase } from '@/services/supabase'

export type OAuthProvider = 'discord' | 'google'

export interface Profile {
  id: string
  displayName: string
}

export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 24

export function isValidDisplayName(name: string): boolean {
  const n = name.trim()
  // Same rules as the check constraints on sticker_profiles.display_name.
  // Length is counted in code points like Postgres char_length().
  const len = [...n].length
  return len >= DISPLAY_NAME_MIN && len <= DISPLAY_NAME_MAX && !FORBIDDEN_TEXT_CHARS.test(n)
}

/** Session + profile of the signed-in gallery user. Does nothing when the gallery is disabled. */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const isAdmin = ref(false)
  /** True once the initial session lookup finished (signed in or not). */
  const ready = ref(false)

  const signedIn = computed(() => user.value !== null)
  const displayName = computed(() => profile.value?.displayName ?? '')

  async function loadProfile() {
    const sb = supabase
    const u = user.value
    if (!sb || !u) {
      profile.value = null
      isAdmin.value = false
      return
    }
    const [p, admin] = await Promise.all([
      sb.from(T_PROFILES).select('id, display_name').eq('id', u.id).maybeSingle(),
      sb.rpc(RPC.isAdmin, { uid: u.id }),
    ])
    // The user may have signed out while the requests were in flight.
    if (user.value?.id !== u.id) return
    const row = p.data as { id: string; display_name: string } | null
    profile.value = row ? { id: row.id, displayName: row.display_name } : null
    isAdmin.value = admin.data === true
  }

  let initPromise: Promise<void> | null = null

  /** Idempotent; safe to call from App.vue and from views. */
  function init(): Promise<void> {
    initPromise ??= (async () => {
      const sb = supabase
      if (!sb) {
        ready.value = true
        return
      }
      try {
        const { data } = await sb.auth.getSession()
        user.value = data.session?.user ?? null
        await loadProfile()
      } catch (err) {
        console.warn('auth init failed', err)
      } finally {
        ready.value = true
      }
      sb.auth.onAuthStateChange((event, session) => {
        const next = session?.user ?? null
        const changed = next?.id !== user.value?.id
        user.value = next
        if (event === 'TOKEN_REFRESHED' && !changed) return
        // Never await supabase calls inside this callback (it can deadlock the auth lock).
        setTimeout(() => void loadProfile().catch((err) => console.warn('profile load failed', err)), 0)
      })
    })()
    return initPromise
  }

  async function signInWithOAuth(provider: OAuthProvider) {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUrl() } })
    if (error) throw error
  }

  /** Sends a magic link. Open it in the SAME browser (PKCE keeps the verifier in local storage). */
  async function signInWithEmail(email: string) {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: true },
    })
    if (error) throw error
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
    profile.value = null
    isAdmin.value = false
  }

  async function updateDisplayName(name: string) {
    const n = name.trim()
    if (!supabase || !user.value || !isValidDisplayName(n)) throw new Error('invalid_input')
    const { error } = await supabase.from(T_PROFILES).update({ display_name: n }).eq('id', user.value.id)
    if (error) throw error
    profile.value = { id: user.value.id, displayName: n }
  }

  return {
    enabled: galleryEnabled,
    user,
    profile,
    isAdmin,
    ready,
    signedIn,
    displayName,
    init,
    signInWithOAuth,
    signInWithEmail,
    signOut,
    updateDisplayName,
  }
})
