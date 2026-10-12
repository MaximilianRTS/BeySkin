/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE_URL is set by the GitHub Pages workflow (e.g. /BeyBattlePass/); locally it is '/'.
export default defineConfig({
  plugins: [
    vue(),
    // Offline support: the whole app (incl. fonts + 3D model) is precached. The service
    // worker is registered from src/lib/pwa.ts and only updates after the user agrees.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest',
      includeManifestIcons: false,
      manifest: {
        id: './',
        name: 'BeySkin',
        short_name: 'BeySkin',
        description: 'Free sticker & label editor for spinning-top battle gear: design, preview in 3D, print.',
        lang: 'en',
        // Relative to the manifest, so it works under the GitHub Pages base path.
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0d0f14',
        background_color: '#0d0f14',
        categories: ['design', 'graphics', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // App shell, chunks, fonts (only woff2 – every supported browser uses it) and the 3D model.
        // (Manifest + icons are matched here already; the plugin adds the manifest itself.)
        globPatterns: ['**/*.{html,js,css,svg,png,jpg,jpeg,webp,woff2,glb}'],
        // three.js chunk + model are large; keep a generous headroom.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  base: process.env.VITE_BASE_URL ?? '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // three.js (3D preview) is lazy-loaded and legitimately large.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
  },
})
