<!-- Template – have this reviewed before publishing. The German version is the authoritative one. -->
<script setup lang="ts">
import { APP_NAME, REPO_URL } from '@/config'
import ContactEmail from './ContactEmail.vue'
import { FRAME_CREDIT } from '@/lib/library/frames'
import { formatLastUpdated } from './legalInfo'

const updated = formatLastUpdated('en')
</script>

<template>
  <h1>Rights notice</h1>
  <p class="muted updated">Last updated: {{ updated }}. The German version is legally authoritative.</p>

  <h2>Unofficial fan project</h2>
  <p>
    {{ APP_NAME }} is an independent, non-commercial fan project. It is not affiliated with, endorsed by, sponsored by
    or reviewed by Takara Tomy, Hasbro or d-rights or their licensors, and it is not an official product.
  </p>

  <h2>Trademarks</h2>
  <p>
    “BEYBLADE”, “Beyblade X” and all other product and brand names are trademarks or registered trademarks of their
    respective owners. They are used here solely descriptively, to indicate the purpose of the program – designing
    stickers and labels for accessories of these toys (cf. § 23 no. 3 German Trade Mark Act). This does not imply use as
    a trademark of our own or any indication that the program originates from the trademark owners.
  </p>

  <h2>Built-in shapes and patterns</h2>
  <p>
    The sticker library built into {{ APP_NAME }} (shapes and patterns) consists of original works. Like the program
    code, it is released under the MIT licence and is free to use.
  </p>

  <h2>Credits</h2>
  <p>
    The frame templates for the round gear chip stickers were made by
    <a :href="FRAME_CREDIT.url" target="_blank" rel="noopener">{{ FRAME_CREDIT.author }} ({{ FRAME_CREDIT.handle }})</a>.
    Thank you! All rights to these templates remain with their creator.
  </p>

  <h2>Your own content</h2>
  <p>
    You are responsible for images, text and designs you use, save, share or print. Please only use material you have
    the rights to or whose use is permitted (see the <RouterLink to="/legal/terms">terms of use</RouterLink>). This also
    applies to content from the internet, from manufacturers or from fan communities. {{ APP_NAME }} does not host user
    content.
  </p>

  <h2>Reporting possible infringements</h2>
  <p>
    Do you believe that the templates, shapes, patterns or code of {{ APP_NAME }} contain something that infringes your
    rights? Please send me a short e-mail at <ContactEmail />. Say what exactly is affected (location), what right you
    hold and how I can reach you. I will look into it promptly and remove problematic content where a notice is
    justified.
  </p>

  <h2>Open source</h2>
  <p>
    The source code of {{ APP_NAME }} is open source under the <strong>MIT licence</strong>. You can find it at
    <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">{{ REPO_URL }}</a>. The MIT licence covers the program
    code and the built-in original shapes and patterns, not trademarks or third-party content. Included open-source
    components, such as the self-hosted fonts, are subject to their own licences.
  </p>

  <h2>More information</h2>
  <p>
    <RouterLink to="/legal/imprint">Imprint</RouterLink> ·
    <RouterLink to="/legal/privacy">Privacy policy</RouterLink> ·
    <RouterLink to="/legal/terms">Terms of use</RouterLink>
  </p>
</template>
