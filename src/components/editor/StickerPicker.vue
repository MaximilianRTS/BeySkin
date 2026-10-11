<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { drawPattern, FRAME_CREDIT, FRAMES, PATTERN_IDS, SHAPES, type FrameDef, type PatternId, type ShapeCategory, type ShapeDef } from '@/lib/library'

const props = defineProps<{ initialTab?: 'shapes' | 'patterns' | 'frames' }>()
const emit = defineEmits<{ shape: [shape: ShapeDef]; pattern: [id: PatternId]; frame: [frame: FrameDef]; close: [] }>()
const { t } = useI18n()

const tab = ref<'shapes' | 'patterns' | 'frames'>(props.initialTab ?? 'shapes')
const categories = computed(() => {
  const order: ShapeCategory[] = ['basic', 'action', 'symbols', 'frames']
  return order.map((cat) => ({ cat, items: SHAPES.filter((s) => s.category === cat) })).filter((g) => g.items.length)
})

const canvases = ref<Record<string, HTMLCanvasElement | null>>({})
function setCanvas(id: string, el: unknown) {
  canvases.value[id] = el as HTMLCanvasElement | null
}

async function paintPatterns() {
  await nextTick()
  for (const id of PATTERN_IDS) {
    const c = canvases.value[id]
    if (!c) continue
    const ctx = c.getContext('2d')!
    const pxPerMm = c.width / 30
    ctx.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0)
    ctx.fillStyle = '#7c5cff'
    ctx.fillRect(0, 0, 30, 30)
    drawPattern(ctx, id, 30, 30, '#ffffff', '#7c5cff', 4, 0)
  }
}
watch(tab, (v) => v === 'patterns' && void paintPatterns())
onMounted(() => tab.value === 'patterns' && void paintPatterns())

const frameKey = (f: FrameDef) => `editor.${f.id.replace(/-/g, '_')}`

const dialog = ref<HTMLDivElement>()
onMounted(() => dialog.value?.focus())
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="dialog" class="dialog picker" role="dialog" aria-modal="true" :aria-label="t('shapes.library')" tabindex="-1">
      <div class="row head">
        <h2>{{ t('shapes.library') }}</h2>
        <span class="spacer" />
        <button class="btn btn-ghost btn-icon" :aria-label="t('common.close')" @click="emit('close')">✕</button>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" class="btn btn-sm" :class="{ active: tab === 'shapes' }" :aria-selected="tab === 'shapes'" @click="tab = 'shapes'">
          {{ t('editor.lib_shapes') }}
        </button>
        <button role="tab" class="btn btn-sm" :class="{ active: tab === 'frames' }" :aria-selected="tab === 'frames'" @click="tab = 'frames'">
          {{ t('editor.lib_frames') }}
        </button>
        <button role="tab" class="btn btn-sm" :class="{ active: tab === 'patterns' }" :aria-selected="tab === 'patterns'" @click="tab = 'patterns'">
          {{ t('editor.lib_patterns') }}
        </button>
      </div>

      <div v-if="tab === 'shapes'" class="scroll">
        <section v-for="g in categories" :key="g.cat">
          <h3 class="panel-title">{{ t(`shapes.category_${g.cat}`) }}</h3>
          <div class="grid">
            <button v-for="s in g.items" :key="s.id" class="tile" :title="t(`shapes.${s.id}`)" :aria-label="t(`shapes.${s.id}`)" @click="emit('shape', s)">
              <svg :viewBox="`0 0 ${s.width} ${s.height}`" aria-hidden="true">
                <path :d="s.d" :fill-rule="s.evenodd ? 'evenodd' : 'nonzero'" />
              </svg>
            </button>
          </div>
        </section>
      </div>

      <div v-else-if="tab === 'frames'" class="scroll">
        <p class="muted small">{{ t('editor.lib_frames_hint') }}</p>
        <div class="grid frames">
          <button v-for="f in FRAMES" :key="f.id" class="tile frame" :title="t(frameKey(f))" @click="emit('frame', f)">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path :d="f.band" fill="#ff3d8b" fill-rule="evenodd" />
              <path :d="f.ring" fill="#000" fill-rule="evenodd" />
              <path :d="f.accent" fill="#fff" fill-rule="evenodd" />
            </svg>
            <span>{{ t(frameKey(f)) }}</span>
          </button>
        </div>
        <p class="credit small">
          {{ t('editor.frame_credit') }}
          <a :href="FRAME_CREDIT.url" target="_blank" rel="noopener">{{ FRAME_CREDIT.author }} ({{ FRAME_CREDIT.handle }})</a>
        </p>
      </div>

      <div v-else class="scroll">
        <p class="muted small">{{ t('editor.lib_patterns_hint') }}</p>
        <div class="grid patterns">
          <button v-for="id in PATTERN_IDS" :key="id" class="tile pattern" :title="t(`shapes.pattern_${id}`)" @click="emit('pattern', id)">
            <canvas :ref="(el) => setCanvas(id, el)" width="120" height="120" />
            <span>{{ t(`shapes.pattern_${id}`) }}</span>
          </button>
        </div>
      </div>
      <p v-if="tab !== 'frames'" class="muted tiny">{{ t('editor.lib_license') }}</p>
    </div>
  </div>
</template>

<style scoped>
.picker {
  width: min(620px, 100%);
}
.head h2 {
  margin: 0;
}
.tabs {
  display: flex;
  gap: 6px;
  margin: 10px 0;
}
.scroll {
  max-height: min(60dvh, 520px);
  overflow-y: auto;
  padding-right: 4px;
}
section + section {
  margin-top: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 6px;
}
.tile {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}
.tile:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.tile svg {
  width: 100%;
  height: 100%;
}
.tile path {
  fill: currentColor;
}
.patterns {
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
}
.tile.pattern {
  aspect-ratio: auto;
  padding: 6px;
  gap: 4px;
  font: inherit;
  font-size: 12px;
}
.tile canvas {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
}
.small {
  font-size: 13px;
}
.frames {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}
.tile.frame {
  aspect-ratio: auto;
  gap: 4px;
  font: inherit;
  font-size: 12px;
  /* Frames are black/white – show them on a coloured disc like on the chip. */
  background: var(--surface-2);
}
.tile.frame svg {
  width: 100%;
  aspect-ratio: 1;
}
.credit {
  margin: 12px 0 0;
  color: var(--text-muted);
}
.tiny {
  font-size: 11px;
  margin: 10px 0 0;
}
</style>
