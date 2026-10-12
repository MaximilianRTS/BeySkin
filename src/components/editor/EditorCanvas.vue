<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { getAlphaMaskSync, getBitmapSync } from '@/lib/assets'
import { drawLayers, layerSize, outlinePath } from '@/lib/render'
import { hitStack } from '@/lib/hittest'
import {
  boundsOf,
  boxCenter,
  boxesIntersect,
  boxLines,
  normalizeAngle,
  rectFromPoints,
  snapAxis,
  transformAround,
  unionBoxes,
  type Box,
} from '@/lib/selection'
import type { Layer } from '@/lib/model'

const props = withDefaults(
  defineProps<{ showBleed?: boolean; bleedMm?: number; paper?: string; hideOutside?: boolean; showSafe?: boolean }>(),
  {
    showBleed: false,
    hideOutside: false,
    showSafe: false,
    bleedMm: 2,
    paper: '#ffffff',
  },
)
const emit = defineEmits<{ editText: [id: string] }>()

const { t } = useI18n()
const store = useEditorStore()
const { design, template } = storeToRefs(store)

const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const zoomLabel = ref('100%')

// View transform (CSS px). zoom = 1 means "label fits the viewport".
const view = { zoom: 1, panX: 0, panY: 0 }
// Space around the label; smaller in tiny views (e.g. the mini preview in 3D mode).
const margin = () => Math.min(48, Math.min(cssW, cssH) * 0.1)
const HANDLE = 9 // css px
const ROTATE_OFFSET = 26 // css px above the box
const SNAP_PX = 6
/** Click (without dragging) tolerance in css px. */
const CLICK_PX = 3

let ctx: CanvasRenderingContext2D | null = null
let layerCanvas: HTMLCanvasElement | null = null
let ghostCanvas: HTMLCanvasElement | null = null
let dpr = 1
let cssW = 0
let cssH = 0
let dirty = true
let raf = 0
/** Active snap lines in mm (label coordinates). */
let guides: { x: number[]; y: number[] } = { x: [], y: [] }
let hoverId: string | null = null
let sizeReadout: string | null = null
let themeColors = { bg: '#1e2430', outline: '#7c5cff', ghost: 0.28 }

/** Width of the safe-zone band inside the cut line (mm). */
const safeMm = () => template.value.safeMm ?? 1.5

// ---------- geometry ----------
function fitScale() {
  const tpl = template.value
  const m = margin()
  return Math.max(0.1, Math.min((cssW - m * 2) / tpl.widthMm, (cssH - m * 2) / tpl.heightMm))
}
/** CSS px per mm. */
function scale() {
  return fitScale() * view.zoom
}
function origin() {
  const s = scale()
  return {
    x: cssW / 2 + view.panX - (template.value.widthMm * s) / 2,
    y: cssH / 2 + view.panY - (template.value.heightMm * s) / 2,
  }
}
function toMm(px: number, py: number) {
  const o = origin()
  const s = scale()
  return { x: (px - o.x) / s, y: (py - o.y) / s }
}
function toPx(mx: number, my: number) {
  const o = origin()
  const s = scale()
  return { x: o.x + mx * s, y: o.y + my * s }
}

/** A rotated rectangle in mm: a layer's own box or the box around a multi-selection. */
interface Frame {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
}

function layerFrame(l: Layer): Frame {
  const { w, h } = layerSize(l, template.value)
  return { cx: l.x, cy: l.y, w, h, angle: l.rotation }
}

function layerBounds(l: Layer): Box {
  return boundsOf(l, layerSize(l, template.value))
}

function boxFrame(b: Box): Frame {
  const c = boxCenter(b)
  return { cx: c.x, cy: c.y, w: b.x2 - b.x1, h: b.y2 - b.y1, angle: 0 }
}

