import { createStore, get, set } from 'idb-keyval'

// Internal IndexedDB name from the pre-release name – kept so saved designs survive the rename.
const store = createStore('spinlabel', 'state')

export async function loadState<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, store)
  } catch (err) {
    console.warn('[persist] load failed', key, err)
    return undefined
  }
}

export async function saveState<T>(key: string, value: T): Promise<boolean> {
  try {
    await set(key, value, store)
    return true
  } catch (err) {
    console.warn('[persist] save failed', key, err)
    return false
  }
}

/** Debounced saver that also flushes when the tab is hidden or closed. */
export function createAutosave<T>(key: string, getValue: () => T, delay = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    return saveState(key, JSON.parse(JSON.stringify(getValue())) as T)
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => timer && void flush())
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && timer && void flush())
  }
  return { schedule, flush }
}
