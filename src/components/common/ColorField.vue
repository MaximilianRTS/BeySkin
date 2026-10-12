<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeHex, recentColors, recordColor } from '@/lib/recentColors'

/**
 * Colour input with eyedropper and recently used colours. Emits `input` while
 * picking (live preview) and `commit` once a colour is chosen (one undo step).
 */
const props = defineProps<{ value: string; label?: string; ariaLabel?: string }>()
const emit = defineEmits<{ input: [v: string]; commit: [] }>()
const { t } = useI18n()
const id = useId()
const popId = useId()

interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>
}
const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

const open = ref(false)
const root = ref<HTMLElement>()
const toggle = ref<HTMLButtonElement>()
const pop = ref<HTMLElement>()
const showToggle = computed(() => hasEyeDropper || recentColors.value.length > 0)
const name = computed(() => props.ariaLabel ?? props.label ?? t('editor.color'))

function apply(color: string) {
  const c = normalizeHex(color)
  if (!c) return
  emit('input', c)
  emit('commit')
  recordColor(c)
}

function onChange(e: Event) {
  emit('commit')
  recordColor((e.target as HTMLInputElement).value)
}

/** sRGBHex is '#rrggbb' in current browsers; older ones returned 'rgb(r, g, b)'. */
function toHex(v: string): string {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v)
  return m ? '#' + m.slice(1, 4).map((x) => (+x).toString(16).padStart(2, '0')).join('') : v
}

async function pickFromScreen() {
  close(false)
  try {
    const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperApi }).EyeDropper
    const res = await new Ctor().open()
    apply(toHex(res.sRGBHex))
  } catch {
    // cancelled with Escape
  }
}

function choose(color: string) {
  apply(color)
  close(true)
}

function close(refocus: boolean) {
  open.value = false
  if (refocus) toggle.value?.focus()
}

async function onToggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    pop.value?.querySelector<HTMLButtonElement>('button')?.focus()
  }
}

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) close(false)
}
watch(open, (v) => {
  if (v) document.addEventListener('pointerdown', onOutside, true)
  else document.removeEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="root" class="color-field" @keydown.esc.stop="open && close(true)">
    <input :id="id" type="color" :value="value" :aria-label="name"
      @input="emit('input', ($event.target as HTMLInputElement).value)" @change="onChange" />
    <button v-if="showToggle" ref="toggle" type="button" class="more" :title="t('effects.color_more')" :aria-label="t('effects.color_more')"
      aria-haspopup="true" :aria-expanded="open" :aria-controls="popId" @click="onToggle">
      <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
    </button>
    <label v-if="label" :for="id">{{ label }}</label>
    <div v-if="open" :id="popId" ref="pop" class="pop" role="group" :aria-label="t('effects.color_more')">
      <button v-if="hasEyeDropper" type="button" class="btn btn-sm eyedrop" @click="pickFromScreen">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 22l1-1h3l9-9 M3 21v-3l9-9 M15 6l3-3a2.1 2.1 0 0 1 3 3l-3 3 1 1-2 2-6-6 2-2z" />
        </svg>
        {{ t('effects.eyedropper') }}
      </button>
      <div class="pop-title">{{ t('effects.recent') }}</div>
      <div v-if="recentColors.length" class="swatches">
        <button v-for="c in recentColors" :key="c" type="button" class="swatch" :class="{ current: c === value.toLowerCase() }"
          :style="{ background: c }" :title="c" :aria-label="t('effects.use_color', { color: c })" @click="choose(c)" />
      </div>
      <p v-else class="none">{{ t('effects.no_recent') }}</p>
    </div>
  </div>
</template>

<style scoped>
.color-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.color-field > label {
  margin-left: 2px;
  cursor: pointer;
}
.more {
  display: grid;
  place-items: center;
  width: 18px;
  height: 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.more:hover,
.more[aria-expanded='true'] {
  background: var(--surface-tint-hover);
  border-color: var(--border);
  color: var(--text);
}
.more svg {
  width: 10px;
  height: 6px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  width: 170px;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.eyedrop {
  width: 100%;
  margin-bottom: 8px;
}
.eyedrop svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pop-title {
  font-size: 11px;
  margin-bottom: 6px;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.swatch {
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  cursor: pointer;
}
.swatch.current {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.none {
  margin: 0;
  font-size: 11px;
}
</style>
