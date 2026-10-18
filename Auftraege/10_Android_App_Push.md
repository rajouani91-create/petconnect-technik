# Auftrag 10: Android-App (PWA) und Push-Benachrichtigungen

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–09 erledigt).

## Ziel

1. Die App wird eine **vollwertige, installierbare PWA**, die sich später unverändert als **Android-App im Play Store** (Trusted Web Activity, TWA) verpacken lässt.
2. **Push-Benachrichtigungen** auf dem Handy: Medikamente (zur Uhrzeit der Gabe), Erinnerungen (am Fälligkeitstag, Standard 09:00) und Termine (60 Minuten vorher).

Das Verpacken für den Play Store (PWABuilder/Bubblewrap, Play Console) ist **nicht** Teil dieses Auftrags – das macht Ahmed danach selbst. Dieser Auftrag sorgt dafür, dass alle Voraussetzungen erfüllt sind.

## Backend – schon fertig, nichts ändern

- Migration `Technik\supabase\migrations\20261018100000_push.sql` (live), DB-Test `Technik\tests\app\db_12_push.sql` (19 Prüfungen, grün). **Keine Migration ausführen.**
- Edge Function `push-senden` ist auf Supabase deployt (Quelltext liegt in `Technik\supabase\functions\push-senden\`). Sie wird jede Minute von der Datenbank angestoßen, erzeugt die VAPID-Schlüssel beim ersten Lauf selbst und verschickt die Nachrichten. **Nichts daran ändern, nicht neu deployen.**
- Kein geheimer Schlüssel gehört in die App oder in `.env*`. Die App braucht nur den **öffentlichen** VAPID-Schlüssel und holt ihn zur Laufzeit per RPC.

Für die App relevant:

| Objekt | Nutzung |
|---|---|
| RPC `vapid_public_key()` → `text` | öffentlicher Schlüssel (base64url) für `pushManager.subscribe({ applicationServerKey })`. Kann beim allerersten Aufruf noch `null` sein (dann eine Minute später erneut versuchen, Hinweis „Benachrichtigungen werden eingerichtet – bitte gleich noch einmal versuchen.“) |
| RPC `register_push(p_endpoint, p_p256dh, p_auth, p_label)` → `uuid` | Gerät anmelden (oder einem neuen Konto zuordnen). `p_label`: z. B. „Android · Chrome“ aus dem User-Agent, ≤ 80 Zeichen |
| Tabelle `push_subscriptions` | eigene Geräte lesen (`id, endpoint, device_label, created_at, last_ok_at`) und löschen (= Gerät abmelden) |
| Tabelle `notification_prefs` | je Person: `medication`, `reminders`, `appointments` (bool, Standard an), `reminder_time` (Standard 09:00). Zeile fehlt = alles an → beim ersten Speichern `insert`, danach `update` |

Nachricht, die beim Gerät ankommt (JSON, verschlüsselt): `{ "title": "Luna: Meloxicam", "body": "Medikament: 08:00 Uhr · 0,5 ml · mit Futter. Gegeben? In PetConnect abhaken.", "url": "/erinnerungen", "tag": "medication-…" }`. Texte kommen fertig in der Sprache aus `profiles.language`.

`database.types.ts` von Hand ergänzen (App und Technik).

## 1. PWA vervollständigen

- **Icons als PNG** (Play Store und Android verlangen PNG): aus `public/icon.svg` und `public/icon-maskable.svg` die Größen 192 und 512 (je `any` und `maskable`) sowie `apple-touch-icon` 180 erzeugen und in `public/icons/` ablegen. Einmalig per Skript (z. B. `sharp` als **devDependency** oder Playwright-Screenshot), PNGs ins Repo committen. SVG-Einträge im Manifest dürfen bleiben.
- **Manifest** `public/manifest.webmanifest` ergänzen: `id: "/"`, PNG-Icons, `categories: ["health","lifestyle"]`, `orientation: "portrait"`, `description` (Sie-Form, passt zur App: Gesundheit, Medikamente, Termine, Notfallkarte), `shortcuts` (Heute, Erinnerungen, Notfall), 2–4 `screenshots` (Handy-Format, aus der App mit Beispieltier ohne echte Daten, z. B. per Playwright; `form_factor: "narrow"`).
- `index.html`: `<link rel="manifest">`, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-capable`.
- **Service Worker** `public/sw.js` (ohne Bibliothek, einfach halten):
  - `install`/`activate` mit `skipWaiting`/`clients.claim`.
  - Offline-Fallback: App-Shell (`/`, `/index.html`, gebaute Assets aus dem Vite-Manifest oder per Laufzeit-Cache „stale-while-revalidate“ für `/assets/*`). **Keine** Supabase-Antworten cachen (`*.supabase.co` immer Netz).
  - `push`: Nachricht anzeigen mit `title`, `body`, `tag`, `icon` (192er PNG), `badge` (einfarbiges 96er PNG), `data.url`, `renotify: true`. Leere/kaputte Nachricht → neutrale Meldung „PetConnect – Neue Benachrichtigung“.
  - `notificationclick`: vorhandenes Fenster fokussieren und zu `data.url` navigieren, sonst `clients.openWindow(data.url)`. Nur gleiche Origin zulassen.
  - Registrierung in `main.tsx` nur im Produktions-Build (`import.meta.env.PROD`), Updates: bei neuer Version Hinweis „Neue Version verfügbar – Neu laden“ (Knopf).
- Netlify: `sw.js` ohne Cache ausliefern (`Cache-Control: no-cache` per `public/_headers`); `/.well-known/assetlinks.json` muss als Datei durchkommen (nicht von `/* /index.html 200` überdeckt) und `Content-Type: application/json` haben.
- `public/.well-known/assetlinks.json` **als Vorlage** anlegen mit `package_name: "com.petconnect24.app"` und Platzhalter-Fingerabdruck `"BITTE_SHA256_AUS_PLAY_CONSOLE_EINTRAGEN"`. In `Technik\Android\LIESMICH.md` beschreiben, wo der Wert herkommt (Play Console → App-Integrität → App-Signatur → SHA-256).

## 2. Seite „Benachrichtigungen“

Unter **Mehr → Benachrichtigungen** (`/mehr/benachrichtigungen`):

- **Status dieses Geräts** in Worten: „Auf diesem Gerät aktiv“, „Noch nicht aktiviert“, „Im Browser blockiert – bitte in den Einstellungen des Handys erlauben“ (mit kurzer Anleitung für Android/Chrome), „Dieser Browser unterstützt keine Benachrichtigungen“.
- **iPhone/iPad:** Push geht nur, wenn die App über „Zum Home-Bildschirm“ hinzugefügt wurde (iOS 16.4+). Erkennen (`navigator.standalone`/`display-mode`) und sonst genau das erklären statt eines Fehlers.
- Knopf **„Benachrichtigungen auf diesem Gerät aktivieren“**: erst nach Klick `Notification.requestPermission()` (nie automatisch beim Start), dann `vapid_public_key` → `subscribe` → `register_push`. Erfolg: Toast „Benachrichtigungen sind aktiv.“
- Knopf **„Auf diesem Gerät ausschalten“**: `subscription.unsubscribe()` + Zeile löschen.
- **Was soll PetConnect melden?** Schalter (`role="switch"`): Medikamente · Erinnerungen · Termine (1 Stunde vorher); Uhrzeit für Erinnerungen (Zeitfeld, Standard 09:00). Speichern sofort, `aria-live` „Gespeichert“.
- **Meine Geräte**: Liste mit Bezeichnung, „angemeldet am“, „zuletzt erreicht am“, Knopf „Entfernen“. Das aktuelle Gerät markieren („dieses Gerät“).
- **„Testnachricht anzeigen“**: zeigt lokal über den Service Worker eine Beispiel-Benachrichtigung (`registration.showNotification`), damit man sieht, wie es aussieht. Kein Serveraufruf.
- Hinweistext: „Benachrichtigungen enthalten Tiername, Medikament und Uhrzeit. Sie werden verschlüsselt übertragen. Auf dem Sperrbildschirm sind sie je nach Handy-Einstellung sichtbar.“
- Nur für die eigene Person; viewer bekommen ohnehin keine Medikamenten-/Termin-Pushs (das regelt die Datenbank). Auf der Seite für viewer kein Sonderfall nötig.

Zusätzlich: Auf der Seite **Erinnerungen** und nach dem **ersten gespeicherten Medikament** ein dezenter Hinweis „Möchten Sie zur Uhrzeit erinnert werden? Benachrichtigungen aktivieren“ (Link zur Seite), nur solange auf diesem Gerät noch nicht aktiviert; „Nicht mehr anzeigen“ merkt sich das im `localStorage` (try/catch).

## 3. Datenschutz und Impressum (Pflicht für den Play Store)

- Öffentliche Seiten **`/datenschutz`** und **`/impressum`** (ohne Anmeldung erreichbar, im Fuß der Anmeldeseite und unter „Mehr“ verlinkt).
- **Keine Rechtstexte erfinden.** Struktur mit Überschriften anlegen und dort, wo Angaben von Ahmed nötig sind, gut sichtbar `[BITTE ERGÄNZEN: …]` einsetzen (Name, Anschrift, E-Mail, ggf. Verantwortliche Stelle). Bereits feststehende Fakten dürfen rein: Hosting Netlify, Datenbank/Anmeldung Supabase (Region aus dem Projekt), Push über den Push-Dienst des Browsers (bei Android: Google Firebase Cloud Messaging), Kartendaten © OpenStreetMap-Mitwirkende (ODbL), keine Werbung, kein Tracking, Konto-Löschung auf Anfrage.
- In `Technik\Android\LIESMICH.md` vermerken: Diese Seiten müssen vor der Einreichung im Play Store vollständig ausgefüllt und geprüft sein.

## 4. Konto löschen (Play-Store-Pflicht)

Google verlangt, dass Nutzer:innen ihr Konto in der App löschen **anfragen** können. Unter Mehr → Konto: Knopf „Konto löschen“ mit Bestätigungsdialog, der eine `mailto:`-Anfrage an die im Impressum stehende Adresse vorbereitet (Platzhalter, solange nicht ausgefüllt) und erklärt, was gelöscht wird. **Keine** automatische Löschung bauen (kommt später serverseitig).

## Tests (Pflicht)

1. **Unit**: base64url → `Uint8Array` für `applicationServerKey`, Gerätebezeichnung aus User-Agent, Status-Ermittlung (unterstützt/blockiert/aktiv/iOS ohne Home-Bildschirm), Prefs-Speichern (insert vs. update).
2. **E2E `benachrichtigungen.e2e.ts`** (Chromium, `context.grantPermissions(['notifications'])`, Fake-Supabase um die RPCs und Tabellen ergänzen; `pushManager.subscribe` im Test durch einen Stub ersetzen, da ohne echten Push-Dienst):
   - Aktivieren → `register_push` mit Endpoint/Keys aufgerufen, Status „aktiv“, Gerät in der Liste.
   - Ausschalten → Gerät weg.
   - Berechtigung verweigert → Hinweistext statt Fehler.
   - Schalter und Uhrzeit speichern (insert, danach update).
   - Testnachricht ruft `showNotification` auf.
   - Hinweis auf der Erinnerungsseite erscheint nur ohne aktives Gerät und verschwindet mit „Nicht mehr anzeigen“.
   - `/datenschutz` und `/impressum` ohne Anmeldung erreichbar.
3. **Service Worker**: Test, der `push`- und `notificationclick`-Handler mit einer Beispielnachricht auslöst (Playwright: SW-Registrierung im Preview-Build `npm run build && npm run preview`), Benachrichtigung hat Titel/Body/Tag; Klick öffnet `/erinnerungen`.
4. **Lighthouse/PWA-Prüfung** im Preview-Build (z. B. `npx lighthouse --only-categories=pwa,accessibility` oder Playwright-Check): Manifest gültig, Icons 192/512 vorhanden, SW registriert, `start_url` offline erreichbar. Ergebnis im Bericht.
5. `db_12_push.sql` nur ausführen, wenn lokale Test-DB vorhanden (braucht Shims für `net`/`cron`, siehe `tests\app\db_00_push_shim.sql`).

Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber.
2. Alle Tests, Ergebnis zusammenfassen.
3. Commit in `App` („PWA und Push-Benachrichtigungen“) + `git push`.
4. Test-Änderungen und `Technik\Android\LIESMICH.md` in `Technik` committen und pushen.
5. `.env.local` nicht lesen oder hinzufügen. Nichts löschen, was nicht zum Auftrag gehört. Keine temporären Dateien außerhalb des Projekts verschieben oder löschen.
6. Kurze Zusammenfassung mit offenen Punkten – insbesondere, was Ahmed für den Play Store noch selbst tun muss.
