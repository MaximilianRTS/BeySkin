<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import { BLEND_MODES, type BlendMode } from '@/lib/model'
import { effectiveDpi, FONTS } from '@/lib/render'
import { FRAMES, PATTERN_IDS } from '@/lib/library'
import { toast } from '@/lib/toast'
import NumField from '@/components/common/NumField.vue'
import Icon from '@/components/common/Icon.vue'

const { t } = useI18n()
const store = useEditorStore()
const layer = computed(() => store.selected)
const textArea = ref<HTMLTextAreaElement>()
const replaceInput = ref<HTMLInputElement>()

async function onReplace(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !layer.value) return
  if (!(await store.replaceImage(layer.value.id, file))) toast(t('editor.import_failed', { n: 1 }), 'error')
}

const dpi = computed(() => (layer.value ? effectiveDpi(layer.value) : null))
const ALIGN = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const
const hasFrame = computed(() => store.design.layers.some((l) => l.type === 'frame'))
const dpiLevel = computed(() => {
  const v = dpi.value
  if (v == null) return null
  return v >= 250 ? 'good' : v >= 150 ? 'ok' : 'low'
})

function set(patch: Record<string, unknown>, record = false) {
  if (layer.value) store.updateLayer(layer.value.id, patch, record)
}
function commit() {
  store.commit()
}

async function focusText() {
  await nextTick()
  textArea.value?.focus()
  textArea.value?.select()
}
defineExpose({ focusText })
</script>

