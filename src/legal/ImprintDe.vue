<!-- Vorlage – vor Veröffentlichung prüfen lassen -->
<script setup lang="ts">
import { APP_NAME } from '@/config'
import ContactEmail from './ContactEmail.vue'
import { OPERATOR_NAME, OPERATOR_ADDRESS, formatLastUpdated } from './legalInfo'

const updated = formatLastUpdated('de')
</script>

<template>
  <h1>Impressum</h1>
  <p class="muted updated">Stand: {{ updated }}</p>

  <h2>Angaben nach § 5 DDG</h2>
  <address>
    {{ OPERATOR_NAME }}<br />
    <span :class="{ placeholder: OPERATOR_ADDRESS.startsWith('[') }">{{ OPERATOR_ADDRESS }}</span><br />
    Deutschland
  </address>

  <h2>Kontakt</h2>
  <p>E-Mail: <ContactEmail /></p>
  <p class="muted">
    {{ APP_NAME }} ist ein privates, nicht-kommerzielles Hobbyprojekt. Der Kontakt erfolgt am schnellsten per E-Mail;
    ich antworte in der Regel innerhalb weniger Tage.
  </p>

  <h2>Verantwortlich für Inhalte</h2>
  <p>
    Verantwortlich für die Inhalte dieser Website nach § 18 Abs. 1 MStV (und, soweit einschlägig, § 18 Abs. 2 MStV) ist
    {{ OPERATOR_NAME }}, Anschrift wie oben.
  </p>

  <h2>Haftung für Links</h2>
  <p>
    Diese Website verlinkt auf externe Seiten, auf deren Inhalte ich keinen Einfluss habe. Für diese fremden Inhalte ist
    immer der jeweilige Anbieter verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar. Bei
    Bekanntwerden von Rechtsverletzungen entferne ich solche Links umgehend.
  </p>

  <h2>Weitere Informationen</h2>
  <p>
    <RouterLink to="/legal/privacy">Datenschutzerklärung</RouterLink> ·
    <RouterLink to="/legal/terms">Nutzungsbedingungen</RouterLink> ·
    <RouterLink to="/legal/notice">Rechtehinweis</RouterLink>
  </p>
</template>
