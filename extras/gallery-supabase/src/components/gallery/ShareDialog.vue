<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import LoginDialog from './LoginDialog.vue'
import { useDialog } from './composables'
import { errorMessage, MAX_TITLE_LENGTH, renderThumbnail, uploadDesign } from '@/services/gallery'
import { useAuthStore } from '@/stores/auth'
import type { Design } from '@/lib/model'
import { toast } from '@/lib/toast'

const props = defineProps<{ design: Design }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const dialog = ref<HTMLElement | null>(null)
useDialog(dialog, () => {
  if (!uploading.value) emit('close')
})

const title = ref(props.design.name.trim().slice(0, MAX_TITLE_LENGTH))
const rightsOk = ref(false)
const termsOk = ref(false)
const uploading = ref(false)
const done = ref(false)
const loginOpen = ref(false)
const previewUrl = ref<string | null>(null)
const previewFailed = ref(false)

const isEmpty = computed(() => props.design.layers.length === 0)
const canUpload = computed(
  () => !!auth.user && !isEmpty.value && title.value.trim().length > 0 && rightsOk.value && termsOk.value && !uploading.value,
)

onMounted(async () => {
  void auth.init()
  try {
    const blob = await renderThumbnail(props.design)
    previewUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    console.warn('preview failed', err)
    previewFailed.value = true
  }
})
onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

async function upload() {
  if (!canUpload.value) return
  uploading.value = true
  try {
    await uploadDesign(props.design, title.value)
    done.value = true
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="dialog-backdrop" @mousedown.self="!uploading && emit('close')">
      <div ref="dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" tabindex="-1">
        <h2 id="share-title">{{ t('gallery.share.title') }}</h2>

        <div v-if="done" role="status">
          <p>
            <strong>{{ t('gallery.share.successTitle') }}</strong>
          </p>
          <p class="muted">{{ t('gallery.share.successText') }}</p>
          <div class="dialog-actions">
            <RouterLink class="btn" to="/me" @click="emit('close')">{{ t('gallery.share.toMyUploads') }}</RouterLink>
            <button class="btn btn-primary" data-autofocus @click="emit('close')">{{ t('gallery.close') }}</button>
          </div>
        </div>

        <template v-else>
          <p class="muted">{{ t('gallery.share.intro') }}</p>

          <div class="preview" :aria-label="t('gallery.share.preview')">
            <img v-if="previewUrl" :src="previewUrl" :alt="t('gallery.share.previewAlt')" />
            <span v-else-if="previewFailed" class="muted">{{ t('gallery.errors.render') }}</span>
            <span v-else class="muted">{{ t('gallery.loading') }}</span>
          </div>

          <p v-if="isEmpty" class="badge badge-warning" role="alert">{{ t('gallery.share.empty') }}</p>

          <form @submit.prevent="upload">
            <div class="field">
              <label for="share-name">{{ t('gallery.share.titleLabel') }}</label>
              <input
                id="share-name"
                v-model="title"
                class="input"
                type="text"
                :maxlength="MAX_TITLE_LENGTH"
                required
                data-autofocus
                :placeholder="t('gallery.share.titlePlaceholder')"
              />
            </div>

            <label class="checkbox check">
              <input v-model="rightsOk" type="checkbox" />
              <span>{{ t('gallery.share.rights') }}</span>
            </label>
            <label class="checkbox check">
              <input v-model="termsOk" type="checkbox" />
              <I18nT keypath="gallery.share.terms" tag="span">
                <template #link>
                  <a href="#/legal/terms" target="_blank" rel="noopener">{{ t('gallery.share.termsLink') }}</a>
                </template>
              </I18nT>
            </label>

            <p class="muted small">{{ t('gallery.share.review') }}</p>

            <p v-if="!auth.user" class="small" role="note">
              {{ t('gallery.share.needLogin') }}
              <button type="button" class="btn btn-sm" @click="loginOpen = true">{{ t('gallery.auth.signIn') }}</button>
            </p>

            <div class="dialog-actions">
              <button type="button" class="btn" :disabled="uploading" @click="emit('close')">
                {{ t('gallery.cancel') }}
              </button>
              <button type="submit" class="btn btn-primary" :disabled="!canUpload">
                {{ uploading ? t('gallery.share.uploading') : t('gallery.share.upload') }}
              </button>
            </div>
          </form>
        </template>
      </div>
    </div>
    <LoginDialog v-if="loginOpen" @close="loginOpen = false" />
  </Teleport>
</template>

<style scoped>
.preview {
  display: grid;
  place-items: center;
  min-height: 90px;
  margin: 12px 0;
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.preview img {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
}
.check {
  margin-bottom: 8px;
}
.small {
  font-size: 12px;
}
</style>
