import { ref } from 'vue'

/** Chromium-only event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
/** True while the browser offers installing the app (shows the header button). */
export const canInstall = ref(false)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the native mini-infobar away; the header button triggers the prompt instead.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    canInstall.value = false
  })
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null
  canInstall.value = false
  await ev.prompt()
  return (await ev.userChoice).outcome === 'accepted'
}
