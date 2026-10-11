/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// VITE_BASE_URL is set by the GitHub Pages workflow (e.g. /BeyBattlePass/); locally it is '/'.
export default defineConfig({
  plugins: [vue()],
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
