<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { useEditorStore } from '@/stores/editor'
import { renderDesignCanvas } from '@/lib/render'
import { getTemplate, type StickerTemplate } from '@/templates'
import Icon from '@/components/common/Icon.vue'
import { buildLockChip, LOCK_CHIP_COLOR, LOCK_CHIP_SPAN } from './lockChipModel'

/**
 * Live 3D preview. The device body comes from public/models/battlepass.glb
 * (built by scripts/blender/build_battlepass.py, 1 unit = 1 mm, label centred at
 * the "StickerAnchor" empty). The sticker itself is generated here from the
 * template outline, so it always matches the cut shape exactly.
 */

// Measured on the real device (calipers): 128.71 × 33.87 × 20.16 mm.
const DEVICE = { length: 128.71, width: 33.87, height: 20.16 }
/** Longest texture edge in px: sharp up close, small stickers get far more px per mm. */
const TEXTURE_MAX_EDGE = 2048
const TEXTURE_MAX_PX_PER_MM = 120
/**
 * The real parts are not flat: the Battle Pass cover is creased along its long
 * axis (shallow roof, the paper label follows it) and the Gear Chip sticker sits
 * slightly domed. Angles/heights are eyeballed from photos of the real parts.
 */
const CREASE_DEG = 6
const CHIP_DOME_MM = 0.5

/** Height offset (mm) of the bent surface at world position (x, z). */
function bendOffset(tpl: StickerTemplate, x: number, z: number): number {
  if (tpl.previewModel === 'battlepass') {
    const half = tpl.heightMm / 2
    return Math.max(0, half - Math.abs(z)) * Math.tan((CREASE_DEG * Math.PI) / 180)
  }
  if (tpl.previewModel === 'chip') {
    const r = tpl.widthMm / 2
    return CHIP_DOME_MM * Math.max(0, 1 - (x * x + z * z) / (r * r))
  }
  return 0
}

/** Subdivides a flat geometry and lifts it onto the bent surface. */
function bend(geo: THREE.BufferGeometry, tpl: StickerTemplate): THREE.BufferGeometry {
  if (tpl.previewModel === 'flat') return geo
  const fine = new TessellateModifier(0.8, 10).modify(geo.index ? geo.toNonIndexed() : geo)
  const pos = fine.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + bendOffset(tpl, pos.getX(i), pos.getZ(i)))
  fine.computeVertexNormals()
  return fine
}

const { t } = useI18n()
const store = useEditorStore()
const host = ref<HTMLDivElement>()
const status = ref<'loading' | 'ready' | 'fallback' | 'error'>('loading')

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let root: THREE.Group
let sticker: THREE.Mesh | null = null
let texture: THREE.CanvasTexture | null = null
let lockChipMaterial: THREE.MeshStandardMaterial | null = null
let anchorY = 0
let raf = 0
let ro: ResizeObserver | null = null
let disposed = false

function stickerGeometry(tpl: StickerTemplate): THREE.BufferGeometry {
  const W = tpl.widthMm
  const H = tpl.heightMm
  const shape = new THREE.Shape(tpl.outline.map(([x, y]) => new THREE.Vector2(x - W / 2, H / 2 - y)))
  const flat = new THREE.ShapeGeometry(shape, 1)
  flat.rotateX(-Math.PI / 2)
  const geo = bend(flat, tpl)
  // UVs from the (unbent) x/z position: top-left of the label = top-left of the texture.
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + W / 2) / W
    uv[i * 2 + 1] = (H / 2 - pos.getZ(i)) / H
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

let textureRun = 0

