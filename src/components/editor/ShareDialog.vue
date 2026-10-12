<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Design } from '@/lib/model'
import { COMFORTABLE_LINK_LENGTH, countPlaceholders, encodeDesign, shareUrl } from '@/lib/share'
import { exportPng } from '@/lib/export'
import { projectFileBlob } from '@/lib/projectFile'
import { safeFilename, saveBlob } from '@/lib/download'
import { toast } from '@/lib/toast'
import { makeQr, qrPng, qrSvg, type QrCode } from '@/lib/qr'
import { getTemplate, templateName } from '@/templates'
import Icon from '@/components/common/Icon.vue'

const props = defineProps<{ design: Design }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const link = ref('')
const busy = ref(false)
const images = computed(() => countPlaceholders(props.design))
const tooLong = computed(() => link.value.length > COMFORTABLE_LINK_LENGTH)
const canShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator
const canShareLink = typeof navigator !== 'undefined' && 'share' in navigator
const baseName = computed(() => safeFilename(props.design.name || templateName(t, getTemplate(props.design.templateId))))

onMounted(async () => {
  try {
    link.value = shareUrl(await encodeDesign(props.design))
  } catch (err) {
    console.error(err)
    toast(t('share.link_failed'), 'error')
  }
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast(t('share.copied'), 'success')
  } catch {
    // Clipboard blocked (e.g. insecure context): select the text so the user can copy manually.
    const el = document.getElementById('share-link') as HTMLInputElement | null
    el?.select()
  }
}

async function shareLink() {
  try {
    await navigator.share({ title: 'BeySkin', text: t('share.share_text'), url: link.value })
  } catch {
    // dismissed – nothing to do
  }
}

/** Shares via the OS share sheet when the browser supports files, otherwise downloads. */
async function shareFile(kind: 'png' | 'project') {
  busy.value = true
  try {
    const blob = kind === 'png' ? await exportPng(props.design, 300) : await projectFileBlob([props.design])
    const name = kind === 'png' ? `${baseName.value}.png` : `${baseName.value}.beyskin.json`
    const file = new File([blob], name, { type: blob.type })
    if (canShareFiles && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'BeySkin' })
      } catch {
        // dismissed
      }
    } else {
      saveBlob(blob, name)
    }
  } catch (err) {
    console.error(err)
    toast(t('editor.export_failed'), 'error')
  } finally {
    busy.value = false
  }
}

// ---------- QR code (scan the link with a phone) ----------
const showQr = ref(false)
/** Above this length the code gets so dense that phones struggle to read it from a screen. */
const QR_DENSE_LENGTH = 1200
const qr = computed<QrCode | null>(() => {
  if (!showQr.value || !link.value) return null
  try {
    return makeQr(link.value)
  } catch {
    return null // does not fit into a QR code at all
  }
})

async function downloadQr(kind: 'png' | 'svg') {
  if (!qr.value) return
  const name = `${baseName.value}-qr.${kind}`
  try {
    if (kind === 'svg') saveBlob(new Blob([qrSvg(qr.value)], { type: 'image/svg+xml' }), name)
    else saveBlob(await qrPng(qr.value), name)
  } catch (err) {
    console.error(err)
    toast(t('editor.export_failed'), 'error')
  }
}

const dialog = ref<HTMLDivElement>()
onMounted(() => dialog.value?.focus())
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="dialog" class="dialog" role="dialog" aria-modal="true" :aria-label="t('share.title')" tabindex="-1">
      <h2>{{ t('share.title') }}</h2>

      <section class="block">
        <h3><Icon name="share" /> {{ t('share.link_title') }}</h3>
        <p class="muted small">{{ t('share.link_hint') }}</p>
        <p v-if="images" class="notice small"><Icon name="image" :size="14" /> {{ t('share.images_left_out', { n: images }) }}</p>
        <div class="row">
          <input id="share-link" class="input" readonly :value="link" :aria-label="t('share.link_title')" @focus="($event.target as HTMLInputElement).select()" />
          <button class="btn btn-primary" :disabled="!link" @click="copyLink"><Icon name="copy" /> {{ t('share.copy') }}</button>
        </div>
        <div class="row meta wrap">
          <span class="muted small">{{ t('share.length', { n: link.length }) }}</span>
          <span v-if="tooLong" class="badge badge-warning">{{ t('share.too_long') }}</span>
          <span class="spacer" />
          <button class="btn btn-sm" :class="{ active: showQr }" :aria-pressed="showQr" :disabled="!link" @click="showQr = !showQr">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v1 M14 20h1 M18 18h3v3h-3z" />
            </svg>
            {{ t('share.qr') }}
          </button>
          <button v-if="canShareLink" class="btn btn-sm" :disabled="!link" @click="shareLink">{{ t('share.share_link') }}</button>
        </div>
        <div v-if="showQr" class="qr-block">
          <template v-if="qr">
            <!-- Always black on white with a quiet zone, also in dark mode, so cameras can read it. -->
            <svg class="qr" :viewBox="`0 0 ${qr.size} ${qr.size}`" shape-rendering="crispEdges" role="img" :aria-label="t('share.qr_alt')">
              <rect :width="qr.size" :height="qr.size" fill="#fff" />
              <path :d="qr.path" fill="#000" />
            </svg>
            <div class="qr-side">
              <p class="muted small">{{ t('share.qr_hint') }}</p>
              <p v-if="link.length > QR_DENSE_LENGTH" class="notice small"><Icon name="alert" :size="14" /> {{ t('share.qr_dense') }}</p>
              <div class="row wrap">
                <button class="btn btn-sm" @click="downloadQr('png')"><Icon name="download" :size="14" /> PNG</button>
                <button class="btn btn-sm" @click="downloadQr('svg')"><Icon name="download" :size="14" /> SVG</button>
              </div>
            </div>
          </template>
          <p v-else class="notice small"><Icon name="alert" :size="14" /> {{ t('share.qr_too_long') }}</p>
        </div>
        <p class="muted tiny">{{ t('share.privacy') }}</p>
      </section>

      <section class="block">
        <h3><Icon name="file" /> {{ t('share.file_title') }}</h3>
        <p class="muted small">{{ t('share.file_hint') }}</p>
        <div class="row wrap">
          <button class="btn" :disabled="busy" @click="shareFile('png')"><Icon name="image" /> {{ t('share.png') }}</button>
          <button class="btn" :disabled="busy" @click="shareFile('project')"><Icon name="download" /> {{ t('share.project') }}</button>
        </div>
      </section>

      <div class="dialog-actions">
        <button class="btn" @click="emit('close')">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block {
  padding: 12px;
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
}
.small {
  font-size: 13px;
  margin: 0 0 8px;
}
.tiny {
  font-size: 11px;
  margin: 8px 0 0;
}
.notice {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}
.meta {
  margin-top: 6px;
}
.wrap {
  flex-wrap: wrap;
}
.qr-block {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  margin-top: 10px;
}
.qr {
  display: block;
  width: min(220px, 100%);
  height: auto;
  border-radius: 8px;
  background: #fff;
}
.qr-side {
  flex: 1 1 180px;
  min-width: 0;
}
</style>
