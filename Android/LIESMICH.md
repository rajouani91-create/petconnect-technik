# PetConnect als Android-App (Play Store)

Die App ist eine installierbare PWA (Auftrag 10). Für den Play Store wird sie als **Trusted Web Activity (TWA)** verpackt – die App im Store zeigt dann die Webseite im Vollbild, ohne Adressleiste. Code muss dafür nicht geändert werden.

## Was schon fertig ist

- Manifest `App/public/manifest.webmanifest`: `id`, Name, Beschreibung, `display: standalone`, Hochformat, Kategorien, Shortcuts (Heute, Erinnerungen, Notfall), 4 Screenshots im Handy-Format.
- Icons als PNG in `App/public/icons/` (192/512, „any“ und „maskable“, `apple-touch-icon` 180, Statusleisten-Symbol `badge-96`).
  Neu erzeugen, falls sich das Logo ändert: `npx playwright test -c tests/app/assets.config.ts` (im Ordner `Technik`). Das erzeugt auch die Screenshots neu (Beispieltier „Luna“, keine echten Daten).
- Service Worker `App/public/sw.js`: Offline-Start, Push-Benachrichtigungen, Klick öffnet die passende Seite.
- `App/public/_headers`: `sw.js` ohne Cache, `assetlinks.json` als JSON.
- Vorlage `App/public/.well-known/assetlinks.json` mit Paketname `com.petconnect24.app`.
- Seiten `/datenschutz` und `/impressum` (öffentlich), „Konto löschen“ unter Mehr → Konto.

## Was Ahmed vor der Einreichung selbst tun muss

1. **Impressum und Datenschutz ausfüllen und prüfen lassen.**
   - Angaben stehen in `App/src/lib/legal.ts` (`LEGAL`: Name, Anschrift, E-Mail, Telefon). Solange ein Wert fehlt, zeigen die Seiten gut sichtbar „[BITTE ERGÄNZEN: …]“.
   - Die übrigen Platzhalter stehen direkt in `App/src/pages/Legal.tsx` (Zwecke und Rechtsgrundlagen, Auftragsverarbeitung, Rechte, ggf. Registerangaben).
   - **Diese Seiten müssen vor der Einreichung im Play Store vollständig ausgefüllt und rechtlich geprüft sein.** Die Datenschutz-URL (`https://<Ihre-Domain>/datenschutz`) wird in der Play Console verlangt.
   - Die E-Mail-Adresse aus `LEGAL.email` wird auch für „Konto löschen“ verwendet. In der Play Console unter „Datensicherheit“ zusätzlich eine Webadresse für die Kontolöschung angeben (z. B. `/datenschutz`, Abschnitt „Konto löschen“).
2. **App verpacken** mit [PWABuilder](https://www.pwabuilder.com) (Android → „Google Play“) oder Bubblewrap (`npx @bubblewrap/cli init --manifest https://<Ihre-Domain>/manifest.webmanifest`).
   - Paketname: `com.petconnect24.app` (muss zu `assetlinks.json` passen).
   - Schlüssel (Keystore) sicher aufbewahren – **nicht** ins Repository.
3. **Digital Asset Links eintragen** – sonst zeigt die App eine Adressleiste:
   - Play Console → Ihre App → **Testen und veröffentlichen → App-Integrität → App-Signatur** → Abschnitt „Zertifikat des App-Signaturschlüssels“ → **SHA-256-Fingerabdruck** kopieren.
   - In `App/public/.well-known/assetlinks.json` den Platzhalter `BITTE_SHA256_AUS_PLAY_CONSOLE_EINTRAGEN` durch diesen Wert ersetzen (Format `AB:CD:…`). Wer zusätzlich mit dem eigenen Upload-Schlüssel testet, trägt dessen SHA-256 als zweiten Eintrag in die Liste ein.
   - Committen, auf Netlify veröffentlichen und prüfen: `https://<Ihre-Domain>/.well-known/assetlinks.json` muss die Datei als JSON liefern.
4. **Store-Eintrag**: Screenshots aus `App/public/screenshots/` verwenden (1080 × 2400) oder eigene machen; Kategorie „Gesundheit & Fitness“ bzw. „Lifestyle“; Fragebogen „Datensicherheit“ ausfüllen (Konto, Tierdaten, Gerätekennung für Push; keine Werbung, kein Tracking).
5. **Push auf echtem Handy prüfen**: App installieren → Mehr → Benachrichtigungen → aktivieren → „Testnachricht anzeigen“. Echte Nachrichten verschickt die Edge Function `push-senden` (jede Minute über die Datenbank).

## Hinweise

- Benachrichtigungen auf Android laufen über Google Firebase Cloud Messaging (Push-Dienst von Chrome). Das steht so auch in der Datenschutzerklärung.
- iPhone/iPad: Push nur, wenn die Seite über „Zum Home-Bildschirm“ hinzugefügt wurde (iOS 16.4+). Ein App-Store-Paket ist nicht Teil dieses Auftrags.
- Lighthouse hat die Kategorie „PWA“ seit Version 12 entfernt. Die PWA-Prüfung läuft deshalb als Playwright-Test gegen den Produktions-Build: `npx playwright test -c tests/app/pwa.config.ts` (Manifest, Icons, Service Worker, offline, Push und Klick).
