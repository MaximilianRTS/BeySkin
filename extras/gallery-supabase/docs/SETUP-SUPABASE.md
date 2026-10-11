# Community-Galerie einrichten (Supabase)

Die Galerie (Upload, Likes, Melden, Moderation) braucht ein eigenes Supabase-Projekt. Ohne die beiden Umgebungsvariablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` läuft die App weiterhin komplett offline (Editor + Export), die Galerie-Navigation wird ausgeblendet.

Alles, was die Migration anlegt, beginnt mit `sticker_` (Tabellen, Funktionen, Trigger) bzw. heißt `sticker-gallery` (Storage-Bucket). Sie lässt sich deshalb auch in ein bestehendes Supabase-Projekt einspielen, ohne vorhandene Tabellen wie `profiles` oder `reports` zu berühren.

## 1. Projekt anlegen

1. Auf <https://supabase.com> ein Konto erstellen und **New project** wählen.
2. **Region: Central EU (Frankfurt), `eu-central-1`.** Das ist wichtig für den Datenschutz (Daten bleiben in der EU).
3. Starkes Datenbank-Passwort vergeben und im Passwortmanager speichern (wird für die App nicht gebraucht).
4. Warten, bis das Projekt bereit ist.

## 2. Datenbank-Schema einspielen

Variante A (am einfachsten): Im Dashboard **SQL Editor → New query**, den kompletten Inhalt von `supabase/migrations/20261011000000_gallery.sql` einfügen und **Run** klicken.

Variante B (CLI):

```bash
npm i -g supabase            # oder: npx supabase ...
supabase login
supabase link --project-ref <PROJECT-REF>
supabase db push
```

Die Migration ist so geschrieben, dass sie bei Wiederholung nicht kaputtgeht. Sie legt an:

- Tabellen `sticker_profiles`, `sticker_designs`, `sticker_likes`, `sticker_reports`, `sticker_upload_log` inklusive Row Level Security
- Funktionen: `sticker_is_admin(uid)`, `sticker_report_design`, `sticker_increment_download`, `sticker_admin_set_status`, `sticker_admin_resolve_report`, die Storage-Prüfungen `sticker_storage_upload_ok` und `sticker_storage_claimed` sowie die zugehörigen Trigger (Profil bei Anmeldung, Like-Zähler, Upload-Limit von 10 pro 24 Stunden)
- Storage-Bucket `sticker-gallery` (öffentlich lesbar, maximal 8 MB pro Datei, nur `application/json` und `image/webp`)

### Hinweis zum öffentlichen Bucket

Der Bucket ist öffentlich, damit Vorschaubilder direkt und schnell ausgeliefert werden. Dadurch sind auch Dateien noch ungeprüfter (`pending`) oder ausgeblendeter Designs per URL abrufbar, **wenn jemand den kompletten Pfad kennt**. Pfade haben die Form `<user_id>/<design_id>/...`; die User-ID ist bei veröffentlichten Designs öffentlich, die Design-ID eines ungeprüften Designs ist eine zufällige UUID, die nur Ersteller und Admins kennen (Auflisten dürfen nur Besitzer und Admins). Der Ersteller selbst kann den Link aber weitergeben. Abgelehnte Designs werden von der App aus dem Speicher gelöscht. Das ist ein bewusster, akzeptierter Kompromiss. Wer das nicht möchte, braucht einen privaten Bucket mit signierten URLs (oder eine Edge Function, die freigegebene Dateien in einen öffentlichen Bucket kopiert).

Serverseitige Schutzmaßnahmen im Speicher:

- Hochladen nur in den eigenen Ordner, nur `project.json`/`thumb.webp`, kein Überschreiben (keine UPDATE-Policy).
- Sobald der Datensatz eines Designs existiert, kann der Ersteller in dessen Ordner **weder hochladen noch löschen**. Inhalte lassen sich also nach der Freigabe nicht austauschen. Löscht der Ersteller sein Design, wird zuerst der Datensatz entfernt, danach darf er die Dateien löschen.
- Höchstens 24 neue Dateien pro Nutzer und 24 Stunden, davon höchstens 4 ohne zugehöriges Design („Waisen“). Der Bucket taugt damit nicht als Gratis-Dateihoster.
- Beim Anlegen des Designs prüft die Datenbank, dass beide Dateien existieren, die Größen stimmen (Projekt ≤ 8 MB, Vorschau ≤ 300 KB) und der Dateityp zur Datei passt.

Verwaiste Dateien (z. B. nach abgebrochenen Uploads oder gelöschten Konten) findest du im SQL Editor mit der folgenden Abfrage und löschst sie dann über **Storage** im Dashboard (nicht per SQL, sonst bleiben die Dateien im Speicher liegen):

```sql
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'sticker-gallery'
  and not exists (
    select 1 from public.sticker_designs d
    where d.project_path = o.name or d.thumb_path = o.name
  )
