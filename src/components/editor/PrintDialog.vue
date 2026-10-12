<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLibraryStore } from '@/stores/library'
import {
  DEFAULT_PRINT_OPTIONS,
  fillLastPage,
  generatePdf,
  generateTestPagePdf,
  planSheet,
  type PrintOptions,
} from '@/lib/pdf'
import { canPrintInFrame, disposePrintFrame, openPendingTab, printInFrame, saveBlob, timestamp } from '@/lib/download'
import { toast } from '@/lib/toast'
import { APP_NAME } from '@/config'
import { getTemplate, templateName as tplName } from '@/templates'
import NumField from '@/components/common/NumField.vue'
import Icon from '@/components/common/Icon.vue'
import SheetPreview from './SheetPreview.vue'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const library = useLibraryStore()

interface DialogOptions extends PrintOptions {
  /** Open the PDF in a new tab after creating it (in addition to the download). */
  openAfter: boolean
}
const DEFAULT_OPTIONS: DialogOptions = { ...DEFAULT_PRINT_OPTIONS, openAfter: true }

const STORAGE_KEY = 'print-options'
function loadOptions(): DialogOptions {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}
const o = ref<DialogOptions>(loadOptions())
watch(
  o,
  (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch {
      // ignore
    }
  },
  { deep: true },
)

const busy = ref(false)
const progress = ref(0)
const jobs = computed(() => library.entries.filter((e) => e.quantity > 0))
const count = computed(() => jobs.value.reduce((n, e) => n + e.quantity, 0))
const hasPlaceholders = computed(() => jobs.value.some((e) => e.design.layers.some((l) => l.type === 'image' && !l.assetId)))

// ---------- preview: the same plan generatePdf uses ----------
const pdfOptions = computed<PrintOptions>(() => ({
  ...o.value,
  footerText: `${APP_NAME} · ${t('print.footer')}`,
  calibrationText: t('print.calibration_text'),
}))
const plan = computed(() => planSheet(jobs.value, o.value))
const previewDesigns = computed(() => jobs.value.map((e) => e.design))
const page = ref(0)
const highlight = ref<string | null>(null)

const templateName = (id: string) => tplName(t, getTemplate(id))
const designName = (id: string) => {
  const d = library.entries.find((e) => e.design.id === id)?.design
  return d ? d.name || templateName(d.templateId) : ''
}
const oversized = computed(() => new Set(plan.value.oversized))
const oversizedNames = computed(() => plan.value.oversized.map(designName).join(', '))
const paperLabel = computed(
  () => `${o.value.paper === 'a4' ? 'A4' : 'US Letter'} ${t(`print.orientation_${plan.value.orientation}`)}`,
)

/** Raises quantities until the last page is full without starting a new one. */
function fillPage() {
  const before = count.value
  for (const [id, q] of fillLastPage(jobs.value, o.value)) library.setQuantity(id, q)
  const added = count.value - before
  if (added) {
    page.value = Math.max(0, plan.value.pages - 1)
    toast(t('print.filled', { n: added }), 'success')
  } else {
    toast(t('print.fill_none'), 'info')
  }
}

const measuredX = ref(50)
const measuredY = ref(10)
function applyCalibration() {
  o.value.scaleX = +(o.value.scaleX * (50 / measuredX.value)).toFixed(4)
  o.value.scaleY = +(o.value.scaleY * (10 / measuredY.value)).toFixed(4)
  toast(t('print.calibrated'), 'success')
}

// ---------- printer profiles: named scale corrections, one per printer ----------
interface PrinterProfile {
  name: string
  scaleX: number
  scaleY: number
}
const PROFILES_KEY = 'print-profiles'
function loadProfiles(): PrinterProfile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (p): p is PrinterProfile => !!p && typeof p.name === 'string' && Number.isFinite(p.scaleX) && Number.isFinite(p.scaleY),
    )
  } catch {
    return []
  }
}
const profiles = ref<PrinterProfile[]>(loadProfiles())
function storeProfiles() {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.value))
  } catch {
    // ignore
  }
}
/** The profile whose scale is currently applied (if any). */
const activeProfile = computed(() => profiles.value.find((p) => p.scaleX === o.value.scaleX && p.scaleY === o.value.scaleY)?.name ?? '')
const profileName = ref('')

function applyProfile(e: Event) {
  const p = profiles.value.find((x) => x.name === (e.target as HTMLSelectElement).value)
  if (!p) return
  o.value.scaleX = p.scaleX
  o.value.scaleY = p.scaleY
  profileName.value = p.name
}
function saveProfile() {
  const name = profileName.value.trim().slice(0, 40)
  if (!name) return
  const entry = { name, scaleX: o.value.scaleX, scaleY: o.value.scaleY }
  const i = profiles.value.findIndex((p) => p.name === name)
  if (i >= 0) profiles.value[i] = entry
  else profiles.value.push(entry)
  storeProfiles()
  toast(t('print.profile_saved', { name }), 'success')
}
function deleteProfile() {
  profiles.value = profiles.value.filter((p) => p.name !== activeProfile.value)
  storeProfiles()
  toast(t('print.profile_deleted'), 'info')
}

