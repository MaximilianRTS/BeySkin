<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDialog } from './composables'
import { errorMessage } from '@/services/gallery'
import { useAuthStore, type OAuthProvider } from '@/stores/auth'
import { toast } from '@/lib/toast'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const dialog = ref<HTMLElement | null>(null)
useDialog(dialog, () => emit('close'))

const email = ref('')
const busy = ref(false)
const sentTo = ref<string | null>(null)

// Closes itself once the session arrives (e.g. after the magic link opened in this tab).
watch(
  () => auth.user,
  (u) => u && emit('close'),
)

async function oauth(provider: OAuthProvider) {
  busy.value = true
  try {
    await auth.signInWithOAuth(provider)
  } catch (err) {
    toast(errorMessage(err), 'error')
    busy.value = false
  }
}

async function sendLink() {
  const address = email.value.trim()
  if (!address || busy.value) return
  busy.value = true
  try {
    await auth.signInWithEmail(address)
    sentTo.value = address
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="dialog-backdrop" @mousedown.self="emit('close')">
      <div ref="dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="login-title" tabindex="-1">
        <h2 id="login-title">{{ t('gallery.login.title') }}</h2>
        <p class="muted">{{ t('gallery.login.intro') }}</p>

        <template v-if="!sentTo">
          <div class="providers">
            <button class="btn" data-autofocus :disabled="busy" @click="oauth('discord')">{{ t('gallery.login.discord') }}</button>
            <button class="btn" :disabled="busy" @click="oauth('google')">{{ t('gallery.login.google') }}</button>
          </div>

          <p class="panel-title sep">{{ t('gallery.login.orEmail') }}</p>
          <form @submit.prevent="sendLink">
            <div class="field">
              <label for="login-email">{{ t('gallery.login.emailLabel') }}</label>
              <input
                id="login-email"
                v-model="email"
                class="input"
                type="email"
                autocomplete="email"
                maxlength="200"
                required
                :placeholder="t('gallery.login.emailPlaceholder')"
              />
            </div>
            <button class="btn btn-primary" type="submit" :disabled="busy || !email.trim()">
              {{ t('gallery.login.sendLink') }}
            </button>
          </form>
        </template>
        <div v-else role="status">
          <p>
            <strong>{{ t('gallery.login.linkSent', { email: sentTo }) }}</strong>
          </p>
          <p class="muted">{{ t('gallery.login.linkSentHint') }}</p>
        </div>

        <p class="muted small">
          {{ t('gallery.login.ageHint') }}
          <a href="#/legal/privacy" target="_blank" rel="noopener">{{ t('gallery.login.privacy') }}</a>
        </p>

        <div class="dialog-actions">
          <button class="btn" @click="emit('close')">{{ t('gallery.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.providers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}
.sep {
  margin-top: 16px;
}
.small {
  font-size: 12px;
  margin-top: 16px;
}
</style>
