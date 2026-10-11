<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/components/common/Icon.vue'
import LoginDialog from '@/components/gallery/LoginDialog.vue'
import ReportDialog from '@/components/gallery/ReportDialog.vue'
import { useLikes, useTemplateLabel } from '@/components/gallery/composables'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { downloadProject, errorMessage, getDesign, thumbUrl, type GalleryDesign } from '@/services/gallery'
import { galleryEnabled } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { useLibraryStore } from '@/stores/library'

const props = defineProps<{ id: string }>()

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const editor = useEditorStore()
const library = useLibraryStore()
const templateLabel = useTemplateLabel()
const likes = useLikes()

const design = ref<GalleryDesign | null>(null)
const loading = ref(true)
const failed = ref(false)
const busy = ref(false)
const reporting = ref(false)

const previewSrc = computed(() => (design.value ? thumbUrl(design.value.thumbPath) : ''))
const dateText = computed(() => {
  const iso = design.value?.publishedAt ?? design.value?.createdAt
  return iso ? new Date(iso).toLocaleDateString(locale.value) : ''
})

async function load() {
  if (!galleryEnabled) {
    loading.value = false
    return
  }
  loading.value = true
  failed.value = false
  design.value = null
  try {
    await auth.init()
    design.value = await getDesign(props.id)
    if (design.value) void likes.load([design.value.id])
  } catch (err) {
    failed.value = true
    toast(errorMessage(err), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.id, load)
watch(
  () => auth.user?.id,
  () => {
    likes.reset()
    if (design.value) void likes.load([design.value.id])
  },
)

/** Fetches the project and names it after the gallery title if it has no name. */
async function fetchDesigns() {
  const d = design.value
  if (!d) return null
  const designs = await downloadProject(d.id)
  for (const x of designs) if (!x.name) x.name = d.title
  d.downloadCount += 1
  return designs
}

async function openInEditor() {
  if (busy.value) return
  if (editor.design.layers.length > 0 && !(await confirmDialog(t('gallery.detail.replaceConfirm'), { confirmLabel: t('gallery.detail.openInEditor') }))) {
    return
  }
  busy.value = true
  try {
    const designs = await fetchDesigns()
    if (!designs) return
    editor.loadDesign(designs[0])
    await router.push('/')
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}

async function addToLibrary() {
  if (busy.value) return
  busy.value = true
  try {
    const designs = await fetchDesigns()
    if (!designs) return
    if (!library.loaded) await library.init()
    library.addDesigns(designs)
    toast(t('gallery.detail.added'), 'success')
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page">
    <RouterLink class="btn btn-ghost btn-sm" to="/gallery">&larr; {{ t('gallery.detail.back') }}</RouterLink>

    <p v-if="!galleryEnabled" class="card notice" role="status">{{ t('gallery.disabled') }}</p>
    <p v-else-if="loading" class="muted" role="status">{{ t('gallery.loading') }}</p>
    <div v-else-if="failed" class="card notice">
      <p>{{ t('gallery.loadError') }}</p>
      <button class="btn" @click="load">{{ t('gallery.retry') }}</button>
    </div>
    <div v-else-if="!design" class="card notice">
      <h2>{{ t('gallery.detail.notFound') }}</h2>
      <p class="muted">{{ t('gallery.detail.notFoundText') }}</p>
    </div>

    <div v-else class="detail">
      <div class="preview card">
        <img :src="previewSrc" :alt="design.title" />
      </div>

      <div class="side">
        <h1>{{ design.title }}</h1>
        <p class="muted">
          {{ t('gallery.card.by', { name: design.creatorName ?? t('gallery.card.unknown') }) }}
          <template v-if="dateText"> · {{ dateText }}</template>
        </p>
        <div class="badges">
          <span class="badge">{{ templateLabel(design.templateId) }}</span>
          <span v-if="design.status !== 'published'" class="badge" :class="design.status === 'pending' ? 'badge-warning' : 'badge-danger'">
            {{ t(`gallery.status.${design.status}`) }}
          </span>
        </div>

        <p v-if="design.status !== 'published'" class="muted">{{ t('gallery.detail.notPublicHint') }}</p>

        <p class="stats muted">
          <span>{{ t('gallery.detail.likes', { n: design.likeCount }) }}</span>
          <span>{{ t('gallery.detail.downloads', { n: design.downloadCount }) }}</span>
        </p>

        <div class="actions">
          <button class="btn btn-primary" :disabled="busy" @click="openInEditor">
            <Icon name="edit" /> {{ t('gallery.detail.openInEditor') }}
          </button>
          <button class="btn" :disabled="busy" @click="addToLibrary">
            <Icon name="plus" /> {{ t('gallery.detail.addToLibrary') }}
          </button>
        </div>
        <div class="actions">
          <button
            class="btn"
            :class="{ active: likes.liked.value.has(design.id) }"
            :aria-pressed="likes.liked.value.has(design.id)"
            :disabled="design.status !== 'published'"
            @click="likes.toggle(design)"
          >
            <Icon name="heart" />
            {{ likes.liked.value.has(design.id) ? t('gallery.detail.unlike') : t('gallery.detail.like') }}
          </button>
          <button v-if="design.status === 'published'" class="btn btn-ghost" @click="reporting = true">
            <Icon name="flag" /> {{ t('gallery.detail.report') }}
          </button>
        </div>

        <p class="muted small">{{ t('gallery.detail.disclaimer') }}</p>
      </div>
    </div>

    <ReportDialog v-if="reporting && design" :design-id="design.id" :design-title="design.title" @close="reporting = false" />
    <LoginDialog v-if="likes.loginOpen.value" @close="likes.loginOpen.value = false" />
  </main>
</template>

<style scoped>
.notice {
  padding: 20px;
  margin-top: 16px;
}
.detail {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
  gap: 24px;
  margin-top: 16px;
  align-items: start;
}
.preview {
  display: grid;
  place-items: center;
  padding: 24px;
  min-height: 240px;
}
.preview img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}
.badges,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.stats {
  display: flex;
  gap: 16px;
}
.small {
  font-size: 12px;
}
@media (max-width: 760px) {
  .detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
