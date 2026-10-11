import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/bangers/400.css'
import '@fontsource/russo-one/400.css'
import '@fontsource/anton/400.css'
import './style.css'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { applyTheme } from './lib/theme'

applyTheme()
document.documentElement.lang = i18n.global.locale.value

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
