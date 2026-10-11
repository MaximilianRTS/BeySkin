import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history: works on GitHub Pages / any static host without rewrite rules.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'editor', component: () => import('@/views/EditorView.vue') },
    // Shared design: the design lives in the URL itself (never sent to any server).
    { path: '/s/:data', name: 'shared', component: () => import('@/views/SharedView.vue'), props: true },
    { path: '/legal/:page', name: 'legal', component: () => import('@/views/LegalView.vue'), props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
