<!-- Template – have this reviewed before publishing. The German version is the authoritative one. -->
<script setup lang="ts">
import { APP_NAME } from '@/config'
import ContactEmail from './ContactEmail.vue'
import {
  OPERATOR_NAME,
  OPERATOR_ADDRESS,
  HOSTING_PROVIDER,
  HOSTING_PRIVACY_URL,
  SUPERVISORY_AUTHORITY,
  formatLastUpdated,
} from './legalInfo'

const updated = formatLastUpdated('en')
</script>

<template>
  <h1>Privacy policy</h1>
  <p class="muted updated">Last updated: {{ updated }}. The German version is legally authoritative.</p>

  <h2>1. Controller</h2>
  <p>The controller for data processing on this website within the meaning of the GDPR is:</p>
  <address>
    {{ OPERATOR_NAME }}<br />
    <span :class="{ placeholder: OPERATOR_ADDRESS.startsWith('[') }">{{ OPERATOR_ADDRESS }}</span><br />
    Germany<br />
    E-mail: <ContactEmail />
  </address>

  <h2>2. In short</h2>
  <p>
    {{ APP_NAME }} is a free editor that runs entirely in your browser. There are no accounts, no login, no uploads and
    no server of my own that stores data about you. I use <strong>no cookies</strong>, <strong>no tracking</strong> and
    no analytics or advertising services. Fonts are self-hosted; apart from loading the page itself there are no
    requests to third-party servers.
  </p>

  <h2>3. Hosting (GitHub Pages) and server log files</h2>
  <p>
    This website is a static site hosted by {{ HOSTING_PROVIDER }}. When you visit, the host processes technically
    necessary connection data, in particular your IP address, date and time, the page requested, and browser and
    operating system information (server log files). This is necessary to deliver the page and keep it secure. The legal
    basis is Art. 6 (1)(f) GDPR (legitimate interest in secure and stable operation). I have no access to these log
    files; what GitHub does with the data and how long it keeps it is described in
    <a :href="HOSTING_PRIVACY_URL" target="_blank" rel="noopener noreferrer">GitHub’s privacy statement</a>.
  </p>
  <p>
    As GitHub is based in the USA, a transfer to a third country may occur. It relies on the European Commission’s
    adequacy decision for the EU-US Data Privacy Framework (DPF) where the provider is certified, and otherwise on EU
    Standard Contractual Clauses.
  </p>

  <h2>4. Local processing and storage in your browser</h2>
  <p>
    Images, text and drafts you use in the editor are processed solely in your browser. They
    <strong>never leave your device</strong> and are not transmitted to me or to any other server.
  </p>
  <p>
    So that your work is not lost, the app stores data in your browser: in IndexedDB (drafts and images) and in
    localStorage (settings such as language, colour theme and print settings). This is technically necessary for the
    features you request; the legal basis is § 25 (2) no. 2 TDDDG. You can delete this data at any time in your browser
    settings (“clear site data”).
  </p>

  <h2>5. Sharing by link</h2>
  <p>
    With “share link” your design (without uploaded images – these become placeholders) is compressed and encoded in the
    URL fragment (the part after the <code>#</code>). The browser <strong>does not send the fragment to the
    server</strong>; I store nothing of it. Whoever opens the link sees the design rendered locally in their own browser.
  </p>
  <p>
    <strong>Important:</strong> the content of the link (e.g. text in the design) is readable by anyone who has the link.
    Only pass the link on to people who should see it, and do not write personal data (names, addresses, contact
    details) into text you want to share. You decide where you post or send the link.
  </p>

  <h2>6. Sharing files (system share menu / download)</h2>
  <p>
    You can pass on PNG images and project files via your device’s share menu (Web Share API) or download them. You
    decide which service the file goes to (e.g. Discord or WhatsApp). The transfer is carried out by that service, not by
    {{ APP_NAME }}; the privacy terms of the chosen service apply to that processing. I do not learn about it.
  </p>

  <h2>7. No cookies, no tracking</h2>
  <p>
    No cookies are set and no analytics, advertising or social media services are embedded. That is why there is no
    cookie banner.
  </p>

  <h2>8. Your rights</h2>
  <p>
    Under the GDPR you have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of
    processing (Art. 18), data portability (Art. 20) and to object to processing based on legitimate interests (Art. 21).
    As I do not store data about you myself, I can usually only tell you that I hold nothing; the log files are held by
    the host (see section 3).
  </p>
  <p>
    If you have questions, just write to <ContactEmail />. You also have the right to lodge a complaint with a data
    protection supervisory authority (Art. 77 GDPR), for example in your place of residence or where I am based. The
    authority responsible for me is:
    <span :class="{ placeholder: SUPERVISORY_AUTHORITY.startsWith('[') }">{{ SUPERVISORY_AUTHORITY }}</span>.
  </p>

  <h2>9. Changes</h2>
  <p>
    I will update this policy when the app or the legal situation changes. The version published here applies. Last
    updated: {{ updated }}.
  </p>
</template>