/** Corners of a frame in CSS px (tl, tr, br, bl). */
function frameCorners(f: Frame) {
  const a = (f.angle * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return [
    [-f.w / 2, -f.h / 2],
    [f.w / 2, -f.h / 2],
    [f.w / 2, f.h / 2],
    [-f.w / 2, f.h / 2],
  ].map(([dx, dy]) => toPx(f.cx + dx * cos - dy * sin, f.cy + dx * sin + dy * cos))
}

function rotateHandlePos(f: Frame) {
  const [tl, tr] = frameCorners(f)
  const mx = (tl.x + tr.x) / 2
  const my = (tl.y + tr.y) / 2
  const a = (f.angle * Math.PI) / 180
  return { x: mx + Math.sin(a) * ROTATE_OFFSET, y: my - Math.cos(a) * ROTATE_OFFSET }
}

/** Frozen box of a multi-selection while it is scaled/rotated (the union would jump around). */
let liveFrame: Frame | null = null

/** Box that carries the transform handles: the layer's own for one, the combined one for several. */
function handleFrame(): Frame | null {
  if (store.selectedIds.length > 1) {
    if (liveFrame) return liveFrame
    const m = store.movable
    return m.length ? boxFrame(unionBoxes(m.map(layerBounds))!) : null
  }
  const l = store.selected
  if (!l || l.type === 'fill' || l.locked) return null
  return layerFrame(l)
}

/**
 * Topmost layer that is visibly present under the pointer. Transparent pixels,
 * open frame centres etc. are click-through. With `cycle`, returns the next layer
 * below the current selection at that point (Alt+click).
 */
function hitLayer(px: number, py: number, cycle = false): Layer | null {
  const stack = hitStack(design.value, template.value, toMm(px, py))
  if (!stack.length) return null
  if (cycle && store.selectedId) {
    const i = stack.findIndex((l) => l.id === store.selectedId)
    if (i >= 0) return stack[(i + 1) % stack.length]
  }
  return stack[0]
}

function insideFrame(f: Frame, px: number, py: number): boolean {
  const p = toMm(px, py)
  const a = (-f.angle * Math.PI) / 180
  const dx = p.x - f.cx
  const dy = p.y - f.cy
  return Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= f.w / 2 && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= f.h / 2
}

type HandleHit = { kind: 'scale'; corner: number } | { kind: 'rotate' } | null
function hitHandle(px: number, py: number): HandleHit {
  const f = handleFrame()
  if (!f) return null
  const r = HANDLE + 4
  const rot = rotateHandlePos(f)
  if (Math.hypot(px - rot.x, py - rot.y) <= r) return { kind: 'rotate' }
  const corners = frameCorners(f)
  for (let i = 0; i < 4; i++) if (Math.hypot(px - corners[i].x, py - corners[i].y) <= r) return { kind: 'scale', corner: i }
  return null
}

// ---------- rendering ----------
function requestDraw() {
  dirty = true
  if (!raf) raf = requestAnimationFrame(frame)
}

function frame() {
  raf = 0
  if (!dirty || !ctx || !canvas.value) return
  dirty = false
  draw()
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement)
  themeColors = {
    bg: cs.getPropertyValue('--surface-2').trim() || '#1e2430',
    outline: cs.getPropertyValue('--accent').trim() || '#7c5cff',
    ghost: 0.28,
  }
}

function strokePoly(c: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  c.beginPath()
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)))
  c.closePath()
  c.stroke()
}

