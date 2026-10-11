<!-- Template – have this reviewed before publishing. The German version is the authoritative one. -->
<script setup lang="ts">
import { APP_NAME } from '@/config'
import { OPERATOR_NAME, formatLastUpdated } from './legalInfo'

const updated = formatLastUpdated('en')
</script>

<template>
  <h1>Terms of use</h1>
  <p class="muted updated">Last updated: {{ updated }}. The German version is legally authoritative.</p>
  <p>These terms explain in plain words how you may use {{ APP_NAME }}.</p>

  <h2>1. What is {{ APP_NAME }}?</h2>
  <ul>
    <li>{{ APP_NAME }} is a <strong>free</strong> editor for designing stickers and labels for spinning-top battle gear, previewing them in 3D and printing them. Everything runs in your browser.</li>
    <li>It is an <strong>unofficial fan project</strong> with no connection to the manufacturers or trademark owners (see the <RouterLink to="/legal/notice">rights notice</RouterLink>).</li>
    <li>The service is run by a private individual ({{ OPERATOR_NAME }}) in their spare time and is provided <strong>as is, without warranty</strong>: there may be errors, print results and colours may differ, and templates are not guaranteed to fit every model.</li>
    <li>There is no right to the service being available at all times.</li>
  </ul>

  <h2>2. Your designs, your responsibility</h2>
  <ul>
    <li>Only use images and text you <strong>have the rights to</strong> or whose use is permitted. You may use the built-in library of shapes and patterns freely.</li>
    <li>The service is meant for <strong>private use</strong>.</li>
    <li>Respect the rights of third parties, especially <strong>other people’s trademarks, logos, characters and images</strong>, also when you pass designs on to others by link or as a file. This applies all the more if you <strong>sell stickers</strong>, as that usually requires permission from the rights holders.</li>
    <li>Do not write personal data into designs you share. A share link is readable by anyone who has it (see the <RouterLink to="/legal/privacy">privacy policy</RouterLink>).</li>
    <li>You design, share, print and use your designs at your own responsibility. Please also take care of your toy when printing and sticking.</li>
  </ul>

  <h2>3. Liability</h2>
  <p>Because the service is free of charge, the following applies:</p>
  <ul>
    <li>
      I am liable <strong>without limitation</strong> for intent and gross negligence, for injury to life, body or
      health, for fraudulently concealed defects, and where the law mandatorily provides for liability (e.g. under the
      Product Liability Act).
    </li>
    <li>
      In case of simple negligence I am only liable for breach of an <strong>essential obligation</strong> (one you may
      rely on being fulfilled), and then only for <strong>foreseeable, typical damage</strong>.
    </li>
    <li>Otherwise liability is excluded. In particular I am not liable for content you use or pass on yourself, or for data loss. Your drafts are stored only in your browser, so please back them up yourself (export the project file).</li>
  </ul>

  <h2>4. Open source</h2>
  <p>
    The source code of {{ APP_NAME }} is licensed under the <strong>MIT licence</strong>. More in the
    <RouterLink to="/legal/notice">rights notice</RouterLink>.
  </p>

  <h2>5. Changes</h2>
  <p>
    I may change, restrict or discontinue the service or individual features. I may change these terms where there is a
    valid reason (e.g. new features or changed laws). The version published here applies.
  </p>

  <h2>6. Governing law</h2>
  <p>
    German law applies. If you are a consumer habitually resident in another country, the mandatory consumer protection
    provisions of that country remain available to you. If any provision of these terms is invalid, the remaining
    provisions stay in effect.
  </p>
</template>