async function updateTexture() {
  // Renders can finish out of order (images decode at different speeds); only the newest may win.
  const run = ++textureRun
  const design = store.design
  const tpl = getTemplate(design.templateId)
  const pxPerMm = Math.min(TEXTURE_MAX_PX_PER_MM, TEXTURE_MAX_EDGE / Math.max(tpl.widthMm, tpl.heightMm))
  const canvas = await renderDesignCanvas(design, { pxPerMm, clip: 'outline', background: '#ffffff' })
  if (disposed || run !== textureRun) return
  const img = texture?.image as HTMLCanvasElement | undefined
  if (texture && img && (img.width !== canvas.width || img.height !== canvas.height)) {
    texture.dispose()
    texture = null
  }
  if (!texture) {
    texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
  } else {
    texture.image = canvas
    texture.needsUpdate = true
  }
  if (sticker) {
    const mat = sticker.material as THREE.MeshStandardMaterial
    if (mat.map !== texture) {
      mat.map = texture
      mat.needsUpdate = true
    }
  }
}

function buildSticker() {
  if (sticker) {
    root.remove(sticker)
    sticker.geometry.dispose()
    ;(sticker.material as THREE.Material).dispose()
  }
  const tpl = store.template
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, map: texture, envMapIntensity: 0.55 })
  sticker = new THREE.Mesh(stickerGeometry(tpl), mat)
  // Lift slightly above the seat: the tessellated sticker cuts the crease ridge as a
  // chord (a few hundredths of a mm low), which would otherwise z-fight with the model.
  sticker.position.y = tpl.previewModel === 'battlepass' ? anchorY + 0.18 : 0.15
  sticker.renderOrder = 1
  root.add(sticker)
}

function fallbackBody() {
  const g = new THREE.BoxGeometry(DEVICE.length, DEVICE.height, DEVICE.width)
  const body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35 }))
  body.position.y = -DEVICE.height / 2 + 0.5
  anchorY = 0.5
  return body
}

let sceneRun = 0

