<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DesignCard from '@/components/gallery/DesignCard.vue'
import LoginDialog from '@/components/gallery/LoginDialog.vue'
import ReportDialog from '@/components/gallery/ReportDialog.vue'
import { TEMPLATE_IDS, useLikes, useTemplateLabel } from '@/components/gallery/composables'
import { errorMessage, listDesigns, type GalleryDesign, type GallerySort } from '@/services/gallery'
import { galleryEnabled } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/lib/toast'

const PAGE_SIZE = 24

const { t } = useI18n()
const auth = useAuthStore()
const templateLabel = useTemplateLabel()
const likes = useLikes()

const sort = ref<GallerySort>('new')
const templateId = ref('')
const items = ref<GalleryDesign[]>([])
const page = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const failed = ref(false)
const reporting = ref<GalleryDesign | null>(null)

// Guards against out-of-order responses when filters change quickly.
let requestId = 0

async function load(reset: boolean) {
  if (!galleryEnabled) return
  const id = ++requestId
  if (reset) {
    page.value = 0
    items.value = []
  }
  loading.value = true
  failed.value = false
  try {
    const result = await listDesigns({
      sort: sort.value,
      templateId: templateId.value || null,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    if (id !== requestId) return
    items.value = reset ? result.items : [...items.value, ...result.items]
    hasMore.value = result.hasMore
    void likes.load(result.items.map((d) => d.id))
  } catch (err) {
    if (id !== requestId) return
    failed.value = true
    toast(errorMessage(err), 'error')
  } finally {
    if (id === requestId) loading.value = false
  }
}

function loadMore() {
  page.value += 1
  void load(false)
}

onMounted(async () => {
  await auth.init()
  void load(true)
})
watch([sort, templateId], () => void load(true))
// Refresh own like state after signing in / out.
watch(
  () => auth.user?.id,
  () => {
    likes.reset()
    void likes.load(items.value.map((d) => d.id))
  },
)
</script>

<template>
  <main class="page">
    <h1>{{ t('gallery.title') }}</h1>
    <p class="muted">{{ t('gallery.subtitle') }}</p>

    <p v-if="!galleryEnabled" class="card notice" role="status">{{ t('gallery.disabled') }}</p>

    <template v-else>
      <div class="controls row">
        <div class="row" role="group" :aria-label="t('gallery.sort.label')">
          <button class="btn btn-sm" :class="{ active: sort === 'new' }" :aria-pressed="sort === 'new'" @click="sort = 'new'">
            {{ t('gallery.sort.new') }}
          </button>
          <button class="btn btn-sm" :class="{ active: sort === 'top' }" :aria-pressed="sort === 'top'" @click="sort = 'top'">
            {{ t('gallery.sort.top') }}
          </button>
        </div>
        <span class="spacer" />
        <label class="row filter">
          <span class="muted">{{ t('gallery.filter.template') }}</span>
          <select v-model="templateId" class="input">
            <option value="">{{ t('gallery.filter.all') }}</option>
            <option v-for="id in TEMPLATE_IDS" :key="id" :value="id">{{ templateLabel(id) }}</option>
          </select>
        </label>
      </div>

      <div v-if="items.length" class="grid">
        <DesignCard
          v-for="d in items"
          :key="d.id"
          :design="d"
          :liked="likes.liked.value.has(d.id)"
          @like="likes.toggle"
          @report="reporting = $event"
        />
      </div>

      <p v-if="loading" class="muted center" role="status">{{ t('gallery.loading') }}</p>

      <div v-else-if="failed" class="card notice center">
        <p>{{ t('gallery.loadError') }}</p>
        <button class="btn" @click="load(items.length === 0)">{{ t('gallery.retry') }}</button>
      </div>

      <div v-else-if="items.length === 0" class="card notice center">
        <h2>{{ t('gallery.empty.title') }}</h2>
        <p class="muted">{{ t('gallery.empty.text') }}</p>
        <RouterLink class="btn btn-primary" to="/">{{ t('gallery.empty.cta') }}</RouterLink>
      </div>

      <div v-if="hasMore && !loading" class="center more">
        <button class="btn" @click="loadMore">{{ t('gallery.loadMore') }}</button>
      </div>
    </template>

    <ReportDialog v-if="reporting" :design-id="reporting.id" :design-title="reporting.title" @close="reporting = null" />
    <LoginDialog v-if="likes.loginOpen.value" @close="likes.loginOpen.value = false" />
  </main>
</template>

<style scoped>
.controls {
  margin: 16px 0;
  flex-wrap: wrap;
}
.filter select {
  width: auto;
  min-width: 160px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.notice {
  padding: 20px;
}
.center {
  text-align: center;
}
.more {
  margin-top: 20px;
}
</style>
