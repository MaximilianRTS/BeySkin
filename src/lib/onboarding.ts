import { ref } from 'vue'

const DONE_KEY = 'onboarding-done'

/** Open state of the editor tour (components/common/OnboardingTour.vue). */
export const tourOpen = ref(false)

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    // storage blocked: don't nag on every visit
    return true
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // ignore
  }
}

/** Restarts the tour (help button in the header). */
export function startTour() {
  tourOpen.value = true
}
