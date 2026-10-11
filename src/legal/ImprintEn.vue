<!-- Template – have this reviewed before publishing. The German version is the authoritative one. -->
<script setup lang="ts">
import { APP_NAME } from '@/config'
import ContactEmail from './ContactEmail.vue'
import { OPERATOR_NAME, OPERATOR_ADDRESS, formatLastUpdated } from './legalInfo'

const updated = formatLastUpdated('en')
</script>

<template>
  <h1>Imprint</h1>
  <p class="muted updated">Last updated: {{ updated }}. The German version is legally authoritative.</p>

  <h2>Provider information (§ 5 DDG)</h2>
  <address>
    {{ OPERATOR_NAME }}<br />
    <span :class="{ placeholder: OPERATOR_ADDRESS.startsWith('[') }">{{ OPERATOR_ADDRESS }}</span><br />
    Germany
  </address>

  <h2>Contact</h2>
  <p>E-mail: <ContactEmail /></p>
  <p class="muted">
    {{ APP_NAME }} is a private, non-commercial hobby project. E-mail is the quickest way to reach me; I usually reply
    within a few days.
  </p>

  <h2>Responsible for content</h2>
  <p>
    Responsible for the content of this website under § 18 (1) MStV (and, where applicable, § 18 (2) MStV) is
    {{ OPERATOR_NAME }}, address as above.
  </p>

  <h2>Links to other websites</h2>
  <p>
    This website links to external sites whose content I do not control. The respective provider is always responsible
    for that content. No violations of law were apparent when the links were set. If I learn of any, I will remove the
    link promptly.
  </p>

  <h2>More information</h2>
  <p>
    <RouterLink to="/legal/privacy">Privacy policy</RouterLink> ·
    <RouterLink to="/legal/terms">Terms of use</RouterLink> ·
    <RouterLink to="/legal/notice">Rights notice</RouterLink>
  </p>
</template>
