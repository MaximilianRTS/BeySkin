<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Number input with optional slider. Emits `input` while dragging (live preview)
 * and `commit` once the change is finished, so the editor records one undo step.
 */
const props = withDefaults(
  defineProps<{ label: string; value: number; min?: number; max?: number; step?: number; unit?: string; slider?: boolean; decimals?: number }>(),
  { min: -1e4, max: 1e4, step: 0.1, unit: '', slider: false, decimals: 2 },
)
const emit = defineEmits<{ input: [v: number]; commit: [] }>()
const id = useId()

const shown = computed(() => +props.value.toFixed(props.decimals))

function parse(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value.replace(',', '.'))
  if (Number.isFinite(v)) emit('input', Math.min(props.max, Math.max(props.min, v)))
}
</script>

<template>
  <div class="num-field">
    <label :for="id" class="field-label">{{ label }}</label>
    <div class="controls">
      <input
        v-if="slider"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="value"
        :aria-label="label"
        @input="parse"
        @change="emit('commit')"
      />
      <div class="num">
        <input
          :id="id"
          class="input"
          type="number"
          inputmode="decimal"
          :min="min"
          :max="max"
          :step="step"
          :value="shown"
          @input="parse"
          @change="emit('commit')"
        />
        <span v-if="unit" class="unit">{{ unit }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.num-field {
  margin-bottom: 8px;
}
.controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
.num {
  position: relative;
  flex: none;
  width: 92px;
}
.controls > .num:only-child {
  width: 100%;
}
.num .input {
  padding-right: 28px;
}
.unit {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 11px;
  pointer-events: none;
}
</style>
