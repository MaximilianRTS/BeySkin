<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { APP_NAME, REPO_URL } from '@/config'

const { t } = useI18n()
</script>

<template>
  <footer class="app-footer">
    <nav class="links" :aria-label="t('app.legal_nav')">
      <RouterLink to="/legal/imprint">{{ t('app.imprint') }}</RouterLink>
      <RouterLink to="/legal/privacy">{{ t('app.privacy') }}</RouterLink>
      <RouterLink to="/legal/terms">{{ t('app.terms') }}</RouterLink>
      <RouterLink to="/legal/notice">{{ t('app.notice') }}</RouterLink>
      <a :href="REPO_URL" target="_blank" rel="noopener">GitHub</a>
    </nav>
    <p class="disclaimer">{{ t('app.disclaimer', { app: APP_NAME }) }}</p>
  </footer>
</template>

<style scoped>
.app-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 24px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: transparent;
  font-size: 12px;
  color: var(--text-muted);
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.links a {
  color: var(--text-muted);
  text-decoration: none;
}
.links a:hover {
  color: var(--text);
  text-decoration: underline;
}
.disclaimer {
  margin: 0;
  max-width: 640px;
  font-size: 11px;
  opacity: 0.8;
}
</style>