<template>
  <div class="props">
    <p v-if="!layer" class="muted hint">{{ t('editor.select_hint') }}</p>
    <template v-else>
      <div v-if="layer.locked" class="badge badge-warning lock-note">{{ t('editor.locked_note') }}</div>

      <!-- Image -->
      <template v-if="layer.type === 'image'">
        <p v-if="!layer.assetId" class="placeholder-note">{{ t('editor.placeholder_note') }}</p>
        <button class="btn btn-sm replace" :class="{ 'btn-primary': !layer.assetId }" @click="replaceInput?.click()">
          <Icon name="image" /> {{ layer.assetId ? t('editor.replace_image') : t('editor.fill_placeholder') }}
        </button>
        <input ref="replaceInput" type="file" accept="image/*" hidden @change="onReplace" />
        <NumField :label="t('editor.width')" :value="layer.width" unit="mm" :min="0.5" :max="2000" :step="0.1"
          @input="set({ width: $event })" @commit="commit" />
        <div v-if="dpiLevel" class="dpi" :class="dpiLevel">
          <Icon :name="dpiLevel === 'low' ? 'alert' : 'check'" />
          {{ t('editor.dpi', { dpi: Math.round(dpi ?? 0) }) }}
          <span v-if="dpiLevel === 'low'">– {{ t('editor.dpi_low') }}</span>
        </div>
        <div class="field">
          <label for="mask-select">{{ t('editor.mask') }}</label>
          <select id="mask-select" class="input" :value="layer.mask ?? ''"
            @change="set({ mask: (($event.target as HTMLSelectElement).value || null) as 'circle' | 'frame' | null }, true)">
            <option value="">{{ t('editor.mask_none') }}</option>
            <option value="circle">{{ t('editor.mask_circle') }}</option>
            <option v-if="hasFrame || layer.mask === 'frame'" value="frame">{{ t('editor.mask_frame') }}</option>
          </select>
        </div>
        <div class="row wrap">
          <button class="btn btn-sm" @click="store.fitLayer(layer, 'cover')">{{ t('editor.fit_cover') }}</button>
          <button class="btn btn-sm" @click="store.fitLayer(layer, 'contain')">{{ t('editor.fit_contain') }}</button>
        </div>
      </template>

      <!-- Text -->
      <template v-if="layer.type === 'text'">
        <div class="field">
          <label for="text-input">{{ t('editor.text') }}</label>
          <textarea id="text-input" ref="textArea" class="input" rows="2" :value="layer.text"
            @input="set({ text: ($event.target as HTMLTextAreaElement).value, name: ($event.target as HTMLTextAreaElement).value.split('\n')[0].slice(0, 40) || 'Text' })"
            @change="commit" />
        </div>
        <div class="field">
          <label for="font-select">{{ t('editor.font') }}</label>
          <select id="font-select" class="input" :value="layer.fontFamily"
            @change="set({ fontFamily: ($event.target as HTMLSelectElement).value }, true)">
            <option v-for="f in FONTS" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
          </select>
        </div>
        <NumField :label="t('editor.font_size')" :value="layer.fontSize" unit="mm" :min="0.5" :max="200" :step="0.1"
          slider @input="set({ fontSize: $event })" @commit="commit" />
        <div class="row wrap">
          <button class="btn btn-sm btn-icon" :class="{ active: layer.bold }" :aria-pressed="layer.bold" :aria-label="t('editor.bold')"
            @click="set({ bold: !layer.bold }, true)"><b>B</b></button>
          <button class="btn btn-sm btn-icon" :class="{ active: layer.italic }" :aria-pressed="layer.italic" :aria-label="t('editor.italic')"
            @click="set({ italic: !layer.italic }, true)"><i>I</i></button>
          <select class="input align" :value="layer.align" :aria-label="t('editor.align')"
            @change="set({ align: ($event.target as HTMLSelectElement).value }, true)">
            <option value="left">{{ t('editor.align_left') }}</option>
            <option value="center">{{ t('editor.align_center') }}</option>
            <option value="right">{{ t('editor.align_right') }}</option>
          </select>
        </div>
        <div class="row colors">
          <label class="color">
            <input type="color" :value="layer.color" @input="set({ color: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.color') }}
          </label>
          <label class="color">
            <input type="color" :value="layer.strokeColor" @input="set({ strokeColor: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.outline') }}
          </label>
        </div>
        <NumField :label="t('editor.outline_width')" :value="layer.strokeWidth" unit="mm" :min="0" :max="5" :step="0.05"
          slider @input="set({ strokeWidth: $event })" @commit="commit" />
      </template>

      <!-- Frame -->
      <template v-if="layer.type === 'frame'">
        <div class="field">
          <label for="frame-select">{{ t('editor.frame_style') }}</label>
          <select id="frame-select" class="input" :value="layer.frameId"
            @change="set({ frameId: ($event.target as HTMLSelectElement).value }, true)">
            <option v-for="f in FRAMES" :key="f.id" :value="f.id">{{ t(`editor.${f.id.replace(/-/g, '_')}`) }}</option>
          </select>
        </div>
        <div class="frame-colors">
          <label class="color">
            <input type="color" :value="layer.bandColor" @input="set({ bandColor: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.frame_band') }}
          </label>
          <label class="color">
            <input type="color" :value="layer.ringColor" @input="set({ ringColor: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.frame_ring') }}
          </label>
          <label class="color">
            <input type="color" :value="layer.accentColor" @input="set({ accentColor: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.frame_accent') }}
          </label>
          <label class="checkbox center-toggle">
            <input type="checkbox" :checked="layer.centerColor !== null" @change="set({ centerColor: layer.centerColor === null ? '#ffffff' : null }, true)" />
            {{ t('editor.frame_center') }}
          </label>
          <label v-if="layer.centerColor !== null" class="color">
            <input type="color" :value="layer.centerColor" @input="set({ centerColor: ($event.target as HTMLInputElement).value })" @change="commit" />
          </label>
        </div>
        <p class="muted hint-small">{{ t('editor.frame_center_hint') }}</p>
        <div class="field">
          <label for="band-text">{{ t('editor.band_text') }}</label>
          <input id="band-text" class="input" maxlength="40" :value="layer.bandText" :placeholder="t('editor.band_text_placeholder')"
            @input="set({ bandText: ($event.target as HTMLInputElement).value })" @change="commit" />
        </div>
        <div v-if="layer.bandText" class="row band-text-style">
          <label class="color">
            <input type="color" :value="layer.bandTextColor" @input="set({ bandTextColor: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.color') }}
          </label>
          <select class="input" :value="layer.bandTextFont" :aria-label="t('editor.font')"
            @change="set({ bandTextFont: ($event.target as HTMLSelectElement).value }, true)">
            <option v-for="f in FONTS" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
          </select>
        </div>
        <NumField :label="t('editor.width')" :value="layer.width" unit="mm" :min="0.5" :max="2000" :step="0.1"
          @input="set({ width: $event })" @commit="commit" />
        <div class="row wrap">
          <button class="btn btn-sm" @click="store.fitLayer(layer, 'contain')">{{ t('editor.fit_contain') }}</button>
        </div>
      </template>

      <!-- Shape -->
      <template v-if="layer.type === 'shape'">
        <NumField :label="t('editor.width')" :value="layer.width" unit="mm" :min="0.5" :max="2000" :step="0.1"
          @input="set({ width: $event })" @commit="commit" />
        <div class="row colors">
          <label class="color">
            <input type="color" :value="layer.color" @input="set({ color: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.color') }}
          </label>
          <label class="color">
            <input type="color" :value="layer.strokeColor" @input="set({ strokeColor: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.outline') }}
          </label>
        </div>
        <NumField :label="t('editor.outline_width')" :value="layer.strokeWidth" unit="mm" :min="0" :max="5" :step="0.05"
          slider @input="set({ strokeWidth: $event })" @commit="commit" />
        <div class="row wrap">
          <button class="btn btn-sm" @click="store.fitLayer(layer, 'contain')">{{ t('editor.fit_contain') }}</button>
        </div>
      </template>

      <!-- Fill -->
      <template v-if="layer.type === 'fill'">
        <div class="field">
          <label for="pattern-select">{{ t('editor.pattern') }}</label>
          <select id="pattern-select" class="input" :value="layer.pattern ?? ''"
            @change="set({ pattern: ($event.target as HTMLSelectElement).value || null, color2: layer.color2 ?? '#000000' }, true)">
            <option value="">{{ t('shapes.none') }}</option>
            <option v-for="p in PATTERN_IDS" :key="p" :value="p">{{ t(`shapes.pattern_${p}`) }}</option>
          </select>
        </div>
        <template v-if="layer.pattern">
          <div class="row colors">
            <label class="color">
              <input type="color" :value="layer.color" @input="set({ color: ($event.target as HTMLInputElement).value })" @change="commit" />
              {{ t('editor.background') }}
            </label>
            <label class="color">
              <input type="color" :value="layer.color2 ?? '#000000'" @input="set({ color2: ($event.target as HTMLInputElement).value })" @change="commit" />
              {{ t('editor.pattern_color') }}
            </label>
          </div>
          <NumField :label="t('editor.pattern_scale')" :value="layer.patternScale" unit="mm" :min="0.5" :max="30" :step="0.5"
            slider :decimals="1" @input="set({ patternScale: $event })" @commit="commit" />
          <NumField :label="t('editor.angle')" :value="layer.angle" unit="°" :min="-180" :max="180" :step="1"
            slider :decimals="0" @input="set({ angle: $event })" @commit="commit" />
        </template>
        <div v-else class="row colors">
          <label class="color">
            <input type="color" :value="layer.color" @input="set({ color: ($event.target as HTMLInputElement).value })" @change="commit" />
            {{ t('editor.color') }}
          </label>
          <label class="checkbox">
            <input type="checkbox" :checked="layer.color2 !== null" @change="set({ color2: layer.color2 === null ? '#000000' : null }, true)" />
            {{ t('editor.gradient') }}
          </label>
          <label v-if="layer.color2 !== null" class="color">
            <input type="color" :value="layer.color2" @input="set({ color2: ($event.target as HTMLInputElement).value })" @change="commit" />
          </label>
        </div>
        <NumField v-if="!layer.pattern && layer.color2 !== null" :label="t('editor.angle')" :value="layer.angle" unit="°" :min="-180" :max="180" :step="1"
          slider :decimals="0" @input="set({ angle: $event })" @commit="commit" />
      </template>

      <!-- Transform (not for fills) -->
      <template v-if="layer.type !== 'fill'">
        <div class="panel-title section">{{ t('editor.position') }}</div>
        <div class="grid2">
          <NumField label="X" :value="layer.x" unit="mm" :step="0.1" @input="set({ x: $event })" @commit="commit" />
          <NumField label="Y" :value="layer.y" unit="mm" :step="0.1" @input="set({ y: $event })" @commit="commit" />
        </div>
        <NumField :label="t('editor.rotation')" :value="layer.rotation" unit="°" :min="-180" :max="180" :step="0.5"
          slider :decimals="1" @input="set({ rotation: $event })" @commit="commit" />
        <div class="row wrap">
          <button class="btn btn-sm" :title="t('editor.center')" @click="store.centerLayer(layer, 'both')">
            <Icon name="center" /> {{ t('editor.center') }}
          </button>
        </div>
        <div class="row wrap align-row" role="group" :aria-label="t('editor.align_label')">
          <button v-for="a in ALIGN" :key="a" class="btn btn-sm btn-icon" :title="t(`editor.al_${a}`)" :aria-label="t(`editor.al_${a}`)"
            @click="store.alignLayer(layer, a)"><Icon :name="`al-${a}`" /></button>
        </div>
        <div class="row wrap">
          <button class="btn btn-sm btn-icon" :class="{ active: layer.flipX }" :aria-pressed="layer.flipX" :title="t('editor.flip_h')" :aria-label="t('editor.flip_h')"
            @click="set({ flipX: !layer.flipX }, true)"><Icon name="flip-h" /></button>
          <button class="btn btn-sm btn-icon" :class="{ active: layer.flipY }" :aria-pressed="layer.flipY" :title="t('editor.flip_v')" :aria-label="t('editor.flip_v')"
            @click="set({ flipY: !layer.flipY }, true)"><Icon name="flip-v" /></button>
        </div>
      </template>

      <div class="panel-title section">{{ t('editor.appearance') }}</div>
      <NumField :label="t('editor.opacity')" :value="Math.round(layer.opacity * 100)" unit="%" :min="0" :max="100" :step="1"
        slider :decimals="0" @input="set({ opacity: $event / 100 })" @commit="commit" />
      <div class="field">
        <label for="blend-select">{{ t('editor.blend') }}</label>
        <select id="blend-select" class="input" :value="layer.blend"
          @change="set({ blend: ($event.target as HTMLSelectElement).value as BlendMode }, true)">
          <option v-for="m in BLEND_MODES" :key="m" :value="m">{{ t(`blend.${m}`) }}</option>
        </select>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hint {
  font-size: 13px;
}
.section {
  margin-top: 14px;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.wrap {
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.colors {
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}
.color {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.align {
  width: auto;
  min-height: 28px;
  padding: 2px 6px;
}
.dpi {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin: -2px 0 8px;
}
.dpi.good {
  color: var(--success);
}
.dpi.ok {
  color: var(--text-muted);
}
.dpi.low {
  color: var(--warning);
}
.band-text-style {
  gap: 12px;
  margin-bottom: 10px;
}
.band-text-style .input {
  flex: 1;
  min-height: 30px;
  padding: 3px 8px;
}
.align-row {
  gap: 4px;
}
.frame-colors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 6px;
}
.center-toggle {
  font-size: 12px;
  color: var(--text-muted);
  align-items: center;
}
.hint-small {
  font-size: 11px;
  margin: 0 0 10px;
}
.mask {
  margin-bottom: 8px;
  font-size: 13px;
}
.replace {
  margin-bottom: 10px;
}
.placeholder-note {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  margin: 0 0 8px;
}
.lock-note {
  margin-bottom: 8px;
}
</style>