function draw() {
  const c = ctx!
  const lc = layerCanvas!
  const lctx = lc.getContext('2d')!
  const tpl = template.value
  const s = scale()
  const o = origin()
  const S = s * dpr

  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = themeColors.bg
  c.fillRect(0, 0, canvas.value!.width, canvas.value!.height)

  // Layers into an offscreen buffer so blend modes behave exactly like the export.
  lctx.setTransform(1, 0, 0, 1, 0, 0)
  lctx.clearRect(0, 0, lc.width, lc.height)
  lctx.setTransform(S, 0, 0, S, o.x * dpr, o.y * dpr)
  lctx.imageSmoothingQuality = 'high'
  drawLayers(lctx, design.value, tpl, S, 0, (id) => getBitmapSync(id, requestDraw), true)

  const shape = outlinePath(tpl)

  // Paper inside the cut line
  c.setTransform(S, 0, 0, S, o.x * dpr, o.y * dpr)
  c.fillStyle = props.paper
  c.fill(shape)
  if (props.showBleed) {
    c.fillStyle = 'rgba(255,255,255,0.07)'
    c.fillRect(-props.bleedMm, -props.bleedMm, tpl.widthMm + props.bleedMm * 2, tpl.heightMm + props.bleedMm * 2)
  }

  // Ghost outside the label: only placed elements (images, text, shapes) – full-area
  // backgrounds and frames would just tint the workspace.
  const ghostLayers = design.value.layers.filter((l) => l.type !== 'fill' && l.type !== 'frame')
  if (ghostLayers.length && !props.hideOutside) {
    const gctx = ghostCanvas!.getContext('2d')!
    gctx.setTransform(1, 0, 0, 1, 0, 0)
    gctx.clearRect(0, 0, ghostCanvas!.width, ghostCanvas!.height)
    gctx.setTransform(S, 0, 0, S, o.x * dpr, o.y * dpr)
    drawLayers(gctx, { ...design.value, layers: ghostLayers }, tpl, S, 0, (id) => getBitmapSync(id, requestDraw))
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalAlpha = themeColors.ghost
    c.drawImage(ghostCanvas!, 0, 0)
    c.restore()
  }

  // Full-strength inside the label (or bleed box)
  c.save()
  c.setTransform(S, 0, 0, S, o.x * dpr, o.y * dpr)
  if (props.showBleed) {
    c.beginPath()
    c.rect(-props.bleedMm, -props.bleedMm, tpl.widthMm + props.bleedMm * 2, tpl.heightMm + props.bleedMm * 2)
    c.clip()
  } else {
    c.clip(shape)
  }
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.drawImage(lc, 0, 0)
  c.restore()

  // Safe zone: band inside the cut line where content may get cut off.
  if (props.showSafe) {
    c.save()
    c.setTransform(S, 0, 0, S, o.x * dpr, o.y * dpr)
    c.clip(shape)
    c.lineWidth = safeMm() * 2
    c.lineJoin = 'round'
    c.strokeStyle = 'rgba(255, 170, 30, 0.38)'
    c.stroke(shape)
    c.restore()
  }

  // Cut line
  c.save()
  c.setTransform(S, 0, 0, S, o.x * dpr, o.y * dpr)
  // Dark underlay + dashed accent line stays visible on light and dark artwork.
  c.lineWidth = 3 / S
  c.strokeStyle = 'rgba(0,0,0,0.55)'
  c.stroke(shape)
  c.lineWidth = 1.5 / S
  c.setLineDash([6 / S, 4 / S])
  c.strokeStyle = '#ffffff'
  c.stroke(shape)
  c.restore()

  // Snap guides
  c.save()
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.strokeStyle = '#ff4fa3'
  c.lineWidth = 1
  for (const gx of guides.x) {
    const p = toPx(gx, 0)
    c.beginPath()
    c.moveTo(p.x, 0)
    c.lineTo(p.x, cssH)
    c.stroke()
  }
  for (const gy of guides.y) {
    const p = toPx(0, gy)
    c.beginPath()
    c.moveTo(0, p.y)
    c.lineTo(cssW, p.y)
    c.stroke()
  }

  // Hover outline: shows which element (or whole group) a click would grab.
  if (hoverId && !store.isSelected(hoverId)) {
    c.save()
    c.setLineDash([4, 3])
    c.strokeStyle = 'rgba(255,255,255,0.7)'
    c.lineWidth = 1
    for (const id of store.groupOf(hoverId)) {
      const hover = design.value.layers.find((l) => l.id === id)
      if (hover && hover.visible && hover.type !== 'fill') strokePoly(c, frameCorners(layerFrame(hover)))
    }
    c.restore()
  }

  // Selection
  const multi = store.selectedIds.length > 1
  if (multi) {
    // Thin outline per member, then the combined box with the handles.
    c.save()
    c.strokeStyle = themeColors.outline
    c.globalAlpha = 0.65
    c.lineWidth = 1
    for (const l of store.selection) if (l.visible && l.type !== 'fill') strokePoly(c, frameCorners(layerFrame(l)))
    c.restore()
  }
  const sel = store.selected
  let box: Frame | null = null
  let handles = false
  if (multi) {
    box = handleFrame()
    handles = !!box
  } else if (sel && sel.visible && sel.type !== 'fill') {
    box = layerFrame(sel)
    handles = !sel.locked
  }
  if (box) {
    const corners = frameCorners(box)
    c.strokeStyle = themeColors.outline
    c.lineWidth = 1.5
    strokePoly(c, corners)
    if (handles) {
      const rot = rotateHandlePos(box)
      const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }
      c.beginPath()
      c.moveTo(topMid.x, topMid.y)
      c.lineTo(rot.x, rot.y)
      c.stroke()
      c.fillStyle = '#fff'
      for (const p of corners) {
        c.beginPath()
        c.rect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE)
        c.fill()
        c.stroke()
      }
      c.beginPath()
      c.arc(rot.x, rot.y, HANDLE / 2 + 1, 0, Math.PI * 2)
      c.fill()
      c.stroke()
    }
    if (sizeReadout) {
      const bottom = corners.reduce((a, p) => (p.y > a.y ? p : a))
      c.font = '600 12px Inter, system-ui, sans-serif'
      const tw = c.measureText(sizeReadout).width + 12
      const bx = Math.min(Math.max(4, bottom.x - tw / 2), cssW - tw - 4)
      const by = Math.min(bottom.y + 10, cssH - 26)
      c.fillStyle = 'rgba(0,0,0,0.75)'
      c.beginPath()
      c.roundRect(bx, by, tw, 20, 10)
      c.fill()
      c.fillStyle = '#fff'
      c.textBaseline = 'middle'
      c.fillText(sizeReadout, bx + 6, by + 10)
    }
  }

  // Rubber band
  if (drag?.mode === 'marquee') {
    const x = Math.min(drag.start.x, drag.current.x)
    const y = Math.min(drag.start.y, drag.current.y)
    const w = Math.abs(drag.current.x - drag.start.x)
    const h = Math.abs(drag.current.y - drag.start.y)
    c.fillStyle = 'rgba(124, 92, 255, 0.12)'
    c.fillRect(x, y, w, h)
    c.setLineDash([4, 3])
    c.strokeStyle = themeColors.outline
    c.lineWidth = 1
    c.strokeRect(x + 0.5, y + 0.5, w, h)
  }
  c.restore()
  zoomLabel.value = `${Math.round(view.zoom * 100)}%`
}

