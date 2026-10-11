<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import ImprintDe from '@/legal/ImprintDe.vue'
import ImprintEn from '@/legal/ImprintEn.vue'
import PrivacyDe from '@/legal/PrivacyDe.vue'
import PrivacyEn from '@/legal/PrivacyEn.vue'
import TermsDe from '@/legal/TermsDe.vue'
import TermsEn from '@/legal/TermsEn.vue'
import NoticeDe from '@/legal/NoticeDe.vue'
import NoticeEn from '@/legal/NoticeEn.vue'

type LegalPage = 'imprint' | 'privacy' | 'terms' | 'notice'

const props = defineProps<{ page: LegalPage }>()
const { locale, t } = useI18n()
const otherLanguage = computed(() => !/^(de|en)/i.test(String(locale.value)))

const lang = computed<'de' | 'en'>(() => (String(locale.value).toLowerCase().startsWith('de') ? 'de' : 'en'))

const contents: Record<LegalPage, Record<'de' | 'en', Component>> = {
  imprint: { de: ImprintDe, en: ImprintEn },
  privacy: { de: PrivacyDe, en: PrivacyEn },
  terms: { de: TermsDe, en: TermsEn },
  notice: { de: NoticeDe, en: NoticeEn },
}

const labels: Record<LegalPage, Record<'de' | 'en', string>> = {
  imprint: { de: 'Impressum', en: 'Imprint' },
  privacy: { de: 'Datenschutz', en: 'Privacy' },
  terms: { de: 'Nutzungsbedingungen', en: 'Terms of use' },
  notice: { de: 'Rechtehinweis', en: 'Rights notice' },
}

const pages = Object.keys(contents) as LegalPage[]
// Unknown route params fall back to the imprint instead of rendering nothing.
const current = computed<LegalPage>(() => (pages.includes(props.page) ? props.page : 'imprint'))
const content = computed(() => contents[current.value][lang.value])
</script>

<template>
  <main class="page legal-page">
    <nav class="legal-nav" :aria-label="lang === 'de' ? 'Rechtliche Informationen' : 'Legal information'">
      <RouterLink
        v-for="p in pages"
        :key="p"
        :to="`/legal/${p}`"
        class="legal-nav-link"
        :class="{ active: p === current }"
        :aria-current="p === current ? 'page' : undefined"
      >
        {{ labels[p][lang] }}
      </RouterLink>
    </nav>

    <p v-if="otherLanguage" class="legal-lang-note muted">{{ t('app.legal_note') }}</p>
    <article class="card legal-card">
      <component :is="content" />
    </article>
  </main>
</template>

<style scoped>
.legal-page {
  max-width: 760px;
}
.legal-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.legal-nav-link {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  font-weight: 500;
  text-decoration: none;
}
.legal-nav-link:hover {
  color: var(--text);
  background: var(--surface-2);
}
.legal-nav-link.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--text);
}
.legal-card {
  padding: 24px 28px 28px;
  font-size: 15px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.legal-card :deep(h1) {
  font-size: 26px;
  margin-bottom: 0.3em;
}
.legal-card :deep(h2) {
  font-size: 18px;
  margin: 1.8em 0 0.5em;
}
.legal-card :deep(h3) {
  font-size: 15px;
  margin: 1.2em 0 0.3em;
}
.legal-card :deep(p) {
  margin: 0 0 0.9em;
}
.legal-card :deep(ul),
.legal-card :deep(ol) {
  margin: 0 0 1em;
  padding-left: 1.4em;
}
.legal-card :deep(li) {
  margin-bottom: 0.35em;
}
.legal-card :deep(address) {
  font-style: normal;
  margin: 0 0 0.9em;
}
.legal-card :deep(.updated) {
  margin-bottom: 1.4em;
}
.legal-card :deep(.placeholder) {
  background: var(--accent-soft);
  border-radius: var(--radius-sm);
  padding: 0 4px;
}
@media (max-width: 600px) {
  .legal-card {
    padding: 18px 16px 22px;
  }
}
</style>
