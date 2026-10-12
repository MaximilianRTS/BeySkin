<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import type { DistributeMode } from '@/lib/selection'
import Icon from '@/components/common/Icon.vue'

const { t } = useI18n()
const store = useEditorStore()

const ALIGN = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const
/** Align relative to the selection's own bounds or to the whole label. */
const alignTo = ref<'selection' | 'label'>('selection')
const spacing = ref<DistributeMode>('gaps')

const allLocked = computed(() => store.selection.every((l) => l.locked))
const allHidden = computed(() => store.selection.every((l) => !l.visible))
/** The selection is exactly one group already. */
const isOneGroup = computed(() => {
  const g = store.selection[0]?.groupId
  return !!g && store.selection.every((l) => l.groupId === g) && store.design.layers.filter((l) => l.groupId === g).length === store.selection.length
})
const anyGrouped = computed(() => store.selection.some((l) => l.groupId))
const groupable = computed(() => store.selection.filter((l) => l.type !== 'fill').length >= 2)
</script>

<template>
  <div class="multi">
    <p class="count">
      <Icon name="group" /> {{ t('selection.count', { n: store.selection.length }) }}
      <span v-if="isOneGroup" class="badge">{{ t('selection.group_badge') }}</span>
    </p>
    <p class="muted hint">{{ t('selection.multi_hint') }}</p>

    <div class="panel-title section">{{ t('selection.align') }}</div>
    <div class="seg" role="radiogroup" :aria-label="t('selection.align_to')">
      <span class="seg-label">{{ t('selection.align_to') }}</span>
      <button v-for="to in (['selection', 'label'] as const)" :key="to" class="btn btn-sm" :class="{ active: alignTo === to }"
        role="radio" :aria-checked="alignTo === to" @click="alignTo = to">
        {{ t(`selection.align_to_${to}`) }}
      </button>
    </div>
    <div class="row wrap tight" role="group" :aria-label="t('selection.align')">
      <button v-for="a in ALIGN" :key="a" class="btn btn-sm btn-icon" :title="t(`editor.al_${a}`)" :aria-label="t(`editor.al_${a}`)"
        @click="store.alignSelection(a, alignTo)"><Icon :name="`al-${a}`" /></button>
    </div>

    <div class="panel-title section">{{ t('selection.distribute') }}</div>
    <div class="row wrap">
      <select v-model="spacing" class="input spacing" :aria-label="t('selection.distribute')">
        <option value="gaps">{{ t('selection.dist_gaps') }}</option>
        <option value="centers">{{ t('selection.dist_centers') }}</option>
      </select>
      <button class="btn btn-sm btn-icon" :disabled="!store.distributable" :title="t('selection.distribute_h')" :aria-label="t('selection.distribute_h')"
        @click="store.distributeSelection('x', spacing)"><Icon name="dist-h" /></button>
      <button class="btn btn-sm btn-icon" :disabled="!store.distributable" :title="t('selection.distribute_v')" :aria-label="t('selection.distribute_v')"
        @click="store.distributeSelection('y', spacing)"><Icon name="dist-v" /></button>
    </div>
    <p v-if="!store.distributable" class="muted hint-small">{{ t('selection.distribute_hint') }}</p>

    <div class="panel-title section">{{ t('selection.arrange') }}</div>
    <div class="row wrap">
      <button class="btn btn-sm" :disabled="!groupable || isOneGroup" :title="t('selection.group') + ' (Ctrl+G)'" @click="store.groupSelected()">
        <Icon name="group" /> {{ t('selection.group') }}
      </button>
      <button class="btn btn-sm" :disabled="!anyGrouped" :title="t('selection.ungroup') + ' (Ctrl+Shift+G)'" @click="store.ungroupSelected()">
        <Icon name="ungroup" /> {{ t('selection.ungroup') }}
      </button>
    </div>
    <div class="row wrap">
      <button class="btn btn-sm" @click="store.setSelectionFlag('locked', !allLocked)">
        <Icon :name="allLocked ? 'unlock' : 'lock'" /> {{ allLocked ? t('selection.unlock_all') : t('selection.lock_all') }}
      </button>
      <button class="btn btn-sm" @click="store.setSelectionFlag('visible', allHidden)">
        <Icon :name="allHidden ? 'eye' : 'eye-off'" /> {{ allHidden ? t('selection.show_all') : t('selection.hide_all') }}
      </button>
    </div>
    <div class="row wrap">
      <button class="btn btn-sm" :title="t('editor.duplicate') + ' (Ctrl+D)'" @click="store.duplicateSelected()">
        <Icon name="copy" /> {{ t('editor.duplicate') }}
      </button>
      <button class="btn btn-sm btn-danger" :title="t('editor.delete') + ' (Del)'" @click="store.removeSelected()">
        <Icon name="trash" /> {{ t('editor.delete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.count {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-weight: 700;
}
.hint {
  font-size: 12px;
  margin: 0 0 6px;
}
.hint-small {
  font-size: 11px;
  margin: -2px 0 8px;
}
.section {
  margin-top: 14px;
}
.wrap {
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.tight {
  gap: 4px;
}
.seg {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}
.seg-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-right: 4px;
}
.spacing {
  width: auto;
  flex: 1;
  min-height: 28px;
  padding: 2px 6px;
  font-size: 13px;
}
</style>
