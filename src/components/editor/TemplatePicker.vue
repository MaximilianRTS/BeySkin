<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CATEGORY_ORDER,
  CUSTOM_MAX_MM,
  CUSTOM_MIN_MM,
  TEMPLATES,
  customTemplateId,
  getTemplate,
  isCustomTemplateId,
  parseCustomId,
  templateName,
  type StickerTemplate,
} from '@/templates'
import { EXAMPLES, createExample, type ExampleDef } from '@/lib/examples'
import { renderDesignCanvas } from '@/lib/render'
import { confirmDialog } from '@/lib/confirm'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const { t, locale } = useI18n()
const store = useEditorStore()

const groups = computed(() =>
  CATEGORY_ORDER.map((cat) => ({
    cat,
    // A hidden template stays listed while a design that uses it is open.
    items: TEMPLATES.filter((tp) => tp.category === cat && (!tp.hidden || tp.id === props.modelValue)),
  })).filter((g) => g.items.length),
)

function points(tp: StickerTemplate) {
  const f = 56 / Math.max(tp.widthMm, tp.heightMm * 2.2)
  return tp.outline.map(([x, y]) => `${(x * f).toFixed(1)},${(y * f).toFixed(1)}`).join(' ')
}
function viewBox(tp: StickerTemplate) {
  const f = 56 / Math.max(tp.widthMm, tp.heightMm * 2.2)
  return `-1 -1 ${tp.widthMm * f + 2} ${tp.heightMm * f + 2}`
}
const name = (tp: StickerTemplate) => templateName(t, tp)

// ---------- custom sizes ----------

const RECENT_KEY = 'customSizes'
const RECENT_MAX = 6

function loadRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string' && isCustomTemplateId(id)).slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}
const recent = ref<string[]>(loadRecent())
const recentTemplates = computed(() => recent.value.map((id) => getTemplate(id)))

function remember(id: string) {
  if (recent.value[0] === id) return
  recent.value = [id, ...recent.value.filter((x) => x !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value))
  } catch {
    // storage blocked (private mode) – the list just is not kept
  }
}

type ShapeChoice = 'rounded' | 'rect' | 'ellipse'
const form = reactive<{ shape: ShapeChoice; w: number | string; h: number | string; r: number | string }>({ shape: 'rounded', w: 60, h: 40, r: 3 })

// Opening a custom size (also from a project file or share link) prefills the form and the list.
watch(
  () => props.modelValue,
  (id) => {
    const spec = parseCustomId(id)
    if (!spec) return
    form.shape = spec.shape === 'ellipse' ? 'ellipse' : spec.radiusMm > 0 ? 'rounded' : 'rect'
    form.w = spec.widthMm
    form.h = spec.heightMm
    if (spec.radiusMm > 0) form.r = spec.radiusMm
    remember(id)
  },
  { immediate: true },
)

function createCustom() {
  const id = customTemplateId({
    shape: form.shape === 'ellipse' ? 'ellipse' : 'rect',
    widthMm: Number(form.w),
    heightMm: Number(form.h),
    radiusMm: form.shape === 'rounded' ? Number(form.r) : 0,
  })
  remember(id)
  emit('update:modelValue', id)
  // show the clamped values the id actually uses
  const spec = parseCustomId(id)
  if (spec) {
    form.w = spec.widthMm
    form.h = spec.heightMm
    if (form.shape === 'rounded') form.r = spec.radiusMm
  }
}

// ---------- examples ----------

const THUMB_PX = 240
const examplesOpen = ref(store.design.layers.length === 0)
const showAll = ref(false)
const category = computed(() => getTemplate(props.modelValue).category)
/** Examples for templates that are hidden for now are not offered. */
const available = EXAMPLES.filter((ex) => !getTemplate(ex.templateId).hidden)
const matching = computed(() => available.filter((ex) => getTemplate(ex.templateId).category === category.value))
const shownExamples = computed(() => (showAll.value || !matching.value.length ? available : matching.value))
const canToggleAll = computed(() => matching.value.length > 0 && matching.value.length < available.length)