function resize() {
  const el = wrap.value
  const cv = canvas.value
  if (!el || !cv) return
  dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  cssW = el.clientWidth
  cssH = el.clientHeight
  cv.width = Math.max(1, Math.round(cssW * dpr))
  cv.height = Math.max(1, Math.round(cssH * dpr))
  layerCanvas!.width = ghostCanvas!.width = cv.width
  layerCanvas!.height = ghostCanvas!.height = cv.height
  readTheme()
  requestDraw()
}

// ---------- interaction ----------
/** Start state of a scale/rotate/pinch: positions are transformed around the frame centre. */
interface TransformStart {
  frame: Frame
  items: Array<{ id: string; x: number; y: number; size: number; rotation: number }>
}

type Drag =
  | {
      mode: 'move'
      startPx: { x: number; y: number }
      startMm: { x: number; y: number }
      starts: Array<{ id: string; x: number; y: number }>
      box: Box | null
      targets: { x: number[]; y: number[] }
      /** Plain click (no drag) on a member of a bigger selection selects just that element. */
      collapseTo: string[] | null
    }
  | { mode: 'scale'; t: TransformStart; startDist: number }
  | { mode: 'rotate'; t: TransformStart; startAngle: number }
  | { mode: 'pan'; startX: number; startY: number; panStart: { x: number; y: number } }
  | { mode: 'pinch'; t: TransformStart | null; startDist: number; startAngle: number; startZoom: number }
  | { mode: 'marquee'; start: { x: number; y: number }; current: { x: number; y: number }; base: string[] }

