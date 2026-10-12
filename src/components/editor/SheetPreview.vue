<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Design } from '@/lib/model'
import { renderDesignCanvas } from '@/lib/render'
import {
  calibrationGeometry,
  cropMarkLines,
  footerGeometry,
  footerLabel,
  PT,
  SHEET_TEXT_PT,
  wrapText,
  type PrintOptions,
  type SheetPlan,
} from '@/lib/pdf'
import { getTemplate } from '@/templates'
import Icon from '@/components/common/Icon.vue'

/**
 * Live picture of the print sheet: same plan as the PDF (planSheet), every sticker as a
 * low-resolution render at its real position, plus cut lines, crop marks, ruler and footer.
 */
const props = defineProps<{
  plan: SheetPlan
  designs: Design[]
  options: Pick<PrintOptions, 'bleedMm' | 'cutLine' | 'cropMarks' | 'calibration' | 'scaleX' | 'scaleY' | 'footerText' | 'calibrationText'>
  /** Design whose stickers are outlined (hovered in the quantity list). */
  highlight?: string | null
}>()
const page = defineModel<number>('page', { default: 0 })
const { t } = useI18n()

const THUMB_PX_PER_MM = 6
const box = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const size = ref({ w: 0, h: 0 })
const pages = computed(() => Math.max(1, props.plan.pages))

watch(
  () => props.plan.pages,
  (n) => {
    if (page.value > Math.max(0, n - 1)) page.value = Math.max(0, n - 1)
  },
)

// ---------- size: fit the page into the available width and a height budget ----------
function measure() {
  const el = box.value
  if (!el) return
  const narrow = window.innerWidth < 820
  const maxH = narrow ? window.innerHeight * 0.48 : Math.min(window.innerHeight * 0.66, 640)
  const ratio = props.plan.pageW / props.plan.pageH
  const w = Math.min(el.clientWidth, maxH * ratio)
  size.value = { w: Math.floor(w), h: Math.floor(w / ratio) }
}
let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(() => measure())
  if (box.value) observer.observe(box.value)
  window.addEventListener('resize', measure)
  measure()
})
watch(() => [props.plan.pageW, props.plan.pageH], measure)

// ---------- thumbnails: every design rendered once, cached by content + bleed ----------
interface Thumb {
  key: string
  image: HTMLCanvasElement
}
const thumbs = new Map<string, Thumb>()
const wanted = new Map<string, string>()
let queue: Promise<void> = Promise.resolve()
let disposed = false

const thumbKey = (d: Design) => `${d.updatedAt}|${props.options.bleedMm}`

function ensureThumbs() {
  const used = new Set(props.plan.items.map((p) => p.id))
  for (const d of props.designs) {
    if (!used.has(d.id)) continue
    const key = thumbKey(d)
    if (thumbs.get(d.id)?.key === key || wanted.get(d.id) === key) continue
    wanted.set(d.id, key)
    const bleedMm = props.options.bleedMm
    queue = queue.then(async () => {
      // Skip renders that were superseded while waiting in the queue.
      if (disposed || wanted.get(d.id) !== key) return
      try {
        const image = await renderDesignCanvas(d, {
          pxPerMm: THUMB_PX_PER_MM,
          bleedMm,
          clip: bleedMm > 0 ? 'bleed' : 'outline',
          background: '#ffffff',
        })
        if (disposed) return
        const old = thumbs.get(d.id)
        if (old) old.image.width = old.image.height = 0
        thumbs.set(d.id, { key, image })
        requestDraw()
      } catch (err) {
        console.warn('preview render failed', err)
      }
    })
  }
}

// ---------- drawing ----------
let frame = 0
function requestDraw() {
  if (frame || disposed) return
  frame = requestAnimationFrame(() => {
    frame = 0
    draw()
  })
}

