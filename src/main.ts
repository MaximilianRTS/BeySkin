import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/bangers/400.css'
import '@fontsource/russo-one/400.css'
import '@fontsource/anton/400.css'
import '@fontsource/bungee/400.css'
import '@fontsource/black-ops-one/400.css'
import '@fontsource/orbitron/400.css'
import '@fontsource/audiowide/400.css'
import '@fontsource/teko/400.css'
import '@fontsource/press-start-2p/400.css'
import './style.css'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { applyTheme } from './lib/theme'

applyTheme()
document.documentElement.lang = i18n.global.locale.value

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