order by o.created_at;
```

## 3. Anmeldung (Auth) konfigurieren

Unter **Authentication → URL Configuration**:

- **Site URL**: die öffentliche URL der App, z. B. `https://<benutzer>.github.io/BeyBattlePass/`
- **Redirect URLs** (alle eintragen, exakt so, inklusive abschließendem Schrägstrich):
  - `https://<benutzer>.github.io/BeyBattlePass/`
  - `http://localhost:5173/`

Die App nutzt den PKCE-Ablauf. Nach der Anmeldung kommt der Browser mit `?code=...` vor dem `#` zurück, das passt zum Hash-Router der App. Die Weiterleitung geht immer auf `origin + pathname` ohne Hash.

Unter **Authentication → Sign In / Providers**:

1. **Email** aktivieren (Magic Link, kein Passwort). Der Link muss im selben Browser geöffnet werden, in dem die Anmeldung gestartet wurde (PKCE).
   - Der eingebaute Mailversand von Supabase ist stark begrenzt (wenige Mails pro Stunde). Für den echten Betrieb unter **Authentication → SMTP Settings** einen eigenen SMTP-Dienst eintragen.
2. **Discord**: In <https://discord.com/developers/applications> eine Application anlegen, unter OAuth2 die Callback-URL aus dem Supabase-Dashboard (`https://<PROJECT-REF>.supabase.co/auth/v1/callback`) als Redirect eintragen, Client ID und Secret in Supabase einfügen.
3. **Google**: In der Google Cloud Console einen OAuth-Client (Typ Web) anlegen, dieselbe Callback-URL als autorisierten Redirect eintragen, Client ID und Secret in Supabase einfügen.
4. **Anonymous sign-ins** bleiben deaktiviert.
5. Empfohlen: Unter **Authentication → Attack Protection** CAPTCHA (hCaptcha oder Cloudflare Turnstile) aktivieren. Konten sind kostenlos; ohne CAPTCHA kann jemand viele Konten anlegen und damit Upload-Limits, Likes und das automatische Ausblenden (siehe Moderation) aushebeln. Achtung: Das erfordert zusätzlich eine kleine Anpassung im Anmeldedialog (`captchaToken`).

Datenschutz: Aus Discord/Google wird nur die E-Mail-Adresse für das Konto verwendet. Der öffentliche Anzeigename ist ein zufälliger Name (`user-xxxxxx`), den Nutzer unter „Meine Uploads“ ändern können. Der echte Name aus dem Anbieter-Profil wird bewusst nicht übernommen.

## 4. Dich selbst zum Admin machen

1. Einmal in der App anmelden (dadurch wird dein Profil angelegt).
2. Im Dashboard unter **Authentication → Users** deine User-ID (UUID) kopieren.
3. Im SQL Editor ausführen:

```sql
update public.sticker_profiles set is_admin = true where id = '<DEINE-USER-UUID>';
```

Danach erscheint in der App der Menüpunkt „Moderation“ (Prüfen, Meldungen, Ausgeblendet). Admin-Rechte lassen sich nur so (SQL Editor oder Service Role) vergeben, nicht über die API.

Die gesamte Admin-Prüfung steckt in der einen Funktion `public.sticker_is_admin(uid)`. Wenn du später ein bestehendes Rollensystem nutzen willst, musst du nur diese Funktion neu definieren.

## 5. Umgebungsvariablen setzen

Die Werte stehen unter **Project Settings → API** (Project URL und der `anon`/publishable Key). Der anon-Key ist für den Browser gedacht und darf öffentlich sein; **den `service_role`-Key niemals in die App oder ins Repository legen.**

Lokal: Datei `.env.local` im Projektordner (siehe `.env.example`):

```
VITE_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_CONTACT_EMAIL=kontakt@example.com
```

GitHub Pages: Im Repository unter **Settings → Secrets and variables → Actions → Variables** die drei Variablen `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` und `VITE_CONTACT_EMAIL` anlegen (als *Variables*, nicht als Secrets, weil sie in den öffentlichen Build einfließen). Danach den Deploy-Workflow neu starten.

`VITE_CONTACT_EMAIL` wird im Melden-Dialog, bei der Konto-Löschung und im Impressum angezeigt. Nutzer, die ihr Konto löschen lassen möchten, schreiben an diese Adresse. Zum Löschen in Supabase: **Authentication → Users → Delete user**. Profil, Designs, Likes werden dadurch automatisch mitgelöscht; die Dateien im Bucket `sticker-gallery` (Ordner mit der User-ID) bitte zusätzlich unter **Storage** löschen.

## 6. Grenzen des Free-Tiers und Kosten