// ---------- test page: ruler + label outlines, to check the printer before a full sheet ----------
const testBusy = ref(false)
async function printTestPage() {
  testBusy.value = true
  try {
    const pct = (v: number) => (v * 100).toFixed(2)
    const blob = await generateTestPagePdf({
      paper: o.value.paper,
      scaleX: o.value.scaleX,
      scaleY: o.value.scaleY,
      title: `${APP_NAME} · ${t('print.test_title')}`,
      steps: [
        t('print.test_step_actual'),
        t('print.test_step_measure'),
        t('print.test_step_enter', { section: t('print.scale_title') }),
        t('print.test_step_outlines'),
        t('print.test_scale', { x: pct(o.value.scaleX), y: pct(o.value.scaleY) }),
      ],
      calibrationText: t('print.calibration_text'),
      outlinesTitle: t('print.test_outlines'),
      templateName: (tp) => t(`templates.${tp.i18nKey}`),
      footerText: `${APP_NAME} · ${t('print.footer')}`,
    })
    saveBlob(blob, `beyskin-test-page-${timestamp()}.pdf`)
    toast(t('print.test_done'), 'success')
  } catch (err) {
    console.error(err)
    toast(t('print.failed'), 'error')
  } finally {
    testBusy.value = false
  }
}

// ---------- create: download (+ open in a tab) or print directly ----------
const printsInFrame = canPrintInFrame()

async function generate(mode: 'save' | 'print') {
  if (busy.value || !plan.value.items.length) return
  // Popup blockers only allow window.open during the click itself, so the tab is
  // opened now and receives the PDF once it is ready.
  const wantsTab = mode === 'save' ? o.value.openAfter : !printsInFrame
  const tab = wantsTab ? openPendingTab(t('print.preparing')) : null
  busy.value = true
  progress.value = 0
  try {
    const result = await generatePdf(jobs.value, pdfOptions.value, (p) => (progress.value = p))
    const download = () => saveBlob(result.blob, `beyskin-print-${timestamp()}.pdf`)
    if (mode === 'save') download()
    let shown = tab ? tab.show(result.blob) : false
    if (mode === 'print' && printsInFrame) shown = await printInFrame(result.blob)
    // Nothing could be opened (popup blocked, tab closed, frame printing failed): keep the file anyway.
    if (mode === 'print' && !shown) download()

    if (result.oversized.length) toast(t('print.oversized', { n: result.oversized.length }), 'error', 6000)
    else if (wantsTab && !shown) toast(t('print.fallback_download'), 'info', 6000)
    else if (mode === 'print' && !shown) toast(t('print.fallback_download'), 'info', 6000)
    else toast(t('print.done', { pages: result.pages, n: result.placed }), 'success')
  } catch (err) {
    console.error(err)
    tab?.close()
    toast(t('print.failed'), 'error')
  } finally {
    busy.value = false
  }
}
const progressPct = computed(() => Math.round(progress.value * 100))