const pointers = new Map<number, { x: number; y: number }>()
let drag: Drag | null = null
let changed = false
let spaceDown = false

function localPoint(e: PointerEvent | WheelEvent | MouseEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

/** The property that controls a layer's size (scale/pinch handles change it). */
function sizeOf(l: Layer) {
  switch (l.type) {
    case 'image':
    case 'shape':
    case 'frame':
      return l.width
    case 'text':
      return l.fontSize
    case 'fill':
      return 1
  }
}
function setSize(l: Layer, v: number) {
  const size = +Math.max(0.5, v).toFixed(3)
  switch (l.type) {
    case 'image':
    case 'shape':
    case 'frame':
      l.width = size
      break
    case 'text':
      l.fontSize = size
      break
  }
}

function layerById(id: string | null) {
  return design.value.layers.find((l) => l.id === id) ?? null
}

/** Layers a handle/pinch transforms: the movable part of a multi-selection, or the single one. */
function transformTargets(): Layer[] {
  if (store.selectedIds.length > 1) return store.movable
  const l = store.selected
  return l && l.type !== 'fill' && !l.locked ? [l] : []
}

function transformStart(layers: Layer[], f: Frame): TransformStart {
  return { frame: f, items: layers.map((l) => ({ id: l.id, x: l.x, y: l.y, size: sizeOf(l), rotation: l.rotation })) }
}

/** Scales by `f` and rotates by `deg` around the frame centre: sizes, offsets and rotations. */
function applyTransform(ts: TransformStart, f: number, deg: number) {
  const c = { x: ts.frame.cx, y: ts.frame.cy }
  for (const it of ts.items) {
    const l = layerById(it.id)
    if (!l) continue
    const p = transformAround(it, c, f, deg)
    l.x = p.x
    l.y = p.y
    setSize(l, it.size * f)
    l.rotation = deg ? +normalizeAngle(it.rotation + deg).toFixed(2) : it.rotation
  }
  if (ts.items.length > 1 || store.selectedIds.length > 1) {
    liveFrame = { ...ts.frame, w: ts.frame.w * f, h: ts.frame.h * f, angle: ts.frame.angle + deg }
  }
  changed = true
}

function startPinch() {
  const [a, b] = [...pointers.values()]
  const layers = transformTargets()
  const f = handleFrame()
  drag = {
    mode: 'pinch',
    t: layers.length && f ? transformStart(layers, f) : null,
    startDist: Math.hypot(b.x - a.x, b.y - a.y),
    startAngle: Math.atan2(b.y - a.y, b.x - a.x),
    startZoom: view.zoom,
  }
}

/** Snap lines: label edges/centre, safe-zone insets (when shown) and other visible elements. */
function snapTargets(exclude: Set<string>) {
  const tpl = template.value
  const x = [0, tpl.widthMm / 2, tpl.widthMm]
  const y = [0, tpl.heightMm / 2, tpl.heightMm]
  if (props.showSafe) {
    const s = safeMm()
    x.push(s, tpl.widthMm - s)
    y.push(s, tpl.heightMm - s)
  }
  for (const l of design.value.layers) {
    if (exclude.has(l.id) || !l.visible || l.type === 'fill') continue
    const b = layerBounds(l)
    x.push(...boxLines(b, 'x'))
    y.push(...boxLines(b, 'y'))
  }
  return { x, y }
}

function startMove(p: { x: number; y: number }, collapseTo: string[] | null = null) {
  const layers = store.movable
  drag = {
    mode: 'move',
    startPx: p,
    startMm: toMm(p.x, p.y),
    starts: layers.map((l) => ({ id: l.id, x: l.x, y: l.y })),
    box: unionBoxes(layers.map(layerBounds)),
    targets: snapTargets(new Set(layers.map((l) => l.id))),
    collapseTo,
  }
}

function onPointerDown(e: PointerEvent) {
  try {
    canvas.value!.setPointerCapture(e.pointerId)
  } catch {
    // pointer already released (e.g. synthetic events) – dragging still works without capture
  }
  const p = localPoint(e)
  pointers.set(e.pointerId, p)
  if (pointers.size === 2) {
    startPinch()
    return
  }
  if (pointers.size > 2) return
  changed = false

  if (e.button === 1 || spaceDown) {
    drag = { mode: 'pan', startX: p.x, startY: p.y, panStart: { x: view.panX, y: view.panY } }
    return
  }
  const handle = hitHandle(p.x, p.y)
  const f = handleFrame()
  if (handle && f) {
    const ts = transformStart(transformTargets(), f)
    const c = toPx(f.cx, f.cy)
    if (handle.kind === 'scale') {
      drag = { mode: 'scale', t: ts, startDist: Math.max(1, Math.hypot(p.x - c.x, p.y - c.y)) }
    } else {
      drag = { mode: 'rotate', t: ts, startAngle: Math.atan2(p.y - c.y, p.x - c.x) }
    }
    return
  }
  const hit = hitLayer(p.x, p.y, e.altKey)

  // Shift/Ctrl/Cmd: toggle elements, or draw a selection rectangle on empty space.
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (hit) {
      store.toggleSelect(hit.id, !e.altKey)
      if (store.isSelected(hit.id)) startMove(p)
      else drag = null
    } else {
      drag = { mode: 'marquee', start: p, current: p, base: [...store.selectedIds] }
    }
    requestDraw()
    return
  }

  if (hit) {
    let collapseTo: string[] | null = null
    if (e.altKey) store.select([hit.id])
    else if (!store.isSelected(hit.id)) store.select(store.groupOf(hit.id), hit.id)
    else {
      // Already selected: keep the selection for dragging; a plain click narrows it down.
      const unit = store.groupOf(hit.id).filter((id) => store.isSelected(id))
      if (unit.length < store.selectedIds.length) collapseTo = unit
      store.select(store.selectedIds, hit.id)
    }
    startMove(p, collapseTo)
  } else if (f && insideFrame(f, p.x, p.y)) {
    // Nothing visible under the pointer but inside the selection box: keep dragging it.
    startMove(p)
  } else {
    store.clearSelection()
    drag = { mode: 'pan', startX: p.x, startY: p.y, panStart: { x: view.panX, y: view.panY } }
  }
  requestDraw()
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) {
    const lp = localPoint(e)
    updateCursor(lp)
    const hovered = hitLayer(lp.x, lp.y)?.id ?? null
    if (hovered !== hoverId) {
      hoverId = hovered
      requestDraw()
    }
    return
  }
  const p = localPoint(e)
  pointers.set(e.pointerId, p)
  if (!drag) return

  if (drag.mode === 'pinch') {
    if (pointers.size < 2) return
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const f = dist / Math.max(1, drag.startDist)
    if (drag.t) applyTransform(drag.t, f, ((angle - drag.startAngle) * 180) / Math.PI)
    else view.zoom = clampZoom(drag.startZoom * f)
    requestDraw()
    return
  }

  if (drag.mode === 'pan') {
    view.panX = drag.panStart.x + (p.x - drag.startX)
    view.panY = drag.panStart.y + (p.y - drag.startY)
    requestDraw()
    return
  }

  if (drag.mode === 'marquee') {
    drag.current = p
    const rect = rectFromPoints(toMm(drag.start.x, drag.start.y), toMm(p.x, p.y))
    const hits = design.value.layers
      .filter((l) => l.visible && !l.locked && l.type !== 'fill' && boxesIntersect(layerBounds(l), rect))
      .flatMap((l) => store.groupOf(l.id))
    store.select([...drag.base, ...hits])
    requestDraw()
    return
  }

  if (drag.mode === 'move') {
    const m = toMm(p.x, p.y)
    let dx = m.x - drag.startMm.x
    let dy = m.y - drag.startMm.y
    guides = { x: [], y: [] }
    if (!e.altKey && drag.box) {
      const b = drag.box
      const snapMm = SNAP_PX / scale()
      const sx = snapAxis(boxLines(b, 'x').map((v) => v + dx), drag.targets.x, snapMm)
      const sy = snapAxis(boxLines(b, 'y').map((v) => v + dy), drag.targets.y, snapMm)
      dx += sx.shift
      dy += sy.shift
      guides = { x: sx.guides, y: sy.guides }
    }
    for (const s of drag.starts) {
      const l = layerById(s.id)
      if (!l) continue
      l.x = s.x + dx
      l.y = s.y + dy
    }
    if (drag.starts.length) changed = true
  } else if (drag.mode === 'scale') {
    const c = toPx(drag.t.frame.cx, drag.t.frame.cy)
    const f = Math.hypot(p.x - c.x, p.y - c.y) / drag.startDist
    applyTransform(drag.t, f, 0)
    const single = drag.t.items.length === 1 && store.selectedIds.length === 1 ? layerById(drag.t.items[0].id) : null
    const { w, h } = single ? layerSize(single, template.value) : { w: drag.t.frame.w * f, h: drag.t.frame.h * f }
    sizeReadout = `${w.toFixed(1)} × ${h.toFixed(1)} mm`
  } else if (drag.mode === 'rotate') {
    const c = toPx(drag.t.frame.cx, drag.t.frame.cy)
    let d = ((Math.atan2(p.y - c.y, p.x - c.x) - drag.startAngle) * 180) / Math.PI
    // One layer snaps its absolute angle, a group snaps the turn it makes.
    const r0 = drag.t.items.length === 1 && store.selectedIds.length === 1 ? drag.t.items[0].rotation : 0
    let r = normalizeAngle(r0 + d)
    if (e.shiftKey) r = Math.round(r / 15) * 15
    else {
      const nearest = Math.round(r / 90) * 90
      if (Math.abs(r - nearest) < 3) r = nearest
    }
    d = r - r0
    applyTransform(drag.t, 1, d)
  }
  requestDraw()
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (drag?.mode === 'pinch' && pointers.size === 1) {
    // Continue as a pan/move with the remaining finger would feel jumpy; just end.
    drag = null
  }
  if (pointers.size === 0) {
    if (drag?.mode === 'move' && drag.collapseTo) {
      const p = localPoint(e)
      if (Math.hypot(p.x - drag.startPx.x, p.y - drag.startPx.y) < CLICK_PX) {
        for (const s of drag.starts) {
          // undo the sub-pixel jitter of a click
          const l = layerById(s.id)
          if (l) Object.assign(l, { x: s.x, y: s.y })
        }
        store.select(drag.collapseTo, store.selectedId)
      }
    }
    if (changed) store.commit()
    drag = null
    changed = false
    liveFrame = null
    guides = { x: [], y: [] }
    sizeReadout = null
    requestDraw()
  }
}

