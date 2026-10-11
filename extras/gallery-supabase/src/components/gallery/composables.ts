import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEMPLATES, getTemplate } from '@/templates'
import { errorMessage, myLikes, toggleLike, type GalleryDesign } from '@/services/gallery'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/lib/toast'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Dialogs currently open, top-most last: only the top-most reacts to Escape / Tab. */
const dialogStack: symbol[] = []

/**
 * Accessibility basics for modal dialogs: moves focus into the dialog (element with
 * `data-autofocus` first), traps Tab, closes on Escape and restores focus afterwards.
 */
export function useDialog(root: Ref<HTMLElement | null>, close: () => void) {
  const id = Symbol('dialog')
  let previous: HTMLElement | null = null

  function focusables(): HTMLElement[] {
    return root.value ? Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
  }

  function onKeydown(e: KeyboardEvent) {
    if (dialogStack[dialogStack.length - 1] !== id) return
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !root.value?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !root.value?.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  onMounted(() => {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogStack.push(id)
    document.addEventListener('keydown', onKeydown)
    void nextTick(() => {
      const target = root.value?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? root.value
      target?.focus()
    })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    const i = dialogStack.indexOf(id)
    if (i >= 0) dialogStack.splice(i, 1)
    previous?.focus()
  })
}

/** Localised template name with a readable fallback for templates without a translation. */
export function useTemplateLabel() {
  const { t, te } = useI18n()
  return (templateId: string): string => {
    const key = getTemplate(templateId).i18nKey
    const path = `templates.${key}`
    return te(path) ? t(path) : templateId.replace(/_/g, ' ')
  }
}

export const TEMPLATE_IDS: readonly string[] = TEMPLATES.map((t) => t.id)

/** Shared like state for lists and the detail page (optimistic updates, login prompt). */
export function useLikes() {
  const { t } = useI18n()
  const auth = useAuthStore()
  const liked = ref(new Set<string>())
  const busy = ref(new Set<string>())
  const loginOpen = ref(false)

  async function load(ids: string[]) {
    if (!auth.user || ids.length === 0) return
    try {
      const mine = await myLikes(ids)
      liked.value = new Set([...liked.value, ...mine])
    } catch (err) {
      console.warn('likes failed', err)
    }
  }

  function reset() {
    liked.value = new Set()
  }

  async function toggle(design: GalleryDesign) {
    if (!auth.user) {
      loginOpen.value = true
      toast(t('gallery.likeNeedsLogin'), 'info')
      return
    }
    if (design.status !== 'published' || busy.value.has(design.id)) return
    const was = liked.value.has(design.id)
    const apply = (isLiked: boolean) => {
      const next = new Set(liked.value)
      if (isLiked) next.add(design.id)
      else next.delete(design.id)
      liked.value = next
    }
    busy.value = new Set(busy.value).add(design.id)
    apply(!was)
    design.likeCount = Math.max(0, design.likeCount + (was ? -1 : 1))
    try {
      await toggleLike(design.id, was)
    } catch (err) {
      apply(was)
      design.likeCount = Math.max(0, design.likeCount + (was ? 1 : -1))
      toast(errorMessage(err), 'error')
    } finally {
      const next = new Set(busy.value)
      next.delete(design.id)
      busy.value = next
    }
  }

  return { liked, loginOpen, load, reset, toggle }
}