function draw() {
  const c = canvas.value
  const { w: cssW, h: cssH } = size.value
  if (!c || !cssW) return
  const plan = props.plan
  const o = props.options
  const dpr = window.devicePixelRatio || 1
  c.width = Math.round(cssW * dpr)
  c.height = Math.round(cssH * dpr)
  const ctx = c.getContext('2d')!
  const k = c.width / plan.pageW // device px per mm
  const px = 1 / k
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, plan.pageW, plan.pageH)
  ctx.imageSmoothingQuality = 'high'
  ctx.lineJoin = 'round'

  const p = Math.min(page.value, Math.max(0, plan.pages - 1))
  const items = plan.items.filter((it) => it.page === p)
  const byId = new Map(props.designs.map((d) => [d.id, d]))

  for (const it of items) {
    const thumb = thumbs.get(it.id)
    if (thumb) {
      ctx.drawImage(thumb.image, it.x, it.y, it.w, it.h)
    } else {
      // Not rendered yet: the cut shape as a light silhouette.
      ctx.fillStyle = '#eceff3'
      ctx.fillRect(it.x, it.y, it.w, it.h)
    }
  }

  if (o.cutLine) {
    for (const it of items) {
      const d = byId.get(it.id)
      if (!d) continue
      const path = new Path2D()
      getTemplate(d.templateId).outline.forEach(([x, y], i) => {
        const X = it.cutX + x * o.scaleX
        const Y = it.cutY + y * o.scaleY
        if (i) path.lineTo(X, Y)
        else path.moveTo(X, Y)
      })
      path.closePath()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(0.45, 2.5 * px)
      ctx.stroke(path)
      ctx.strokeStyle = 'rgb(40, 40, 40)'
      ctx.lineWidth = Math.max(0.15, px)
      ctx.stroke(path)
    }
  }

  if (o.cropMarks) {
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.max(0.15, px)
    ctx.beginPath()
    for (const it of items) {
      for (const [x1, y1, x2, y2] of cropMarkLines(it.x, it.y, it.w, it.h)) {
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      }
    }
    ctx.stroke()
  }

  if (props.highlight) {
    ctx.strokeStyle = '#d6352e'
    ctx.lineWidth = 2 * px * dpr
    for (const it of items) {
      if (it.id === props.highlight) ctx.strokeRect(it.x - 0.8, it.y - 0.8, it.w + 1.6, it.h + 1.6)
    }
  }

  // Text is set in device pixels so tiny sizes are not rounded by the browser.
  const text = (s: string, x: number, y: number, maxW: number, gray: number) => {
    if (!s) return
    const sizePx = SHEET_TEXT_PT * PT * k
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.font = `${sizePx}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
    wrapText(ctx, s, maxW * k).forEach((line, i) => ctx.fillText(line, x * k, y * k + i * sizePx * 1.3))
    ctx.restore()
  }

  if (p === 0 && o.calibration) {
    const g = calibrationGeometry(o)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.max(0.2, px)
    ctx.strokeRect(g.square.x, g.square.y, g.square.w, g.square.h)
    ctx.beginPath()
    ctx.moveTo(g.ruler.x, g.ruler.y)
    ctx.lineTo(g.ruler.x + g.ruler.len, g.ruler.y)
    for (const tick of g.ticks) {
      ctx.moveTo(tick.x, g.ruler.y)
      ctx.lineTo(tick.x, g.ruler.y - tick.len)
    }
    ctx.stroke()
    text(o.calibrationText, g.text.x, g.text.y, g.text.maxW, 90)
  }

  const f = footerGeometry(plan.pageW, plan.pageH)
  text(footerLabel(o.footerText, p, pages.value), f.x, f.y, f.maxW, 140)
}

// Plan/options changes redraw on the next frame; re-rendering thumbnails is debounced.
let thumbTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [props.plan, props.designs, props.options.bleedMm],
  () => {
    clearTimeout(thumbTimer)
    // The first renders start right away; later changes (bleed slider, steppers) are batched.
    thumbTimer = setTimeout(ensureThumbs, thumbs.size ? 200 : 0)
  },
  { immediate: true },
)
watch(() => [props.plan, props.options, props.highlight, page.value, size.value], requestDraw, { deep: true, immediate: true })

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  cancelAnimationFrame(frame)
  clearTimeout(thumbTimer)
  for (const th of thumbs.values()) th.image.width = th.image.height = 0
  thumbs.clear()
})

const usagePct = computed(() => Math.round((props.plan.usage[page.value] ?? 0) * 100))
</script>

<template>
  <div class="sheet-preview">
    <div ref="box" class="stage">
      <canvas
        ref="canvas"
        class="paper"
        :style="{ width: `${size.w}px`, height: `${size.h}px` }"
        role="img"
        :aria-label="t('print.preview_page', { page: page + 1, pages })"
      />
      <p v-if="!plan.pages" class="empty muted">{{ t('print.preview_empty') }}</p>
    </div>
    <div class="row pager">
      <button class="btn btn-ghost btn-icon btn-sm" :disabled="page <= 0" :aria-label="t('print.prev_page')"
        :title="t('print.prev_page')" @click="page--">
        <Icon name="up" :size="14" class="left" />
      </button>
      <span class="label">{{ t('print.preview_page', { page: page + 1, pages }) }}</span>
      <button class="btn btn-ghost btn-icon btn-sm" :disabled="page >= pages - 1" :aria-label="t('print.next_page')"
        :title="t('print.next_page')" @click="page++">
        <Icon name="up" :size="14" class="right" />
      </button>
      <span class="spacer" />
      <span v-if="plan.pages" class="muted small">{{ t('print.page_usage', { pct: usagePct }) }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 120px;
}
.paper {
  display: block;
  border-radius: 2px;
  background: #ffffff;
  box-shadow:
    0 0 0 1px var(--border-strong),
    0 6px 20px rgba(0, 0, 0, 0.25);
}
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: #6a5f5f;
}
.pager {
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
}
.label {
  min-width: 90px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.left {
  transform: rotate(-90deg);
}
.right {
  transform: rotate(90deg);
}
.small {
  font-size: 12px;
}
</style>
