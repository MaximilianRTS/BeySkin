<!-- Vorlage – vor Veröffentlichung prüfen lassen -->
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

const updated = formatLastUpdated('de')
</script>

<template>
  <h1>Datenschutzerklärung</h1>
  <p class="muted updated">Stand: {{ updated }}</p>

  <h2>1. Verantwortlicher</h2>
  <p>Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der DSGVO ist:</p>
  <address>
    {{ OPERATOR_NAME }}<br />
    <span :class="{ placeholder: OPERATOR_ADDRESS.startsWith('[') }">{{ OPERATOR_ADDRESS }}</span><br />
    Deutschland<br />
    E-Mail: <ContactEmail />
  </address>

  <h2>2. Kurz gesagt</h2>
  <p>
    {{ APP_NAME }} ist ein kostenloser Editor, der komplett in deinem Browser läuft. Es gibt keine Konten, keine
    Anmeldung, keine Uploads und keinen eigenen Server, der Daten von dir speichert. Ich setze <strong>keine
    Cookies</strong> ein, verwende <strong>kein Tracking</strong> und keine Analyse- oder Werbedienste. Die Schriftarten
    werden selbst gehostet; außer dem Laden der Seite selbst gibt es keine Anfragen an fremde Server.
  </p>

  <h2>3. Hosting (GitHub Pages) und Server-Logfiles</h2>
  <p>
    Diese Website ist eine statische Seite und wird bei {{ HOSTING_PROVIDER }} gehostet. Beim Aufruf verarbeitet der
    Hoster technisch notwendige Verbindungsdaten, insbesondere deine IP-Adresse, Datum und Uhrzeit, die abgerufene Seite
    sowie Browser- und Betriebssystem-Informationen (Server-Logfiles). Das ist erforderlich, um die Seite auszuliefern
    und die Sicherheit zu gewährleisten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem
    sicheren und stabilen Betrieb). Ich habe auf diese Logfiles keinen Zugriff; was GitHub damit macht und wie lange die
    Daten gespeichert werden, steht in der
    <a :href="HOSTING_PRIVACY_URL" target="_blank" rel="noopener noreferrer">Datenschutzerklärung von GitHub</a>.
  </p>
  <p>
    Da GitHub seinen Sitz in den USA hat, kann eine Übermittlung in ein Drittland stattfinden. Sie stützt sich auf den
    Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework (DPF), soweit der Anbieter zertifiziert
    ist, ansonsten auf EU-Standardvertragsklauseln.
  </p>

  <h2>4. Lokale Verarbeitung und Speicherung in deinem Browser</h2>
  <p>
    Bilder, Texte und Entwürfe, die du im Editor verwendest, werden ausschließlich in deinem Browser verarbeitet. Sie
    <strong>verlassen dein Gerät nicht</strong> und werden nicht an mich oder an andere Server übertragen.
  </p>
  <p>
    Damit deine Arbeit nicht verloren geht, speichert die App Daten in deinem Browser: in der IndexedDB (Entwürfe und
    Bilder) und im localStorage (Einstellungen wie Sprache, Farbschema und Druckeinstellungen). Das ist für die von dir
    gewünschten Funktionen technisch erforderlich; Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG. Du kannst diese Daten
    jederzeit in den Einstellungen deines Browsers („Websitedaten löschen“) entfernen.
  </p>

  <h2>5. Teilen per Link</h2>
  <p>
    Mit „Teilen-Link“ wird dein Design (ohne hochgeladene Bilder – diese werden zu Platzhaltern) komprimiert im
    URL-Fragment (dem Teil nach dem <code>#</code>) kodiert. Das Fragment wird vom Browser <strong>nicht an den Server
    übertragen</strong>; ich speichere nichts davon. Wer den Link öffnet, sieht das Design lokal in seinem eigenen
    Browser gerendert.
  </p>
  <p>
    <strong>Wichtig:</strong> Der Inhalt des Links (z. B. Texte im Design) ist für jeden lesbar, der den Link hat. Gib
    den Link nur an Personen weiter, die ihn sehen sollen, und schreib keine persönlichen Daten (Namen, Adressen,
    Kontaktdaten) in Texte, die du teilen willst. Wo du den Link veröffentlichst oder hinschickst, bestimmst du selbst.
  </p>

  <h2>6. Teilen von Dateien (System-Teilen-Menü / Download)</h2>
  <p>
    PNG-Bilder und Projektdateien kannst du über das Teilen-Menü deines Geräts (Web Share API) weitergeben oder
    herunterladen. Dabei entscheidest du, an welchen Dienst die Datei geht (z. B. Discord oder WhatsApp). Die Übertragung
    erfolgt durch diesen Dienst, nicht durch {{ APP_NAME }}; für diese Verarbeitung gelten die Datenschutzbestimmungen
    des gewählten Dienstes. Ich erhalte keine Kenntnis davon.
  </p>

  <h2>7. Keine Cookies, kein Tracking</h2>
  <p>
    Es werden keine Cookies gesetzt und keine Analyse-, Werbe- oder Social-Media-Dienste eingebunden. Deshalb gibt es
    auch kein Cookie-Banner.
  </p>

  <h2>8. Deine Rechte</h2>
  <p>
    Du hast nach der DSGVO das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung
    der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen, die auf
    berechtigten Interessen beruhen (Art. 21). Da ich selbst keine Daten über dich speichere, kann ich dir meist nur
    mitteilen, dass bei mir nichts vorliegt; die Logfiles liegen beim Hoster (siehe Abschnitt 3).
  </p>
  <p>
    Schreib bei Fragen einfach an <ContactEmail />. Außerdem hast du das Recht, dich bei einer
    Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), zum Beispiel bei der Behörde an deinem Wohnort oder an
    meinem Sitz. Für mich zuständig ist:
    <span :class="{ placeholder: SUPERVISORY_AUTHORITY.startsWith('[') }">{{ SUPERVISORY_AUTHORITY }}</span>.
  </p>

  <h2>9. Änderungen</h2>
  <p>
    Ich passe diese Erklärung an, wenn sich die App oder die Rechtslage ändert. Es gilt die jeweils hier abrufbare
    Fassung. Stand: {{ updated }}.
  </p>
</template>
