<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { APP_NAME, BRAND_PARENT, BRAND_PARENT_URL } from '@/config'
import { LOCALE_NAMES, setLocale, SUPPORTED_LOCALES, type Locale } from '@/i18n'
import { setTheme, themePref, type ThemePref } from '@/lib/theme'
import Icon from '@/components/common/Icon.vue'

const { t, locale } = useI18n()
const logoSrc = `${import.meta.env.BASE_URL}brand/bey-companion-logo.png`

const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark']
const themeIcon = computed(() => ({ system: 'monitor', light: 'sun', dark: 'moon' })[themePref.value])
const themeLabel = computed(() => t('app.theme_toggle', { mode: t(`app.theme_${themePref.value}`) }))

function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(themePref.value) + 1) % THEME_ORDER.length]
  setTheme(next)
}
function onLocale(e: Event) {
  setLocale((e.target as HTMLSelectElement).value as Locale)
}
</script>

<template>
  <header class="app-header">
    <div class="brand-block">
      <RouterLink to="/" class="brand-logo" tabindex="-1" aria-hidden="true">
        <img :src="logoSrc" alt="" width="32" height="32" />
      </RouterLink>
      <div class="brand-text">
        <RouterLink to="/" class="brand" :aria-label="APP_NAME">{{ APP_NAME }}</RouterLink>
        <a class="brand-parent" :href="BRAND_PARENT_URL" target="_blank" rel="noopener">by {{ BRAND_PARENT }}</a>
      </div>
    </div>
    <span class="spacer" />
    <label class="lang">
      <Icon name="globe" />
      <span class="sr-only">{{ t('app.language') }}</span>
      <select class="lang-select" :value="locale" :aria-label="t('app.language')" @change="onLocale">
        <option v-for="l in SUPPORTED_LOCALES" :key="l" :value="l">{{ LOCALE_NAMES[l] }}</option>
      </select>
    </label>
    <button class="btn btn-ghost btn-icon" :title="themeLabel" :aria-label="themeLabel" @click="cycleTheme">
      <Icon :name="themeIcon" />
    </button>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--header-h);
  padding: 0 16px;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
}
.brand-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.brand-logo {
  display: flex;
  flex: none;
  filter: drop-shadow(0 0 8px rgba(232, 66, 58, 0.45));
}
.brand-logo img {
  display: block;
  width: 32px;
  height: 32px;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  min-width: 0;
}
.brand {
  color: var(--text);
  text-decoration: none;
  font-family: var(--font-brand);
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.02em;
}
.brand-parent {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}
.brand-parent:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}
@media (max-width: 559px) {
  .app-header {
    padding: 0 10px;
    gap: 6px;
  }
  .brand-block {
    gap: 8px;
  }
  .brand-logo img {
    width: 26px;
    height: 26px;
  }
  .brand {
    font-size: 16px;
  }
  .brand-parent {
    font-size: 10px;
  }
}
.lang {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 0 10px;
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-muted);
}
.lang:focus-within {
  border-color: var(--accent);
}
.lang-select {
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  padding: 6px 4px;
  cursor: pointer;
  outline: none;
}
.lang-select option {
  background: var(--surface);
  color: var(--text);
}
</style>
