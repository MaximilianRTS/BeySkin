<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import { BLEND_MODES, IMAGE_ADJUST_DEFAULTS, TEXT_EFFECT_DEFAULTS, type BlendMode } from '@/lib/model'
import { detectKeyColor } from '@/lib/assets'
import { effectiveDpi, FONTS } from '@/lib/render'
import { FRAMES, PATTERN_IDS } from '@/lib/library'
import { toast } from '@/lib/toast'
import NumField from '@/components/common/NumField.vue'
import ColorField from '@/components/common/ColorField.vue'
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

const textFxActive = computed(() => {
  const l = layer.value
  return l?.type === 'text' && (!!l.letterSpacing || !!l.curve || !!l.shadowColor || !!l.glowColor)
})
const imageAdjusted = computed(() => {
  const l = layer.value
  if (l?.type !== 'image') return false
  const raw = l as unknown as Record<string, unknown>
  return (['brightness', 'contrast', 'saturation', 'hue', 'grayscale', 'keyColor'] as const).some(
    (k) => (raw[k] ?? IMAGE_ADJUST_DEFAULTS[k]) !== IMAGE_ADJUST_DEFAULTS[k],
  )
})

const detecting = ref(false)
/** Picks the background colour from the image corners. */
async function autoKey(fallback: string | null = null) {
  const l = layer.value
  if (l?.type !== 'image' || !l.assetId) return
  detecting.value = true
  let c: string | null = null
  try {
    c = await detectKeyColor(l.assetId)
  } catch {
    // treated like "no solid background"
  }
  detecting.value = false
  if (!c) toast(t('effects.auto_failed'))
  if (c ?? fallback) store.updateLayer(l.id, { keyColor: c ?? fallback }, true)
}
/** Switching background removal on starts with the detected corner colour. */
function toggleKey() {
  const l = layer.value
  if (l?.type !== 'image') return
  if (l.keyColor) set({ keyColor: null }, true)
  else void autoKey('#ffffff')
}

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

        <details v-if="layer.assetId" class="fx">
          <summary class="panel-title">
            {{ t('effects.image_title') }}<span v-if="imageAdjusted" class="fx-dot" :title="t('effects.active')" />
          </summary>
          <NumField :label="t('effects.brightness')" :value="layer.brightness ?? 100" unit="%" :min="0" :max="200" :step="1"
            slider :decimals="0" @input="set({ brightness: $event })" @commit="commit" />
          <NumField :label="t('effects.contrast')" :value="layer.contrast ?? 100" unit="%" :min="0" :max="200" :step="1"
            slider :decimals="0" @input="set({ contrast: $event })" @commit="commit" />
          <NumField :label="t('effects.saturation')" :value="layer.saturation ?? 100" unit="%" :min="0" :max="200" :step="1"
            slider :decimals="0" @input="set({ saturation: $event })" @commit="commit" />
          <NumField :label="t('effects.hue')" :value="layer.hue ?? 0" unit="°" :min="-180" :max="180" :step="1"
            slider :decimals="0" @input="set({ hue: $event })" @commit="commit" />
          <NumField :label="t('effects.grayscale')" :value="layer.grayscale ?? 0" unit="%" :min="0" :max="100" :step="1"
            slider :decimals="0" @input="set({ grayscale: $event })" @commit="commit" />

          <label class="checkbox fx-toggle">
            <input type="checkbox" :checked="!!layer.keyColor" @change="toggleKey" />
            {{ t('effects.bg_remove') }}
          </label>
          <p class="muted hint-small">{{ t('effects.bg_hint') }}</p>
          <div v-if="layer.keyColor" class="fx-group">
            <div class="row key-row">
              <ColorField :value="layer.keyColor" :label="t('effects.key_color')" @input="set({ keyColor: $event })" @commit="commit" />
              <button class="btn btn-sm" :disabled="detecting" :title="t('effects.auto_hint')" @click="autoKey()">{{ t('effects.auto') }}</button>
            </div>
            <NumField :label="t('effects.tolerance')" :value="layer.keyTolerance ?? IMAGE_ADJUST_DEFAULTS.keyTolerance" unit="%" :min="0" :max="100" :step="1"
              slider :decimals="0" @input="set({ keyTolerance: $event })" @commit="commit" />
            <NumField :label="t('effects.softness')" :value="layer.keySoftness ?? IMAGE_ADJUST_DEFAULTS.keySoftness" unit="%" :min="0" :max="100" :step="1"
              slider :decimals="0" @input="set({ keySoftness: $event })" @commit="commit" />
          </div>
          <button v-if="imageAdjusted" class="btn btn-sm" @click="set({ ...IMAGE_ADJUST_DEFAULTS }, true)">{{ t('effects.reset') }}</button>
        </details>
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
          <ColorField :value="layer.color" :label="t('editor.color')" @input="set({ color: $event })" @commit="commit" />
          <ColorField :value="layer.strokeColor" :label="t('editor.outline')" @input="set({ strokeColor: $event })" @commit="commit" />
        </div>
        <NumField :label="t('editor.outline_width')" :value="layer.strokeWidth" unit="mm" :min="0" :max="5" :step="0.05"
          slider @input="set({ strokeWidth: $event })" @commit="commit" />

        <details class="fx">
          <summary class="panel-title">
            {{ t('effects.text_title') }}<span v-if="textFxActive" class="fx-dot" :title="t('effects.active')" />
          </summary>
          <NumField :label="t('effects.letter_spacing')" :value="layer.letterSpacing ?? 0" unit="mm" :min="-2" :max="10" :step="0.05"
            slider @input="set({ letterSpacing: $event })" @commit="commit" />
          <NumField :label="t('effects.curve')" :value="layer.curve ?? 0" unit="°" :min="-360" :max="360" :step="1"
            slider :decimals="0" @input="set({ curve: $event })" @commit="commit" />
          <p class="muted hint-small">{{ t('effects.curve_hint') }}</p>

          <label class="checkbox fx-toggle">
            <input type="checkbox" :checked="!!layer.shadowColor" @change="set({ shadowColor: layer.shadowColor ? null : '#000000' }, true)" />
            {{ t('effects.shadow') }}
          </label>
          <div v-if="layer.shadowColor" class="fx-group">
            <ColorField :value="layer.shadowColor" :label="t('editor.color')" @input="set({ shadowColor: $event })" @commit="commit" />
            <div class="grid2">
              <NumField :label="t('effects.offset_x')" :value="layer.shadowX ?? TEXT_EFFECT_DEFAULTS.shadowX" unit="mm" :min="-10" :max="10" :step="0.05"
                @input="set({ shadowX: $event })" @commit="commit" />
              <NumField :label="t('effects.offset_y')" :value="layer.shadowY ?? TEXT_EFFECT_DEFAULTS.shadowY" unit="mm" :min="-10" :max="10" :step="0.05"
                @input="set({ shadowY: $event })" @commit="commit" />
            </div>
            <NumField :label="t('effects.blur')" :value="layer.shadowBlur ?? TEXT_EFFECT_DEFAULTS.shadowBlur" unit="mm" :min="0" :max="5" :step="0.05"
              slider @input="set({ shadowBlur: $event })" @commit="commit" />
          </div>

          <label class="checkbox fx-toggle">
            <input type="checkbox" :checked="!!layer.glowColor" @change="set({ glowColor: layer.glowColor ? null : '#ffd23f' }, true)" />
            {{ t('effects.glow') }}
          </label>
          <div v-if="layer.glowColor" class="fx-group">
            <ColorField :value="layer.glowColor" :label="t('editor.color')" @input="set({ glowColor: $event })" @commit="commit" />
            <NumField :label="t('effects.glow_size')" :value="layer.glowSize ?? TEXT_EFFECT_DEFAULTS.glowSize" unit="mm" :min="0" :max="5" :step="0.05"
              slider @input="set({ glowSize: $event })" @commit="commit" />
          </div>
          <button v-if="textFxActive" class="btn btn-sm" @click="set({ ...TEXT_EFFECT_DEFAULTS }, true)">{{ t('effects.reset_text') }}</button>
        </details>
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
          <ColorField :value="layer.bandColor" :label="t('editor.frame_band')" @input="set({ bandColor: $event })" @commit="commit" />
          <ColorField :value="layer.ringColor" :label="t('editor.frame_ring')" @input="set({ ringColor: $event })" @commit="commit" />
          <ColorField :value="layer.accentColor" :label="t('editor.frame_accent')" @input="set({ accentColor: $event })" @commit="commit" />
          <label class="checkbox center-toggle">
            <input type="checkbox" :checked="layer.centerColor !== null" @change="set({ centerColor: layer.centerColor === null ? '#ffffff' : null }, true)" />
            {{ t('editor.frame_center') }}
          </label>
          <ColorField v-if="layer.centerColor !== null" :value="layer.centerColor" :aria-label="t('editor.frame_center')" @input="set({ centerColor: $event })" @commit="commit" />
        </div>
        <p class="muted hint-small">{{ t('editor.frame_center_hint') }}</p>
        <div class="field">
          <label for="band-text">{{ t('editor.band_text') }}</label>
          <input id="band-text" class="input" maxlength="40" :value="layer.bandText" :placeholder="t('editor.band_text_placeholder')"
            @input="set({ bandText: ($event.target as HTMLInputElement).value })" @change="commit" />
        </div>
        <div v-if="layer.bandText" class="row band-text-style">
          <ColorField :value="layer.bandTextColor" :label="t('editor.color')" @input="set({ bandTextColor: $event })" @commit="commit" />
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
          <ColorField :value="layer.color" :label="t('editor.color')" @input="set({ color: $event })" @commit="commit" />
          <ColorField :value="layer.strokeColor" :label="t('editor.outline')" @input="set({ strokeColor: $event })" @commit="commit" />
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
            <ColorField :value="layer.color" :label="t('editor.background')" @input="set({ color: $event })" @commit="commit" />
            <ColorField :value="layer.color2 ?? '#000000'" :label="t('editor.pattern_color')" @input="set({ color2: $event })" @commit="commit" />
          </div>
          <NumField :label="t('editor.pattern_scale')" :value="layer.patternScale" unit="mm" :min="0.5" :max="30" :step="0.5"
            slider :decimals="1" @input="set({ patternScale: $event })" @commit="commit" />
          <NumField :label="t('editor.angle')" :value="layer.angle" unit="°" :min="-180" :max="180" :step="1"
            slider :decimals="0" @input="set({ angle: $event })" @commit="commit" />
        </template>
        <div v-else class="row colors">
          <ColorField :value="layer.color" :label="t('editor.color')" @input="set({ color: $event })" @commit="commit" />
          <label class="checkbox">
            <input type="checkbox" :checked="layer.color2 !== null" @change="set({ color2: layer.color2 === null ? '#000000' : null }, true)" />
            {{ t('editor.gradient') }}
          </label>
          <ColorField v-if="layer.color2 !== null" :value="layer.color2" :aria-label="t('editor.gradient')" @input="set({ color2: $event })" @commit="commit" />
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
.fx {
  margin: 10px 0 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.fx > summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 2px 0;
  cursor: pointer;
  list-style: none;
}
.fx > summary::-webkit-details-marker {
  display: none;
}
.fx > summary::before {
  content: '';
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.15s;
}
.fx[open] > summary {
  margin-bottom: 8px;
}
.fx[open] > summary::before {
  transform: rotate(45deg);
}
.fx-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
.fx-toggle {
  font-size: 13px;
  align-items: center;
  margin: 4px 0 8px;
}
.fx-group {
  padding-left: 10px;
  margin-bottom: 8px;
  border-left: 2px solid var(--border);
}
.fx-group > .color-field {
  margin-bottom: 8px;
}
.key-row {
  gap: 12px;
  margin-bottom: 8px;
}
</style>
