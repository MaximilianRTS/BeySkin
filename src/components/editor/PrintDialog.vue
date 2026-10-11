<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLibraryStore } from '@/stores/library'
import { DEFAULT_PRINT_OPTIONS, generatePdf, type PrintOptions } from '@/lib/pdf'
import { saveBlob, timestamp } from '@/lib/download'
import { toast } from '@/lib/toast'
import { APP_NAME } from '@/config'
import NumField from '@/components/common/NumField.vue'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const library = useLibraryStore()

const STORAGE_KEY = 'print-options'
function loadOptions(): PrintOptions {
  try {
    return { ...DEFAULT_PRINT_OPTIONS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_PRINT_OPTIONS }
  }
}
const o = ref<PrintOptions>(loadOptions())
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

const measuredX = ref(50)
const measuredY = ref(10)
function applyCalibration() {
  o.value.scaleX = +(o.value.scaleX * (50 / measuredX.value)).toFixed(4)
  o.value.scaleY = +(o.value.scaleY * (10 / measuredY.value)).toFixed(4)
  toast(t('print.calibrated'), 'success')
}

async function generate() {
  busy.value = true
  progress.value = 0
  try {
    const result = await generatePdf(
      jobs.value.map((e) => ({ design: e.design, quantity: e.quantity })),
      { ...o.value, footerText: `${APP_NAME} · ${t('print.footer')}`, calibrationText: t('print.calibration_text') },
      (p) => (progress.value = p),
    )
    saveBlob(result.blob, `beyskin-print-${timestamp()}.pdf`)
    if (result.oversized.length) toast(t('print.oversized', { n: result.oversized.length }), 'error', 6000)
    else toast(t('print.done', { pages: result.pages, n: result.placed }), 'success')
  } catch (err) {
    console.error(err)
    toast(t('print.failed'), 'error')
  } finally {
    busy.value = false
  }
}

const dialog = ref<HTMLDivElement>()
onMounted(() => dialog.value?.focus())
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="dialog" class="dialog wide" role="dialog" aria-modal="true" :aria-label="t('print.title')" tabindex="-1">
      <h2>{{ t('print.title') }}</h2>
      <p class="muted">{{ t('print.summary', { n: count }) }}</p>

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
      </details>

      <p class="note">{{ t('print.actual_size') }}</p>
      <p v-if="hasPlaceholders" class="note warn">{{ t('editor.placeholders_export') }}</p>

      <div class="dialog-actions">
        <span v-if="busy" class="muted small progress">{{ Math.round(progress * 100) }} %</span>
        <button class="btn" @click="emit('close')">{{ t('common.close') }}</button>
        <button class="btn btn-primary" :disabled="busy || !count" @click="generate">{{ t('print.generate') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wide {
  width: min(560px, 100%);
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
  background: rgba(245, 165, 36, 0.15);
}
.progress {
  margin-right: auto;
  align-self: center;
}
</style>