- **1 GB Storage** und 500 MB Datenbank. Ein Design belegt typischerweise 100 KB bis 3 MB (eingebettete Bilder), die Vorschau unter 300 KB.
- **Pausierung nach 7 Tagen Inaktivität**: Projekte im Free-Tier werden nach einer Woche ohne Aufrufe pausiert. Die Galerie zeigt dann Fehler, bis du das Projekt im Dashboard mit **Restore** wieder startest. Ein kleiner regelmäßiger Aufruf (z. B. Cron-Workflow) kann das verhindern.
- **Spend Cap** (unter **Organization → Billing**) eingeschaltet lassen. Solange er aktiv ist, entstehen keine Kosten über das Free-Tier hinaus; bei Überschreitung wird der Dienst eingeschränkt statt abgerechnet.
- Missbrauchsbremsen sind eingebaut: maximal 10 Uploads pro Nutzer und 24 Stunden, Dateigrößen-Limits serverseitig, Meldungen mit Rate-Limit.

## 7. Moderation im Alltag

- **Prüfen**: Jedes neue Design startet als `pending` und ist nur für Ersteller und Admins sichtbar. Freigeben setzt es auf `published`, Ablehnen löscht die Dateien.
- **Meldungen**: Melden geht auch ohne Konto (Art. 16 DSA). Offene Meldungen siehst du mit Vorschau und kannst Designs ausblenden, die Meldung als erledigt markieren oder abweisen.
- **Automatisches Ausblenden**: Melden mindestens 3 verschiedene angemeldete Personen dasselbe Design, wird es automatisch ausgeblendet und taucht unter „Ausgeblendet“ auf. Bedenke, dass Konten kostenlos entstehen; die Schwelle ist ein Schutz, kein Beweis. Prüfe ausgeblendete Designs zeitnah.
- Erneutes Freigeben eines ausgeblendeten Designs weist dessen offene Meldungen ab.
- **Vorschau ist nicht gleich Inhalt**: Das Vorschaubild erzeugt der Browser des Erstellers. Ein manipulierter Client kann eine harmlose Vorschau zu einer Projektdatei mit anderen Bildern hochladen. Öffne vor dem Freigeben im Zweifel das Design im Editor (Detailseite → „Im Editor öffnen“), bis die Prüfansicht das Projekt selbst rendert.
- Anzeigenamen und Titel werden nicht vorab geprüft (nur Länge und unsichtbare Steuerzeichen). Unpassende Anzeigenamen änderst du im SQL Editor: `update public.sticker_profiles set display_name = 'user-geaendert' where id = '<UUID>';`
- Löscht ein Ersteller sein Design, werden die zugehörigen Meldungen mitgelöscht. Wenn du Meldungen als Nachweis brauchst, dokumentiere deine Entscheidungen zusätzlich außerhalb der Datenbank.
- Meldungen ohne Konto sind global auf 100 pro Stunde begrenzt (Schutz vor Spam). Ein Angreifer kann dieses Kontingent ausschöpfen; angemeldete Nutzer können dann weiterhin melden, und die Kontaktadresse im Melden-Dialog bleibt als Weg offen.

### Erwartete Hinweise im Security Advisor

Der Supabase Security Advisor meldet für einige Funktionen „Security definer function executable by anon/authenticated“. Das ist gewollt: `sticker_report_design` (Melden ohne Konto), `sticker_increment_download`, `sticker_is_admin` (wird in RLS-Policies auch für nicht angemeldete Besucher ausgewertet und antwortet nur für die eigene ID) sowie die Admin-Funktionen (prüfen selbst `sticker_is_admin`). Alle haben einen festen `search_path` und prüfen ihre Eingaben. Der Download-Zähler lässt sich durch wiederholte Aufrufe künstlich erhöhen; er ist nur eine Anzeige.
- Reagiere auf rechtliche Hinweise (Urheberrecht, Marken, personenbezogene Daten) zügig und dokumentiere deine Entscheidung. Zu klären bleibt außerdem, welche Rechtstexte (Impressum, Datenschutz, Nutzungsbedingungen) für deinen Betrieb gelten; das ersetzt keine Rechtsberatung.

## 8. Fehlersuche

| Problem | Ursache / Lösung |
| --- | --- |
| Galerie-Menü fehlt | `VITE_SUPABASE_*` nicht gesetzt oder nach Änderung nicht neu gebaut |
| Nach Login zurück auf der Startseite, aber nicht angemeldet | Die Redirect-URL ist nicht exakt in Supabase eingetragen (Schrägstrich am Ende prüfen) |
| Magic-Link funktioniert nicht | Link in einem anderen Browser/Gerät geöffnet, oder SMTP-Limit erreicht |
| Upload: „nicht erlaubt“ | Tageslimit erreicht oder Migration nicht vollständig ausgeführt |
| Alles lädt nicht | Free-Projekt pausiert, im Dashboard wiederherstellen |
