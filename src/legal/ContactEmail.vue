<script setup lang="ts">
import { CONTACT_EMAIL, CONTACT_EMAIL_PLACEHOLDER } from './legalInfo'
</script>

<template>
  <a v-if="CONTACT_EMAIL" :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>
  <span v-else class="placeholder">{{ CONTACT_EMAIL_PLACEHOLDER }}</span>
</template>