function onPointerLeave() {
  if (hoverId) {
    hoverId = null
    requestDraw()
  }
}

function onDoubleClick(e: MouseEvent) {
  const p = localPoint(e)
  const hit = hitLayer(p.x, p.y)
  if (!hit) return
  // Double-click inside a group selects just that member.
  if (hit.groupId) store.select([hit.id])
  if (hit.type === 'text') emit('editText', hit.id)
}

function updateCursor(p: { x: number; y: number }) {
  const cv = canvas.value!
  if (spaceDown) return void (cv.style.cursor = 'grab')
  const h = hitHandle(p.x, p.y)
  if (h?.kind === 'rotate') cv.style.cursor = 'crosshair'
  else if (h?.kind === 'scale') cv.style.cursor = h.corner % 2 === 0 ? 'nwse-resize' : 'nesw-resize'
  else cv.style.cursor = hitLayer(p.x, p.y) ? 'move' : 'default'
}

function clampZoom(z: number) {
  return Math.min(12, Math.max(0.25, z))
}

function zoomAt(px: number, py: number, factor: number) {
  const before = toMm(px, py)
  view.zoom = clampZoom(view.zoom * factor)
  const after = toPx(before.x, before.y)
  view.panX += px - after.x
  view.panY += py - after.y
  requestDraw()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const p = localPoint(e)
  // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels have large ones.
  const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
  zoomAt(p.x, p.y, factor)
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
    spaceDown = e.type === 'keydown'
    if (canvas.value) canvas.value.style.cursor = spaceDown ? 'grab' : 'default'
  }
}

