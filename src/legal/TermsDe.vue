<!-- Vorlage – vor Veröffentlichung prüfen lassen -->
<script setup lang="ts">
import { APP_NAME } from '@/config'
import { OPERATOR_NAME, formatLastUpdated } from './legalInfo'

const updated = formatLastUpdated('de')
</script>

<template>
  <h1>Nutzungsbedingungen</h1>
  <p class="muted updated">Stand: {{ updated }}</p>
  <p>Hier steht in einfachen Worten, wie du {{ APP_NAME }} nutzen darfst.</p>

  <h2>1. Was ist {{ APP_NAME }}?</h2>
  <ul>
    <li>{{ APP_NAME }} ist ein <strong>kostenloser</strong> Editor, mit dem du Sticker und Labels für Zubehör von Kreisel-Kampfspielzeug gestalten, in 3D ansehen und ausdrucken kannst. Alles läuft in deinem Browser.</li>
    <li>Es ist ein <strong>inoffizielles Fan-Projekt</strong> und hat nichts mit den Herstellern oder Markeninhabern zu tun (mehr dazu im <RouterLink to="/legal/notice">Rechtehinweis</RouterLink>).</li>
    <li>Der Dienst wird von einer Privatperson ({{ OPERATOR_NAME }}) in der Freizeit betrieben und gibt es <strong>ohne Gewähr</strong>: Es kann Fehler geben, Druckergebnisse und Farben können abweichen, und die Vorlagen passen nicht garantiert auf jedes Modell.</li>
    <li>Es gibt keinen Anspruch darauf, dass der Dienst immer verfügbar ist.</li>
  </ul>

  <h2>2. Deine Designs, deine Verantwortung</h2>
  <ul>
    <li>Nutze nur Bilder und Texte, an denen du <strong>die Rechte hast</strong> oder deren Verwendung erlaubt ist. Die eingebaute Bibliothek mit Formen und Mustern darfst du frei verwenden.</li>
    <li>Der Dienst ist für die <strong>private Nutzung</strong> gedacht.</li>
    <li>Achte auf die Rechte Dritter, besonders auf <strong>fremde Marken, Logos, Figuren und Bilder</strong>, auch wenn du Designs über einen Link oder als Datei an andere weitergibst. Beim <strong>Verkaufen von Stickern</strong> musst du das erst recht beachten, denn dafür brauchst du in der Regel eine Erlaubnis der Rechteinhaber.</li>
    <li>Schreib keine persönlichen Daten in Designs, die du teilst. Ein Teilen-Link ist für jeden lesbar, der ihn hat (siehe <RouterLink to="/legal/privacy">Datenschutzerklärung</RouterLink>).</li>
    <li>Du gestaltest, teilst, druckst und verwendest deine Designs auf eigene Verantwortung. Bitte achte beim Ausdrucken und Aufkleben auch auf dein Spielzeug.</li>
  </ul>

  <h2>3. Haftung</h2>
  <p>Weil der Dienst kostenlos ist, gilt Folgendes:</p>
  <ul>
    <li>
      Ich hafte <strong>unbeschränkt</strong> bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper
      oder Gesundheit, bei arglistig verschwiegenen Mängeln sowie in den Fällen, in denen das Gesetz zwingend eine
      Haftung vorschreibt (z. B. nach dem Produkthaftungsgesetz).
    </li>
    <li>
      Bei einfacher Fahrlässigkeit hafte ich nur bei Verletzung einer <strong>wesentlichen Pflicht</strong> (also einer
      Pflicht, auf deren Einhaltung du vertrauen darfst), und dann nur für den <strong>vorhersehbaren, typischen
      Schaden</strong>.
    </li>
    <li>Im Übrigen ist die Haftung ausgeschlossen. Ich hafte insbesondere nicht für Inhalte, die du selbst verwendest oder weitergibst, und nicht für Datenverlust. Deine Entwürfe liegen nur in deinem Browser; sichere sie deshalb selbst (Projektdatei exportieren).</li>
  </ul>

  <h2>4. Open Source</h2>
  <p>
    Der Quellcode von {{ APP_NAME }} steht unter der <strong>MIT-Lizenz</strong>. Mehr dazu im
    <RouterLink to="/legal/notice">Rechtehinweis</RouterLink>.
  </p>

  <h2>5. Änderungen</h2>
  <p>
    Ich kann den Dienst oder einzelne Funktionen ändern, einschränken oder einstellen. Diese Nutzungsbedingungen kann
    ich ändern, wenn es einen sachlichen Grund gibt (z. B. neue Funktionen oder geänderte Gesetze). Es gilt die jeweils
    hier abrufbare Fassung.
  </p>

  <h2>6. Anwendbares Recht</h2>
  <p>
    Es gilt deutsches Recht. Wenn du Verbraucher bist und deinen gewöhnlichen Aufenthalt in einem anderen Staat hast,
    bleiben dir die zwingenden Verbraucherschutzvorschriften dieses Staates erhalten. Sollte eine Regelung dieser
    Bedingungen unwirksam sein, bleiben die übrigen Regelungen wirksam.
  </p>
</template>