const exampleTexts = () => ({ name: t('templates.example_text_name'), team: t('templates.example_text_team') })
const isWide = (ex: ExampleDef) => {
  const tp = getTemplate(ex.templateId)
  return tp.widthMm / tp.heightMm > 2.5
}

const thumbs = ref<Record<string, string>>({})
const thumbKey = (ex: ExampleDef) => `${ex.id}:${locale.value}`
let thumbRun = 0

/** Renders the thumbnails one after another, only while the section is open. */
async function renderThumbs() {
  const run = ++thumbRun
  for (const ex of shownExamples.value) {
    const key = thumbKey(ex)
    if (thumbs.value[key]) continue
    const tp = getTemplate(ex.templateId)
    try {
      const canvas = await renderDesignCanvas(createExample(ex, exampleTexts()), {
        pxPerMm: THUMB_PX / Math.max(tp.widthMm, tp.heightMm),
        clip: 'outline',
        placeholders: true,
      })
      if (run !== thumbRun) return
      thumbs.value[key] = canvas.toDataURL('image/png')
      canvas.width = canvas.height = 0
    } catch (err) {
      console.warn('example thumbnail failed', err)
    }
  }
}
watch([examplesOpen, shownExamples, locale], () => examplesOpen.value && void renderThumbs(), { immediate: true })

function onToggle(e: Event) {
  examplesOpen.value = (e.target as HTMLDetailsElement).open
}

async function openExample(ex: ExampleDef) {
  const tp = getTemplate(ex.templateId)
  const busy = ex.templateId === store.design.templateId ? store.design.layers.length > 0 : store.hasDraft(ex.templateId)
  if (busy) {
    const ok = await confirmDialog(t('templates.example_confirm', { template: name(tp) }), {
      confirmLabel: t('templates.example_confirm_ok'),
      danger: true,
    })
    if (!ok) return
  }
  store.loadDesign(createExample(ex, exampleTexts(), t(`templates.${ex.i18nKey}`)))
}
</script>