// ---------- public API ----------
function zoomBy(factor: number) {
  zoomAt(cssW / 2, cssH / 2, factor)
}
function resetView() {
  view.zoom = 1
  view.panX = 0
  view.panY = 0
  requestDraw()
}
/** Converts a viewport position (e.g. a drop) into label millimetres. */
function clientToMm(clientX: number, clientY: number) {
  const r = canvas.value!.getBoundingClientRect()
  return toMm(clientX - r.left, clientY - r.top)
}
defineExpose({ zoomBy, resetView, clientToMm })

let ro: ResizeObserver | null = null
let mq: MediaQueryList | null = null
let themeObserver: MutationObserver | null = null
onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  layerCanvas = document.createElement('canvas')
  ghostCanvas = document.createElement('canvas')
  ro = new ResizeObserver(resize)
  ro.observe(wrap.value!)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  mq = window.matchMedia('(resolution: 1dppx)')
  mq.addEventListener('change', resize)
  themeObserver = new MutationObserver(() => {
    readTheme()
    requestDraw()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  document.fonts.addEventListener('loadingdone', requestDraw)
  resize()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  themeObserver?.disconnect()
  mq?.removeEventListener('change', resize)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
  document.fonts.removeEventListener('loadingdone', requestDraw)
  cancelAnimationFrame(raf)
})

watch(
  [design, () => store.selectedIds, () => props.showBleed, () => props.paper, () => props.hideOutside, () => props.showSafe],
  requestDraw,
  { deep: true },
)
// Prepare transparency maps early so click-through works on the very first click.
watch(
  () => design.value.layers.map((l) => (l.type === 'image' ? l.assetId : '')).join(),
  () => design.value.layers.forEach((l) => l.type === 'image' && l.assetId && getAlphaMaskSync(l.assetId)),
  { immediate: true },
)
watch(
  () => design.value.templateId,
  () => resetView(),
)
</script>

<template>
  <div ref="wrap" class="canvas-wrap">
    <canvas
      ref="canvas"
      class="editor-canvas"
      :aria-label="t('editor.canvas_label')"
      role="img"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @dblclick="onDoubleClick"
      @wheel="onWheel"
    />
    <div class="zoom-badge" aria-live="polite">{{ zoomLabel }}</div>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 220px;
  overflow: hidden;
  border-radius: var(--radius);
}
.editor-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  display: block;
}
.zoom-badge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}
</style>
