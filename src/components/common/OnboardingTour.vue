<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { markTourSeen, tourOpen, tourSeen } from '@/lib/onboarding'

/**
 * Three-step intro on the first visit of the editor. Each step points at an element marked
 * with data-tour="…" in EditorView; if it is hidden (mobile tabs), the bubble is centred.
 */
const { t } = useI18n()

const STEPS = [
  { target: 'templates', title: 'onboarding.step_template_title', text: 'onboarding.step_template_text' },
  { target: 'add-image', title: 'onboarding.step_add_title', text: 'onboarding.step_add_text' },
  { target: 'library', title: 'onboarding.step_print_title', text: 'onboarding.step_print_text' },
] as const

const step = ref(0)
const current = computed(() => STEPS[step.value])
const isLast = computed(() => step.value === STEPS.length - 1)
/** Real UI labels, so the text matches the buttons in every language. */
const labels = computed(() => ({
  tab: t('editor.tab_templates'),
  image: t('editor.add_image'),
  library: t('library.title'),
  export: t('editor.export'),
}))

const bubble = ref<HTMLDivElement>()
const nextBtn = ref<HTMLButtonElement>()
const target = ref<DOMRect | null>(null)
const pos = ref<{ top: number; left: number } | null>(null)
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const PAD = 6
const GAP = 12
const EDGE = 8

function findTarget(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${current.value.target}"]`)
  if (!el || !el.offsetParent) return null
  const r = el.getBoundingClientRect()
  return r.width && r.height ? el : null
}

/** Places the bubble below, above, right or left of the target – whichever fits first. */
function layout() {
  const el = findTarget()
  const b = bubble.value
  if (!el || !b) {
    target.value = null
    pos.value = null
    return
  }
  const r = el.getBoundingClientRect()
  target.value = r
  const bw = b.offsetWidth
  const bh = b.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))
  const centreX = clamp(r.left + r.width / 2 - bw / 2, EDGE, vw - bw - EDGE)
  const centreY = clamp(r.top + r.height / 2 - bh / 2, EDGE, vh - bh - EDGE)
  if (r.bottom + PAD + GAP + bh <= vh - EDGE) pos.value = { top: r.bottom + PAD + GAP, left: centreX }
  else if (r.top - PAD - GAP - bh >= EDGE) pos.value = { top: r.top - PAD - GAP - bh, left: centreX }
  else if (r.right + PAD + GAP + bw <= vw - EDGE) pos.value = { top: centreY, left: r.right + PAD + GAP }
  else if (r.left - PAD - GAP - bw >= EDGE) pos.value = { top: centreY, left: r.left - PAD - GAP - bw }
  else pos.value = null // no room next to it (e.g. huge panel): centre the bubble
}

let frame = 0
function scheduleLayout() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(layout)
}

async function showStep() {
  await nextTick()
  findTarget()?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  layout()
  nextBtn.value?.focus({ preventScroll: true })
  // Smooth scrolling moves the target after the first measurement.
  if (!reducedMotion) setTimeout(scheduleLayout, 350)
}

let returnFocus: HTMLElement | null = null
function open() {
  step.value = 0
  returnFocus = document.activeElement as HTMLElement | null
  window.addEventListener('resize', scheduleLayout)
  window.addEventListener('scroll', scheduleLayout, true)
  window.addEventListener('keydown', onKey, true)
  void showStep()
}
function close() {
  markTourSeen()
  tourOpen.value = false
}
function teardown() {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', scheduleLayout)
  window.removeEventListener('scroll', scheduleLayout, true)
  window.removeEventListener('keydown', onKey, true)
}

function next() {
  if (isLast.value) return close()
  step.value++
  void showStep()
}
function back() {
  if (step.value === 0) return
  step.value--
  void showStep()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopImmediatePropagation()
    close()
    return
  }
  const inside = !!bubble.value?.contains(document.activeElement)
  if (inside && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.key === 'ArrowRight') next()
    else back()
  } else if (e.key === 'Tab' && bubble.value) {
    // Keep keyboard focus inside the bubble while the tour is open.
    const items = [...bubble.value.querySelectorAll<HTMLElement>('button:not([disabled])')]
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    e.preventDefault()
    e.stopImmediatePropagation()
    const n = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length
    items[n].focus()
  }
}

watch(tourOpen, (v) => {
  if (v) open()
  else {
    teardown()
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    returnFocus = null
  }
})

let autoTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (tourOpen.value) return open()
  // First visit: wait until the editor has settled (fonts, panels) and no dialog is open.
  if (!tourSeen()) {
    autoTimer = setTimeout(() => {
      if (!document.querySelector('.dialog-backdrop')) tourOpen.value = true
    }, 800)
  }
})
onBeforeUnmount(() => {
  clearTimeout(autoTimer)
  teardown()
  tourOpen.value = false
})

const ringStyle = computed(() => {
  const r = target.value
  if (!r) return undefined
  return { top: `${r.top - PAD}px`, left: `${r.left - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` }
})
const bubbleStyle = computed(() => (pos.value ? { top: `${pos.value.top}px`, left: `${pos.value.left}px` } : undefined))
</script>

<template>
  <Teleport to="body">
    <div v-if="tourOpen" class="tour" :class="{ 'no-motion': reducedMotion }">
      <div v-if="!ringStyle" class="tour-dim" />
      <div v-else class="tour-ring" :style="ringStyle" />
      <div
        ref="bubble"
        class="tour-bubble card"
        :class="{ centred: !bubbleStyle }"
        :style="bubbleStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
      >
        <p class="tour-progress">{{ t('onboarding.progress', { n: step + 1, total: STEPS.length }) }}</p>
        <h2 id="tour-title" class="tour-title">{{ t(current.title) }}</h2>
        <p id="tour-text" class="tour-text">{{ t(current.text, labels) }}</p>
        <div class="tour-dots" aria-hidden="true">
          <span v-for="(_, i) in STEPS" :key="i" :class="{ on: i === step }" />
        </div>
        <div class="tour-actions">
          <button class="btn btn-sm btn-ghost" @click="close">{{ t('onboarding.skip') }}</button>
          <span class="spacer" />
          <button v-if="step > 0" class="btn btn-sm" @click="back">{{ t('onboarding.back') }}</button>
          <button ref="nextBtn" class="btn btn-sm btn-primary" @click="next">
            {{ isLast ? t('onboarding.done') : t('onboarding.next') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-dim {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
/* Highlight ring; its huge shadow dims the rest of the page without blocking it. */
.tour-ring {
  position: fixed;
  z-index: 150;
  border: 2px solid var(--accent);
  border-radius: var(--radius-sm);
  box-shadow:
    0 0 0 4px var(--accent-soft),
    0 0 0 9999px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  transition: top 0.25s, left 0.25s, width 0.25s, height 0.25s;
}
.tour-bubble {
  position: fixed;
  z-index: 160;
  width: min(330px, calc(100vw - 16px));
  padding: 14px 16px 12px;
  box-shadow: var(--shadow);
  border-color: var(--accent-border);
  transition: top 0.25s, left 0.25s;
}
.tour-bubble.centred {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.no-motion .tour-ring,
.no-motion .tour-bubble {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .tour-ring,
  .tour-bubble {
    transition: none;
  }
}
.tour-progress {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-hover);
}
.tour-title {
  font-size: 17px;
  margin: 0 0 6px;
}
.tour-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
.tour-dots {
  display: flex;
  gap: 5px;
  margin: 12px 0 10px;
}
.tour-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-strong);
}
.tour-dots span.on {
  width: 16px;
  border-radius: 3px;
  background: var(--accent);
}
.tour-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