const dialog = ref<HTMLDivElement>()
onMounted(() => dialog.value?.focus())
onBeforeUnmount(disposePrintFrame)
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="dialog" class="dialog print-dialog" role="dialog" aria-modal="true" :aria-label="t('print.title')" tabindex="-1">
      <header class="row head">
        <h2>{{ t('print.title') }}</h2>
        <span class="spacer" />
        <button class="btn btn-ghost btn-icon" :aria-label="t('common.close')" :title="t('common.close')" @click="emit('close')">
          <Icon name="x" />
        </button>
      </header>
      <p class="muted summary">{{ t('print.summary', { n: count }) }}</p>

      <div class="layout">
        <section class="preview-col" :aria-label="t('print.preview')">
          <SheetPreview v-model:page="page" :plan="plan" :designs="previewDesigns" :options="pdfOptions" :highlight="highlight" />
          <p v-if="plan.pages" class="stats">
            {{ t('print.stats', { n: plan.items.length, pages: plan.pages, paper: paperLabel }) }}
          </p>
          <p v-if="plan.oversized.length" class="note warn">
            <Icon name="alert" :size="14" /> {{ t('print.oversized_list', { names: oversizedNames }) }}
          </p>
        </section>

        <div class="options-col">
          <section class="designs" :aria-label="t('print.designs')">
            <div class="row designs-head">
              <span class="field-label">{{ t('print.designs') }}</span>
              <span class="spacer" />
              <button class="btn btn-sm" :disabled="!plan.items.length || busy" :title="t('print.fill_page_hint')" @click="fillPage">
                <Icon name="fit" :size="14" /> {{ t('print.fill_page') }}
              </button>
            </div>
            <p v-if="!library.entries.length" class="muted small">{{ t('library.empty') }}</p>
            <ul v-else class="design-list">
              <li
                v-for="e in library.entries"
                :key="e.design.id"
                class="design-row"
                :class="{ off: !e.quantity, hot: highlight === e.design.id && e.quantity > 0 }"
                @mouseenter="highlight = e.design.id"
                @mouseleave="highlight = null"
                @focusin="highlight = e.design.id"
                @focusout="highlight = null"
              >
                <span class="thumb"><img v-if="library.thumbs[e.design.id]" :src="library.thumbs[e.design.id]" alt="" /></span>
                <span class="info">
                  <span class="name">{{ e.design.name || templateName(e.design.templateId) }}</span>
                  <span class="sub muted">
                    {{ templateName(e.design.templateId) }}
                    <span v-if="oversized.has(e.design.id)" class="badge badge-danger">{{ t('print.too_large') }}</span>
                  </span>
                </span>
                <span class="qty">
                  <button class="btn btn-ghost btn-icon btn-sm" :disabled="!e.quantity" :aria-label="`${t('library.less')}: ${designName(e.design.id)}`"
                    @click="library.setQuantity(e.design.id, e.quantity - 1)">
                    <Icon name="minus" :size="14" />
                  </button>
                  <span class="count" :class="{ zero: !e.quantity }" aria-live="polite">{{ e.quantity }}×</span>
                  <button class="btn btn-ghost btn-icon btn-sm" :disabled="e.quantity >= 99" :aria-label="`${t('library.more')}: ${designName(e.design.id)}`"
                    @click="library.setQuantity(e.design.id, e.quantity + 1)">
                    <Icon name="plus" :size="14" />
                  </button>
                </span>
              </li>
            </ul>
            <p class="hint muted">{{ t('print.designs_hint') }}</p>
          </section>

          <div class="grid">
            <div class="field">
              <label for="paper">{{ t('print.paper') }}</label>
              <select id="paper" v-model="o.paper" class="input">
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select>
            </div>
            <div class="field">
              <label for="dpi">{{ t('print.quality') }}</label>
              <select id="dpi" v-model.number="o.dpi" class="input">
                <option :value="300">300 dpi</option>
                <option :value="600">600 dpi</option>
              </select>
            </div>
          </div>

          <NumField :label="t('print.bleed')" :value="o.bleedMm" unit="mm" :min="0" :max="5" :step="0.5" :decimals="1"
            @input="o.bleedMm = $event" />
          <p class="hint muted">{{ t('print.bleed_hint') }}</p>

          <label class="checkbox"><input v-model="o.cutLine" type="checkbox" /> {{ t('print.cut_line') }}</label>
          <label class="checkbox"><input v-model="o.cropMarks" type="checkbox" /> {{ t('print.crop_marks') }}</label>
          <label class="checkbox"><input v-model="o.calibration" type="checkbox" /> {{ t('print.calibration') }}</label>

          <details class="calib">
            <summary>{{ t('print.scale_title') }}</summary>
            <p class="muted hint">{{ t('print.scale_hint') }}</p>
            <div class="row wrap test-row">
              <button class="btn btn-sm" :disabled="testBusy" @click="printTestPage"><Icon name="print" :size="14" /> {{ t('print.test_page') }}</button>
              <span class="muted small">{{ t('print.test_page_hint') }}</span>
            </div>
            <div class="grid">
              <NumField :label="t('print.measured_line')" :value="measuredX" unit="mm" :min="40" :max="60" :step="0.1"
                @input="measuredX = $event" />
              <NumField :label="t('print.measured_square')" :value="measuredY" unit="mm" :min="8" :max="12" :step="0.1"
                @input="measuredY = $event" />
            </div>
            <div class="row">
              <button class="btn btn-sm" @click="applyCalibration">{{ t('print.apply_calibration') }}</button>
              <button class="btn btn-sm btn-ghost" @click="o.scaleX = o.scaleY = 1">{{ t('print.reset_calibration') }}</button>
              <span class="muted small">{{ (o.scaleX * 100).toFixed(2) }} % × {{ (o.scaleY * 100).toFixed(2) }} %</span>
            </div>

            <div class="profiles">
              <span class="field-label">{{ t('print.profiles') }}</span>
              <p class="muted hint">{{ t('print.profiles_hint') }}</p>
              <div v-if="profiles.length" class="row">
                <select class="input" :value="activeProfile" :aria-label="t('print.profiles')" @change="applyProfile">
                  <option value="" disabled>{{ t('print.profile_none') }}</option>
                  <option v-for="p in profiles" :key="p.name" :value="p.name">
                    {{ p.name }} ({{ (p.scaleX * 100).toFixed(2) }} % × {{ (p.scaleY * 100).toFixed(2) }} %)
                  </option>
                </select>
                <button class="btn btn-sm btn-ghost btn-danger" :disabled="!activeProfile" :title="t('print.profile_delete')"
                  :aria-label="t('print.profile_delete')" @click="deleteProfile">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
              <form class="row" @submit.prevent="saveProfile">
                <input v-model="profileName" class="input" maxlength="40" :placeholder="t('print.profile_name_placeholder')"
                  :aria-label="t('print.profile_name')" />
                <button class="btn btn-sm" type="submit" :disabled="!profileName.trim()">{{ t('print.profile_save') }}</button>
              </form>
            </div>
          </details>

          <p class="note">{{ t('print.actual_size') }}</p>
          <p v-if="hasPlaceholders" class="note warn">{{ t('editor.placeholders_export') }}</p>
        </div>
      </div>

      <div class="dialog-actions">
        <div v-if="busy" class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressPct"
          :aria-label="t('print.preparing')">
          <span class="track"><span class="bar" :style="{ width: `${progressPct}%` }" /></span>
          <span class="muted small">{{ t('print.progress', { pct: progressPct }) }}</span>
        </div>
        <label v-else class="checkbox open-after"><input v-model="o.openAfter" type="checkbox" /> {{ t('print.open_after') }}</label>
        <button class="btn" :disabled="busy || !plan.items.length" :title="t('print.print_now_hint')" @click="generate('print')">
          <Icon name="print" :size="16" /> {{ t('print.print_now') }}
        </button>
        <button class="btn btn-primary" :disabled="busy || !plan.items.length" @click="generate('save')">
          <Icon name="download" :size="16" /> {{ t('print.generate') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-dialog {
  width: min(980px, 100%);
  padding-bottom: 0;
}
.head {
  margin-bottom: 4px;
}
.head h2 {
  margin: 0;
  font-size: 18px;
}
.summary {
  margin: 0 0 14px;
  font-size: 13px;
}
.layout {
  display: grid;
  gap: 16px;
}
@media (min-width: 820px) {
  .layout {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .preview-col {
    position: sticky;
    top: 0;
  }
}
.preview-col {
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.stats {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
}
.preview-col .note {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin: 8px 0 0;
}
.preview-col .note :deep(svg) {
  flex: none;
  margin-top: 1px;
}
.designs {
  margin-bottom: 14px;
}
.designs-head {
  margin-bottom: 6px;
}
.design-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 232px;
  overflow-x: hidden;
  overflow-y: auto;
}
.design-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-tint);
  transition: border-color 0.15s, opacity 0.15s;
}
.design-row.off {
  opacity: 0.6;
}
.design-row.hot {
  border-color: var(--accent-border);
}
.thumb {
  flex: none;
  width: 56px;
  height: 36px;
  padding: 2px;
  border-radius: 6px;
  background: repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface-3) 0 50%) 0 0 / 8px 8px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.sub {
  font-size: 11px;
}
.qty {
  flex: none;
  display: flex;
  align-items: center;
}
.count {
  min-width: 30px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.count.zero {
  color: var(--text-muted);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.hint {
  font-size: 12px;
  margin: -4px 0 10px;
}
.designs .hint {
  margin: 4px 0 0;
}
.checkbox {
  margin-bottom: 6px;
}
.calib {
  margin: 10px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.calib summary {
  cursor: pointer;
  font-weight: 500;
}
.wrap {
  flex-wrap: wrap;
}
.test-row {
  margin-bottom: 10px;
}
.profiles {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.profiles .hint {
  margin: 2px 0 6px;
}
.profiles .row + .row {
  margin-top: 6px;
}
.note {
  font-size: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}
.small {
  font-size: 12px;
}
.warn {
  background: color-mix(in srgb, var(--warning) 15%, transparent);
}
/* Actions stay visible at the bottom while the options scroll. */
.dialog-actions {
  position: sticky;
  bottom: 0;
  flex-wrap: wrap;
  align-items: center;
  margin: 16px -20px 0;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.open-after {
  margin: 0 auto 0 0;
  align-items: center;
  font-size: 13px;
}
.progress {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-right: auto;
}
.track {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  background: var(--gradient-accent);
  transition: width 0.2s;
}
@media (max-width: 480px) {
  .dialog-actions .btn {
    flex: 1 1 auto;
  }
  .open-after {
    flex-basis: 100%;
  }
}
</style>