async function loadScene() {
  const run = ++sceneRun
  const tpl = store.template
  // Hide the old sticker right away: while a new model loads it must not show the new texture.
  if (sticker) sticker.visible = false
  // Clear previous model (template switch).
  for (const child of [...root.children]) if (child !== sticker) root.remove(child)
  lockChipMaterial = null
  if (tpl.previewModel === 'battlepass') {
    try {
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/battlepass.glb`)
      if (run !== sceneRun || disposed) return // template changed while loading
      const anchor = gltf.scene.getObjectByName('StickerAnchor')
      anchorY = anchor ? anchor.getWorldPosition(new THREE.Vector3()).y : 0
      // The clear cover follows the same crease as the label underneath – unless the
      // model already ships creased (StickerAnchor extras.creaseDeg from Blender).
      const cover = gltf.scene.getObjectByName('Cover')
      if (!anchor?.userData.creaseDeg && cover instanceof THREE.Mesh) cover.geometry = bend(cover.geometry, tpl)
      root.add(gltf.scene)
      status.value = 'ready'
    } catch (err) {
      console.warn('battlepass.glb not available, using fallback body', err)
      root.add(fallbackBody())
      status.value = 'fallback'
    }
  } else if (tpl.previewModel === 'chip' && tpl.chipBody === 'lock') {
    const chip = buildLockChip(tpl.widthMm, lockChipColor.value)
    lockChipMaterial = chip.material
    root.add(chip.group)
    anchorY = 0
    status.value = 'ready'
  } else if (tpl.previewModel === 'chip') {
    // Simplified Gear Chip: a plastic disc with a raised rim, sticker in the recess.
    const r = tpl.widthMm / 2
    const plastic = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.35, metalness: 0.1 })
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.2, r + 1.6, 3, 96), plastic)
    disc.position.y = -1.5
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.75, 0.55, 16, 96), plastic)
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.15
    root.add(disc, rim)
    anchorY = 0
    status.value = 'ready'
  } else {
    // Flat sticker on a sheet of paper.
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(tpl.widthMm + 16, 0.2, tpl.heightMm + 16),
      new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.9 }),
    )
    paper.position.y = -0.1
    root.add(paper)
    anchorY = 0
    status.value = 'ready'
  }
  buildSticker()
  frameCamera()
}

/** Places the camera so the whole object fits the current viewport aspect ratio. */
function frameCamera() {
  const tpl = store.template
  const size =
    tpl.previewModel === 'battlepass'
      ? DEVICE.length
      : tpl.previewModel === 'chip'
        ? tpl.widthMm * 2.2
        : Math.max(tpl.widthMm, tpl.heightMm) + 16
  const vFov = (camera.fov * Math.PI) / 180
  const fitH = size / 2 / Math.tan(vFov / 2)
  const dist = (fitH / Math.min(1, camera.aspect)) * 1.15
  const dir = new THREE.Vector3(0.35, 0.75, 0.85).normalize()
  // The Lock Chip hangs well below its sticker: aim at the middle of the part.
  const targetY = tpl.chipBody === 'lock' ? (LOCK_CHIP_SPAN.top + LOCK_CHIP_SPAN.bottom) / 2 : anchorY * 0.5
  camera.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, targetY, 0))
  controls.target.set(0, targetY, 0)
  controls.update()
}

function resize() {
  if (!renderer || !host.value) return
  const w = host.value.clientWidth
  const h = host.value.clientHeight
  renderer.setSize(w, h, false)
  const firstSize = camera.aspect === 1 && w > 0
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
  if (firstSize && root) frameCamera()
}

let lastFrame = performance.now()
function loop() {
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.1, (now - lastFrame) / 1000)
  lastFrame = now
  // Spin the model itself around its vertical axis, like a real top.
  if (spinning.value) root.rotation.y += spinDir.value * (spinRpm.value / 60) * Math.PI * 2 * dt
  controls.update()
  renderer!.render(scene, camera)
}

let debounce: ReturnType<typeof setTimeout> | null = null
watch(
  () => store.design,
  () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => void updateTexture(), 200)
  },
  { deep: true },
)
watch(
  () => store.design.templateId,
  async () => {
    await updateTexture()
    await loadScene()
  },
)

onMounted(async () => {
  const el = host.value!
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    status.value = 'error'
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.NeutralToneMapping
  el.appendChild(renderer.domElement)
  renderer.domElement.setAttribute('aria-label', t('preview3d.label'))
  renderer.domElement.setAttribute('role', 'img')

  scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(80, 160, 100)
  scene.add(key)

  camera = new THREE.PerspectiveCamera(32, 1, 1, 5000)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 15
  controls.maxDistance = 600

  root = new THREE.Group()
  scene.add(root)

  ro = new ResizeObserver(resize)
  ro.observe(el)
  resize()
  await updateTexture()
  await loadScene()
  loop()
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  ro?.disconnect()
  controls?.dispose()
  texture?.dispose()
  scene?.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      const m = o.material as THREE.Material | THREE.Material[]
      ;(Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
    }
  })
  renderer?.dispose()
  renderer?.domElement.remove()
})

function resetCamera() {
  root.rotation.y = 0
  frameCamera()
}
// Spin: on/off, speed in revolutions per minute and direction. Gear chips spin like a
// real top; larger parts (Battle Pass) only get a calm showcase rotation.
const SPIN_KEY = 'preview3d-spin'
const SPIN_RANGES = { chip: { min: 5, max: 600, step: 5, def: 90 }, other: { min: 2, max: 30, step: 1, def: 8 } }
const spinning = ref(false)
const spinKind = computed(() => (store.template.previewModel === 'chip' ? 'chip' : 'other'))
const spinRange = computed(() => SPIN_RANGES[spinKind.value])
const saved = readSpin()
const rpmByKind = ref<{ chip: number; other: number }>({ chip: saved.chip, other: saved.other })
const spinDir = ref<1 | -1>(saved.dir)
const spinRpm = computed({
  get: () => rpmByKind.value[spinKind.value],
  set: (v: number) => (rpmByKind.value[spinKind.value] = v),
})
function readSpin(): { chip: number; other: number; dir: 1 | -1 } {
  const clamp = (v: unknown, r: { min: number; max: number; def: number }) =>
    typeof v === 'number' && v >= r.min && v <= r.max ? v : r.def
  try {
    const v = JSON.parse(localStorage.getItem(SPIN_KEY) ?? '{}') as { chip?: number; other?: number; dir?: number }
    return { chip: clamp(v.chip, SPIN_RANGES.chip), other: clamp(v.other, SPIN_RANGES.other), dir: v.dir === 1 ? 1 : -1 }
  } catch {
    return { chip: SPIN_RANGES.chip.def, other: SPIN_RANGES.other.def, dir: -1 }
  }
}
watch(
  [rpmByKind, spinDir],
  () => {
    try {
      localStorage.setItem(SPIN_KEY, JSON.stringify({ ...rpmByKind.value, dir: spinDir.value }))
    } catch {
      // ignore
    }
  },
  { deep: true },
)
function toggleSpin() {
  spinning.value = !spinning.value
}

// Body colour of the Lock Chip model (real chips come in many colours); remembered per browser.
const LOCK_COLOR_KEY = 'preview3d-lockchip-color'
const isLockChip = computed(() => store.template.chipBody === 'lock')
const lockChipColor = ref(readLockColor())
function readLockColor(): string {
  try {
    const v = localStorage.getItem(LOCK_COLOR_KEY)
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : LOCK_CHIP_COLOR
  } catch {
    return LOCK_CHIP_COLOR
  }
}
watch(lockChipColor, (c) => {
  lockChipMaterial?.color.set(c)
  try {
    localStorage.setItem(LOCK_COLOR_KEY, c)
  } catch {
    // ignore
  }
})
</script>

<template>
  <div class="preview3d">
    <div ref="host" class="host" />
    <div class="overlay">
      <span v-if="status === 'loading'" class="badge">{{ t('preview3d.loading') }}</span>
      <span v-else-if="status === 'fallback'" class="badge badge-warning">{{ t('preview3d.fallback') }}</span>
      <span v-else-if="status === 'error'" class="badge badge-danger">{{ t('preview3d.no_webgl') }}</span>
      <span class="spacer" />
      <template v-if="spinning">
        <button class="btn btn-sm btn-icon" :title="t('preview3d.direction')" :aria-label="t('preview3d.direction')" @click="spinDir = spinDir === 1 ? -1 : 1">
          <Icon :name="spinDir === 1 ? 'rotate-ccw' : 'rotate-cw'" />
        </button>
        <label class="speed" :title="t('preview3d.speed')">
          <span class="sr-only">{{ t('preview3d.speed') }}</span>
          <input :key="spinKind" v-model.number="spinRpm" type="range" :min="spinRange.min" :max="spinRange.max" :step="spinRange.step" :aria-label="t('preview3d.speed')" />
          <span class="rpm">{{ spinRpm }} rpm</span>
        </label>
      </template>
      <label v-if="isLockChip" class="btn btn-sm body-color">
        <span class="swatch" :style="{ background: lockChipColor }" />
        {{ t('preview3d.body_color') }}
        <input v-model="lockChipColor" type="color" :aria-label="t('preview3d.body_color')" />
      </label>
      <button class="btn btn-sm" :class="{ active: spinning }" :aria-pressed="spinning" @click="toggleSpin">{{ t('preview3d.spin') }}</button>
      <button class="btn btn-sm" @click="resetCamera">{{ t('preview3d.reset') }}</button>
    </div>
    <p class="hint muted">{{ t('preview3d.hint') }}</p>
  </div>
</template>

<style scoped>
.preview3d {
  position: relative;
  height: 100%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
}
.host {
  flex: 1;
  min-height: 220px;
  border-radius: var(--radius);
  background: radial-gradient(circle at 50% 35%, var(--surface-3), var(--surface-2) 70%);
  overflow: hidden;
  touch-action: none;
}
.host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.speed {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 190px;
  padding: 0 8px;
  min-height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
}
.speed input {
  flex: 1;
}
.rpm {
  min-width: 56px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  text-align: right;
}
.body-color {
  position: relative;
  cursor: pointer;
}
/* The native picker covers the whole button but stays invisible: the swatch shows the colour. */
.body-color input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.body-color:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  /* Light ring so dark colours (the default black) still stand out on the dark UI. */
  box-shadow:
    0 0 0 1.5px var(--surface),
    0 0 0 3px var(--text-muted);
  margin: 0 2px;
}
.hint {
  font-size: 11px;
  margin: 6px 2px 0;
}
</style>
