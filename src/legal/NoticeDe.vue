<!-- Vorlage – vor Veröffentlichung prüfen lassen -->
<script setup lang="ts">
import { APP_NAME, REPO_URL } from '@/config'
import ContactEmail from './ContactEmail.vue'
import { FRAME_CREDIT } from '@/lib/library/frames'
import { formatLastUpdated } from './legalInfo'

const updated = formatLastUpdated('de')
</script>

<template>
  <h1>Rechtehinweis</h1>
  <p class="muted updated">Stand: {{ updated }}</p>

  <h2>Inoffizielles Fan-Projekt</h2>
  <p>
    {{ APP_NAME }} ist ein unabhängiges, nicht-kommerzielles Fan-Projekt. Es steht in keiner Verbindung zu Takara Tomy,
    Hasbro oder d-rights bzw. deren Lizenzgebern, wird von diesen nicht unterstützt, gefördert oder geprüft und ist kein
    offizielles Produkt.
  </p>

  <h2>Marken</h2>
  <p>
    „BEYBLADE“, „Beyblade X“ und alle weiteren Produkt- und Markennamen sind Marken oder eingetragene Marken der
    jeweiligen Inhaber. Sie werden hier ausschließlich beschreibend verwendet, um den Verwendungszweck des Programms
    anzugeben, nämlich Aufkleber und Labels für Zubehör dieser Spielzeuge zu gestalten (vgl. § 23 Nr. 3 MarkenG). Eine
    Verwendung als eigene Marke oder ein Hinweis auf eine Herkunft aus dem Haus der Markeninhaber ist damit nicht
    verbunden.
  </p>

  <h2>Eingebaute Formen und Muster</h2>
  <p>
    Die in {{ APP_NAME }} eingebaute Sticker-Bibliothek (Formen und Muster) besteht aus eigenen Werken. Sie steht wie der
    Programmcode unter der MIT-Lizenz bzw. ist frei nutzbar.
  </p>

  <h2>Credits</h2>
  <p>
    Die Rahmen-Vorlagen für die runden Gear-Chip-Sticker stammen von
    <a :href="FRAME_CREDIT.url" target="_blank" rel="noopener">{{ FRAME_CREDIT.author }} ({{ FRAME_CREDIT.handle }})</a>.
    Vielen Dank! Die Rechte an diesen Vorlagen liegen beim Ersteller.
  </p>

  <h2>Deine eigenen Inhalte</h2>
  <p>
    Für Bilder, Texte und Designs, die du verwendest, speicherst, teilst oder ausdruckst, bist du selbst verantwortlich.
    Bitte verwende nur Material, an dem du die Rechte hast oder dessen Verwendung erlaubt ist (siehe
    <RouterLink to="/legal/terms">Nutzungsbedingungen</RouterLink>). Das gilt auch für Inhalte aus dem Internet, von
    Herstellern oder aus Fan-Communities. {{ APP_NAME }} hostet keine Inhalte von Nutzern.
  </p>

  <h2>Hinweise auf Rechtsverletzungen</h2>
  <p>
    Du glaubst, dass in den Vorlagen, Formen, Mustern oder im Code von {{ APP_NAME }} etwas enthalten ist, das deine
    Rechte verletzt? Dann schreib mir bitte kurz per E-Mail an <ContactEmail />. Nenne dabei, was genau betroffen ist
    (Fundstelle), welches Recht du hast und wie ich dich erreichen kann. Ich prüfe den Hinweis zeitnah und entferne
    problematische Inhalte bei berechtigten Hinweisen.
  </p>

  <h2>Open Source</h2>
  <p>
    Der Quellcode von {{ APP_NAME }} ist Open Source und steht unter der
    <strong>MIT-Lizenz</strong>. Du findest ihn unter
    <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">{{ REPO_URL }}</a>. Die MIT-Lizenz gilt für den
    Programmcode und die eigenen eingebauten Formen und Muster, nicht für Marken oder Inhalte Dritter. Eingebundene
    Open-Source-Bestandteile, etwa die selbst gehosteten Schriftarten, unterliegen ihren jeweiligen eigenen Lizenzen.
  </p>

  <h2>Weitere Informationen</h2>
  <p>
    <RouterLink to="/legal/imprint">Impressum</RouterLink> ·
    <RouterLink to="/legal/privacy">Datenschutzerklärung</RouterLink> ·
    <RouterLink to="/legal/terms">Nutzungsbedingungen</RouterLink>
  </p>
</template>
