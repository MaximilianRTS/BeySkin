<script setup lang="ts">
import { toasts } from '@/lib/toast'
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind">{{ item.message }}</div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 20px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  transform: translateX(-50%);
  pointer-events: none;
  width: min(440px, calc(100vw - 32px));
}
.toast {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  color: var(--text);
}
.toast.success {
  border-color: var(--success);
}
.toast.error {
  border-color: var(--danger);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
