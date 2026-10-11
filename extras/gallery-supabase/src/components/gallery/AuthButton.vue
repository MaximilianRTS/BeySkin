<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import LoginDialog from './LoginDialog.vue'
import { errorMessage } from '@/services/gallery'
import { galleryEnabled } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/lib/toast'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const loginOpen = ref(false)
const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const menuButton = ref<HTMLButtonElement | null>(null)

const initial = computed(() => (auth.displayName || auth.user?.email || '?').charAt(0).toUpperCase())

function onDocumentPointer(e: PointerEvent) {
  if (menuOpen.value && root.value && !root.value.contains(e.target as Node)) menuOpen.value = false
}

function onMenuKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false
    menuButton.value?.focus()
  }
}

onMounted(() => {
  void auth.init()
  document.addEventListener('pointerdown', onDocumentPointer)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer))

function go(path: string) {
  menuOpen.value = false
  void router.push(path)
}

async function signOut() {
  menuOpen.value = false
  try {
    await auth.signOut()
    toast(t('gallery.auth.signedOut'), 'success')
  } catch (err) {
    toast(errorMessage(err), 'error')
  }
}
</script>

<template>
  <div v-if="galleryEnabled" ref="root" class="auth-button" @keydown="onMenuKeydown">
    <button v-if="!auth.user" class="btn btn-sm" :disabled="!auth.ready" @click="loginOpen = true">
      {{ t('gallery.auth.signIn') }}
    </button>
    <template v-else>
      <button
        ref="menuButton"
        class="avatar"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        :aria-label="t('gallery.auth.accountMenu', { name: auth.displayName })"
        @click="menuOpen = !menuOpen"
      >
        {{ initial }}
      </button>
      <div v-if="menuOpen" class="menu card" role="menu">
        <div class="menu-head muted">{{ auth.displayName }}</div>
        <button class="menu-item" role="menuitem" @click="go('/me')">{{ t('gallery.auth.myUploads') }}</button>
        <button v-if="auth.isAdmin" class="menu-item" role="menuitem" @click="go('/admin')">
          {{ t('gallery.auth.admin') }}
        </button>
        <button class="menu-item" role="menuitem" @click="signOut">{{ t('gallery.auth.signOut') }}</button>
      </div>
    </template>
    <LoginDialog v-if="loginOpen" @close="loginOpen = false" />
  </div>
</template>

<style scoped>
.auth-button {
  position: relative;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.avatar:hover {
  background: var(--accent);
  color: var(--accent-contrast);
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 60;
  min-width: 180px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}
.menu-head {
  padding: 6px 10px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.menu-item {
  text-align: left;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.menu-item:hover {
  background: var(--surface-2);
}
</style>
