<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoginDialog from '@/components/gallery/LoginDialog.vue'
import DesignCard from '@/components/gallery/DesignCard.vue'
import { CONTACT_EMAIL } from '@/config'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { deleteMyDesign, errorMessage, myUploads, type GalleryDesign } from '@/services/gallery'
import { galleryEnabled } from '@/services/supabase'
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, isValidDisplayName, useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()

const items = ref<GalleryDesign[]>([])
const loading = ref(false)
const failed = ref(false)
const loginOpen = ref(false)
const name = ref('')
const savingName = ref(false)

async function load() {
  if (!auth.user) return
  loading.value = true
  failed.value = false
  try {
    items.value = await myUploads()
  } catch (err) {
    failed.value = true
    toast(errorMessage(err), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  name.value = auth.displayName
  void load()
})
watch(
  () => auth.user?.id,
  () => {
    name.value = auth.displayName
    items.value = []
    void load()
  },
)
watch(
  () => auth.displayName,
  (n) => (name.value = n),
)

async function saveName() {
  if (!isValidDisplayName(name.value) || savingName.value) return
  savingName.value = true
  try {
    await auth.updateDisplayName(name.value)
    toast(t('gallery.mine.nameSaved'), 'success')
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    savingName.value = false
  }
}

async function remove(d: GalleryDesign) {
  if (!(await confirmDialog(t('gallery.mine.deleteConfirm', { title: d.title }), { danger: true, confirmLabel: t('gallery.mine.delete') }))) return
  try {
    await deleteMyDesign(d.id)
    items.value = items.value.filter((x) => x.id !== d.id)
    toast(t('gallery.mine.deleted'), 'success')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
</script>

<template>
  <main class="page">
    <h1>{{ t('gallery.mine.title') }}</h1>

    <p v-if="!galleryEnabled" class="card notice" role="status">{{ t('gallery.disabled') }}</p>

    <div v-else-if="!auth.ready" class="muted" role="status">{{ t('gallery.loading') }}</div>

    <div v-else-if="!auth.user" class="card notice">
      <p>{{ t('gallery.mine.needLogin') }}</p>
      <button class="btn btn-primary" @click="loginOpen = true">{{ t('gallery.auth.signIn') }}</button>
    </div>

    <template v-else>
      <section class="card notice" aria-labelledby="name-title">
        <h2 id="name-title" class="panel-title">{{ t('gallery.mine.nameTitle') }}</h2>
        <form class="row name-form" @submit.prevent="saveName">
          <div class="field grow">
            <label for="display-name">{{ t('gallery.mine.nameLabel') }}</label>
            <input
              id="display-name"
              v-model="name"
              class="input"
              type="text"
              :minlength="DISPLAY_NAME_MIN"
              :maxlength="DISPLAY_NAME_MAX"
              autocomplete="nickname"
            />
          </div>
          <button class="btn btn-primary" type="submit" :disabled="savingName || !isValidDisplayName(name) || name.trim() === auth.displayName">
            {{ t('gallery.mine.save') }}
          </button>
        </form>
        <p class="muted small">{{ t('gallery.mine.nameHint', { min: DISPLAY_NAME_MIN, max: DISPLAY_NAME_MAX }) }}</p>
      </section>

      <h2 class="section-title">{{ t('gallery.mine.uploads') }}</h2>
      <p v-if="loading" class="muted" role="status">{{ t('gallery.loading') }}</p>
      <div v-else-if="failed" class="card notice">
        <p>{{ t('gallery.loadError') }}</p>
        <button class="btn" @click="load">{{ t('gallery.retry') }}</button>
      </div>
      <div v-else-if="items.length === 0" class="card notice">
        <p class="muted">{{ t('gallery.mine.empty') }}</p>
        <RouterLink class="btn btn-primary" to="/">{{ t('gallery.empty.cta') }}</RouterLink>
      </div>
      <div v-else class="grid">
        <DesignCard v-for="d in items" :key="d.id" :design="d" show-status hide-actions>
          <template #actions>
            <p v-if="d.status === 'pending'" class="muted small">{{ t('gallery.mine.pendingHint') }}</p>
            <p v-else-if="d.status === 'hidden'" class="muted small">{{ t('gallery.mine.hiddenHint') }}</p>
            <p v-else-if="d.status === 'rejected'" class="muted small">{{ t('gallery.mine.rejectedHint') }}</p>
            <div class="row">
              <span class="muted small">{{ t('gallery.detail.likes', { n: d.likeCount }) }}</span>
              <span class="spacer" />
              <button class="btn btn-sm btn-danger" :aria-label="t('gallery.mine.deleteLabel', { title: d.title })" @click="remove(d)">
                {{ t('gallery.mine.delete') }}
              </button>
            </div>
          </template>
        </DesignCard>
      </div>

      <section class="card notice account">
        <h2 class="panel-title">{{ t('gallery.mine.accountTitle') }}</h2>
        <p class="small">
          {{ t('gallery.mine.accountDelete') }}
          <a v-if="CONTACT_EMAIL" :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>
        </p>
      </section>
    </template>

    <LoginDialog v-if="loginOpen" @close="loginOpen = false" />
  </main>
</template>

<style scoped>
.notice {
  padding: 16px 20px;
  margin: 16px 0;
}
.name-form {
  align-items: flex-end;
  flex-wrap: wrap;
}
.name-form .field {
  margin-bottom: 0;
}
.grow {
  flex: 1;
  min-width: 200px;
}
.section-title {
  margin-top: 24px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.small {
  font-size: 12px;
}
.account {
  margin-top: 32px;
}
</style>