<template>
  <div class="template-picker">
    <div v-for="g in groups" :key="g.cat" class="group">
      <div class="group-title">{{ t(`templates.category_${g.cat}`) }}</div>
      <button
        v-for="tp in g.items"
        :key="tp.id"
        class="tpl"
        :class="{ active: tp.id === props.modelValue }"
        :aria-pressed="tp.id === props.modelValue"
        @click="emit('update:modelValue', tp.id)"
      >
        <svg class="shape" :viewBox="viewBox(tp)" aria-hidden="true">
          <polygon :points="points(tp)" />
        </svg>
        <span class="meta">
          <span class="name">{{ name(tp) }}</span>
          <span class="dims">
            {{ tp.widthMm }} × {{ tp.heightMm }} mm
            <span v-if="!tp.measured" class="badge badge-warning" :title="t('templates.estimated_hint')">
              {{ t('templates.estimated') }}
            </span>
          </span>
        </span>
      </button>
    </div>

    <div class="group">
      <div class="group-title">{{ t('templates.category_custom') }}</div>
      <template v-if="recentTemplates.length">
        <div class="sub-title">{{ t('templates.custom_recent') }}</div>
        <button
          v-for="tp in recentTemplates"
          :key="tp.id"
          class="tpl"
          :class="{ active: tp.id === props.modelValue }"
          :aria-pressed="tp.id === props.modelValue"
          @click="emit('update:modelValue', tp.id)"
        >
          <svg class="shape" :viewBox="viewBox(tp)" aria-hidden="true">
            <polygon :points="points(tp)" />
          </svg>
          <span class="meta">
            <span class="name">{{ name(tp) }}</span>
          </span>
        </button>
      </template>
      <form class="custom-form" @submit.prevent="createCustom">
        <label class="field">
          <span class="field-label">{{ t('templates.custom_shape') }}</span>
          <select v-model="form.shape" class="input">
            <option value="rounded">{{ t('templates.custom_rounded') }}</option>
            <option value="rect">{{ t('templates.custom_rect') }}</option>
            <option value="ellipse">{{ t('templates.custom_ellipse') }}</option>
          </select>
        </label>
        <div class="dims-row">
          <label class="field">
            <span class="field-label">{{ t('templates.custom_width') }}</span>
            <input v-model="form.w" class="input" type="number" inputmode="decimal" :min="CUSTOM_MIN_MM" :max="CUSTOM_MAX_MM" step="0.1" required />
          </label>
          <label class="field">
            <span class="field-label">{{ t('templates.custom_height') }}</span>
            <input v-model="form.h" class="input" type="number" inputmode="decimal" :min="CUSTOM_MIN_MM" :max="CUSTOM_MAX_MM" step="0.1" required />
          </label>
          <label v-if="form.shape === 'rounded'" class="field">
            <span class="field-label">{{ t('templates.custom_radius') }}</span>
            <input v-model="form.r" class="input" type="number" inputmode="decimal" min="0" :max="CUSTOM_MAX_MM / 2" step="0.1" />
          </label>
        </div>
        <p class="hint muted">{{ t('templates.custom_hint', { min: CUSTOM_MIN_MM, max: CUSTOM_MAX_MM }) }}</p>
        <button type="submit" class="btn btn-sm">{{ t('templates.custom_create') }}</button>
      </form>
    </div>

    <details class="group examples" :open="examplesOpen" @toggle="onToggle">
      <summary class="group-title">{{ t('templates.examples') }}</summary>
      <p class="hint muted">{{ t('templates.examples_hint') }}</p>
      <div class="ex-grid">
        <button
          v-for="ex in shownExamples"
          :key="ex.id"
          class="ex"
          :class="{ wide: isWide(ex) }"
          :title="t(`templates.${ex.i18nKey}`)"
          @click="openExample(ex)"
        >
          <span class="thumb">
            <img v-if="thumbs[thumbKey(ex)]" :src="thumbs[thumbKey(ex)]" alt="" />
          </span>
          <span class="ex-name">{{ t(`templates.${ex.i18nKey}`) }}</span>
        </button>
      </div>
      <button v-if="canToggleAll" type="button" class="btn btn-ghost btn-sm" @click="showAll = !showAll">
        {{ showAll ? t('templates.examples_matching') : t('templates.examples_all') }}
      </button>
    </details>
  </div>
</template>

<style scoped>
.template-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.group-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.sub-title {
  font-size: 11px;
  color: var(--text-muted);
  margin: 2px 0 4px;
}
.tpl {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tpl:hover {
  background: var(--surface-2);
}
.tpl.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
.shape {
  width: 60px;
  height: 28px;
  flex: none;
}
.shape polygon {
  fill: var(--surface-3);
  stroke: var(--text-muted);
  stroke-width: 1;
}
.tpl.active .shape polygon {
  fill: var(--accent-soft);
  stroke: var(--accent-hover);
}
.meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-weight: 500;
  font-size: 13px;
}
.dims {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  gap: 6px;
  align-items: center;
}
.custom-form {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.custom-form .field {
  margin-bottom: 6px;
}
.dims-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 6px;
}
.hint {
  font-size: 11px;
  margin: 0 0 6px;
}
.examples summary {
  cursor: pointer;
  list-style-position: inside;
}
.ex-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 4px;
}
.ex {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-tint);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.ex:hover {
  background: var(--surface-tint-hover);
  border-color: var(--border-strong);
}
.ex.wide {
  grid-column: span 2;
}
.thumb {
  display: grid;
  place-items: center;
  height: 52px;
}
.thumb img {
  max-width: 100%;
  /* A % max-height does not resolve inside the auto-sized grid row. */
  max-height: 52px;
  object-fit: contain;
}
.ex-name {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
