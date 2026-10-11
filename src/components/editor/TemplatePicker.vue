<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEMPLATES, type StickerTemplate } from '@/templates'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const { t } = useI18n()

const groups = computed(() => {
  const order: StickerTemplate['category'][] = ['battlepass', 'bey']
  return order
    .map((cat) => ({ cat, items: TEMPLATES.filter((tp) => tp.category === cat) }))
    .filter((g) => g.items.length)
})

function points(tp: StickerTemplate) {
  const f = 56 / Math.max(tp.widthMm, tp.heightMm * 2.2)
  return tp.outline.map(([x, y]) => `${(x * f).toFixed(1)},${(y * f).toFixed(1)}`).join(' ')
}
function viewBox(tp: StickerTemplate) {
  const f = 56 / Math.max(tp.widthMm, tp.heightMm * 2.2)
  return `-1 -1 ${tp.widthMm * f + 2} ${tp.heightMm * f + 2}`
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
          <span class="name">{{ t(`templates.${tp.i18nKey}`) }}</span>
          <span class="dims">
            {{ tp.widthMm }} × {{ tp.heightMm }} mm
            <span v-if="!tp.measured" class="badge badge-warning" :title="t('templates.estimated_hint')">
              {{ t('templates.estimated') }}
            </span>
          </span>
        </span>
      </button>
    </div>
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
</style>
