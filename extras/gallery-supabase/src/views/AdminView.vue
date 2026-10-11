<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DesignCard from '@/components/gallery/DesignCard.vue'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import {
  errorMessage,
  listHidden,
  listQueue,
  listReports,
  resolveReport,
  setStatus,
  type DesignStatus,
  type GalleryDesign,
  type GalleryReport,
} from '@/services/gallery'
import { galleryEnabled } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'

type Tab = 'review' | 'reports' | 'hidden'
const TABS: readonly Tab[] = ['review', 'reports', 'hidden']

const { t, locale } = useI18n()
const auth = useAuthStore()

const tab = ref<Tab>('review')
const queue = ref<GalleryDesign[]>([])
const reports = ref<GalleryReport[]>([])
const hidden = ref<GalleryDesign[]>([])
const loading = ref(false)
const failed = ref(false)
const busyId = ref<string | null>(null)

const counts = computed<Record<Tab, number>>(() => ({
  review: queue.value.length,
  reports: reports.value.length,
  hidden: hidden.value.length,
}))

async function load(which: Tab = tab.value) {
  if (!auth.isAdmin) return
  loading.value = true
  failed.value = false
  try {
    if (which === 'review') queue.value = await listQueue()
    else if (which === 'reports') reports.value = await listReports()
    else hidden.value = await listHidden()
  } catch (err) {
    failed.value = true
    toast(errorMessage(err), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (auth.isAdmin) {
    // Load all three so the tab badges show counts.
    void load('reports')
    void load('hidden')
    await load('review')
  }
})
watch(tab, (next) => void load(next))
watch(
  () => auth.isAdmin,
  (admin) => admin && void load(),
)

async function run(id: string, action: () => Promise<void>, successKey: string, reload: Tab[]) {
  if (busyId.value) return
  busyId.value = id
  try {
    await action()
    toast(t(successKey), 'success')
    await Promise.all(reload.map((r) => load(r)))
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    busyId.value = null
  }
}

function changeStatus(d: GalleryDesign, status: DesignStatus, successKey: string, reload: Tab[]) {
  return run(d.id, () => setStatus(d, status), successKey, reload)
}

async function rejectDesign(d: GalleryDesign, reload: Tab[]) {
  if (!(await confirmDialog(t('gallery.admin.rejectConfirm', { title: d.title }), { danger: true, confirmLabel: t('gallery.admin.reject') }))) return
  await changeStatus(d, 'rejected', 'gallery.admin.rejected', reload)
}

async function republish(d: GalleryDesign) {
  if (!(await confirmDialog(t('gallery.admin.republishConfirm', { title: d.title })))) return
  await changeStatus(d, 'published', 'gallery.admin.published', ['hidden', 'reports'])
}

function hideForReport(r: GalleryReport) {
  const d = r.design
  if (!d) return
  return run(
    r.id,
    async () => {
      await setStatus(d, 'hidden')
      await resolveReport(r.id, 'resolved')
    },
    'gallery.admin.hiddenDone',
    ['reports', 'hidden'],
  )
}

function closeReport(r: GalleryReport, status: 'resolved' | 'dismissed') {
  return run(
    r.id,
    () => resolveReport(r.id, status),
    status === 'resolved' ? 'gallery.admin.markedResolved' : 'gallery.admin.markedDismissed',
    ['reports'],
  )
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleString(locale.value)
}
</script>

<template>
  <main class="page">
    <h1>{{ t('gallery.admin.title') }}</h1>

    <p v-if="!galleryEnabled" class="card notice" role="status">{{ t('gallery.disabled') }}</p>
    <p v-else-if="!auth.ready" class="muted" role="status">{{ t('gallery.loading') }}</p>
    <p v-else-if="!auth.isAdmin" class="card notice" role="alert">{{ t('gallery.admin.noAccess') }}</p>

    <template v-else>
      <div class="tabs row" role="tablist" :aria-label="t('gallery.admin.title')">
        <button
          v-for="name in TABS"
          :id="`admin-tab-${name}`"
          :key="name"
          class="btn"
          :class="{ active: tab === name }"
          role="tab"
          :aria-selected="tab === name"
          :aria-controls="`admin-panel-${name}`"
          @click="tab = name"
        >
          {{ t(`gallery.admin.tabs.${name}`) }}
          <span v-if="counts[name]" class="badge" :class="name === 'hidden' ? '' : 'badge-warning'">{{ counts[name] }}</span>
        </button>
      </div>

      <section :id="`admin-panel-${tab}`" role="tabpanel" :aria-labelledby="`admin-tab-${tab}`">
        <p v-if="loading" class="muted" role="status">{{ t('gallery.loading') }}</p>
        <div v-else-if="failed" class="card notice">
          <p>{{ t('gallery.loadError') }}</p>
          <button class="btn" @click="load()">{{ t('gallery.retry') }}</button>
        </div>

        <!-- review queue -->
        <template v-else-if="tab === 'review'">
          <p v-if="queue.length === 0" class="card notice muted">{{ t('gallery.admin.emptyReview') }}</p>
          <div v-else class="grid">
            <DesignCard v-for="d in queue" :key="d.id" :design="d" hide-actions>
              <template #actions>
                <div class="row">
                  <button class="btn btn-sm btn-primary" :disabled="busyId === d.id" @click="changeStatus(d, 'published', 'gallery.admin.published', ['review'])">
                    {{ t('gallery.admin.approve') }}
                  </button>
                  <button class="btn btn-sm btn-danger" :disabled="busyId === d.id" @click="rejectDesign(d, ['review'])">
                    {{ t('gallery.admin.reject') }}
                  </button>
                </div>
              </template>
            </DesignCard>
          </div>
        </template>

        <!-- open reports -->
        <template v-else-if="tab === 'reports'">
          <p v-if="reports.length === 0" class="card notice muted">{{ t('gallery.admin.emptyReports') }}</p>
          <ul v-else class="reports">
            <li v-for="r in reports" :key="r.id" class="card report">
              <div class="report-design">
                <DesignCard v-if="r.design" :design="r.design" show-status hide-actions />
                <p v-else class="muted">{{ t('gallery.admin.designGone') }}</p>
              </div>
              <div class="report-body">
                <p>
                  <span class="badge badge-danger">{{ t(`gallery.report.reasons.${r.reason}`) }}</span>
                  <span class="muted small"> {{ dateText(r.createdAt) }}</span>
                </p>
                <p class="details">{{ r.description }}</p>
                <p class="muted small">
                  {{ r.reporterId ? t('gallery.admin.reporterUser') : t('gallery.admin.reporterAnon') }}
                  <template v-if="r.contactEmail"> · {{ t('gallery.admin.contact') }}: <a :href="`mailto:${r.contactEmail}`">{{ r.contactEmail }}</a></template>
                  <template v-if="r.design"> · {{ t('gallery.admin.openReports', { n: r.design.reportCount }) }}</template>
                </p>
                <div class="row wrap">
                  <button v-if="r.design && r.design.status === 'published'" class="btn btn-sm btn-danger" :disabled="busyId === r.id" @click="hideForReport(r)">
                    {{ t('gallery.admin.hide') }}
                  </button>
                  <button class="btn btn-sm" :disabled="busyId === r.id" @click="closeReport(r, 'resolved')">
                    {{ t('gallery.admin.resolved') }}
                  </button>
                  <button class="btn btn-sm" :disabled="busyId === r.id" @click="closeReport(r, 'dismissed')">
                    {{ t('gallery.admin.dismiss') }}
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </template>

        <!-- hidden -->
        <template v-else>
          <p v-if="hidden.length === 0" class="card notice muted">{{ t('gallery.admin.emptyHidden') }}</p>
          <div v-else class="grid">
            <DesignCard v-for="d in hidden" :key="d.id" :design="d" show-status hide-actions>
              <template #actions>
                <p class="muted small">{{ t('gallery.admin.openReports', { n: d.reportCount }) }}</p>
                <div class="row">
                  <button class="btn btn-sm btn-primary" :disabled="busyId === d.id" @click="republish(d)">
                    {{ t('gallery.admin.republish') }}
                  </button>
                  <button class="btn btn-sm btn-danger" :disabled="busyId === d.id" @click="rejectDesign(d, ['hidden'])">
                    {{ t('gallery.admin.reject') }}
                  </button>
                </div>
              </template>
            </DesignCard>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.notice {
  padding: 16px 20px;
  margin: 16px 0;
}
.tabs {
  margin: 16px 0;
  flex-wrap: wrap;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.reports {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.report {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 16px;
  padding: 12px;
}
.details {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.wrap {
  flex-wrap: wrap;
}
.small {
  font-size: 12px;
}
@media (max-width: 600px) {
  .report {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
