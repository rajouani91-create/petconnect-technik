# Auftrag 02: Ein Tier gemeinsam betreuen

Arbeite in `C:\Users\user\Desktop\Projekt Petconnect\App`. Die App aus Auftrag 01 läuft. Die **Datenbank ist schon fertig umgebaut**; ändere sie nicht. Beschreibung: `..\Technik\supabase\migrations\20261016150000_gemeinsam_betreuen.sql`.

**Ziel:** Der Besitzer eines Tieres lädt eine andere Person per Link ein. Nach dem Annehmen sehen beide dasselbe Tier, denselben Tagesplan und dieselben Häkchen.

## 0. Vorab

- Im Ordner gibt es noch nicht gespeicherte Änderungen (`src/auth/RequireAuth.tsx`, `src/i18n/de.ts`). Behalte sie und nimm sie in den Commit am Ende mit.
- Kopiere `..\Technik\supabase\database.types.ts` nach `src/lib/database.types.ts`. Neu darin: die Tabellen `pet_members` und `pet_invites` sowie die Funktionen `invite_preview` und `accept_pet_invite`.

## 1. Was die Datenbank jetzt kann

- `pet_members (pet_id, user_id, role)` mit `role` `owner` oder `carer`.
  - Der Besitzer wird beim Anlegen eines Tieres **automatisch** eingetragen; nichts selbst einfügen.
  - Lesen dürfen alle Betreuer des Tieres.
  - Löschen dürfen der Besitzer (Mitbetreuer entfernen) und ein Mitbetreuer (sich selbst entfernen).
  - Einfügen ist nicht erlaubt; das geht nur über `accept_pet_invite`.
- `pet_invites (id, pet_id, token, expires_at, accepted_by, accepted_at)`.
  - Nur der Besitzer darf anlegen, lesen und löschen.
  - `token` und `expires_at` (7 Tage) setzt die Datenbank.
  - Anlegen mit `insert({ pet_id }).select('token, expires_at').single()`.
- `rpc('invite_preview', { p_token })` liefert `{ pet_name, species, species_other, inviter_name, status }`.
  - `status` ist `open`, `used`, `expired` oder `member` (bin schon Betreuer).
  - Ist das Ergebnis leer, gibt es den Code nicht.
- `rpc('accept_pet_invite', { p_token })` liefert die `pet_id`.
  - Fehlertexte (`error.message`): `invite_not_found`, `invite_used`, `invite_expired`, `not_authenticated`.
  - Ist man schon Betreuer, kommt kein Fehler, nur die `pet_id`.
- `pets`, `routine_items`, `routine_done`, `weights` und `vaccinations` sind für **alle Betreuer** sichtbar und änderbar.
  - Ein Tier **löschen** darf nur der Besitzer.
  - `pets.owner_id` lässt sich nicht ändern.
- `profiles`: Man sieht das eigene Profil und die Profile der Personen, mit denen man ein Tier teilt (für Namen wie „erledigt von Kyra“).
- `routine_done.owner_id` ist die Person, die abgehakt hat.

## 2. Funktionen in der App

### A) Tier-Seite (`/tier`): Abschnitt „Betreuung“

- **Liste der Betreuer:** Anzeigename und Rolle („Besitzer“ oder „Mitbetreuer“). Die eigene Zeile ist mit „(Sie)“ markiert.
- **Nur für den Besitzer:**
  - **„Person einladen“** erzeugt eine Einladung und zeigt den Link `${window.location.origin}/einladung/${token}`.
    - Knopf **„Link teilen“**: `navigator.share`, falls vorhanden.
    - Knopf **„Link kopieren“**: `navigator.clipboard.writeText`, danach Bestätigung „Link kopiert“.
    - Hinweis darunter: „Der Link gilt 7 Tage und nur für eine Person. Schicken Sie ihn nur an Menschen, denen Sie vertrauen.“
  - Liste **offener Einladungen** mit Ablaufdatum und Knopf „Zurückziehen“ (löscht die Einladung). Angenommene und abgelaufene nicht anzeigen.
  - Bei jedem Mitbetreuer ein Knopf **„Entfernen“** mit Rückfrage im Dialog: „{Name} kann {Tier} danach nicht mehr sehen.“
  - **„Tier löschen“** ganz unten, abgesetzt, mit Rückfrage im Dialog: „{Tier} und alle Einträge werden für alle Betreuer gelöscht. Das lässt sich nicht rückgängig machen.“ Danach zur Startseite; ohne Tiere landet man wie bisher bei „Ihr erstes Tier“.
- **Nur für Mitbetreuer:** Knopf **„Betreuung beenden“** mit Rückfrage im Dialog. Danach verschwindet das Tier aus der App.
- Bearbeiten der Stammdaten dürfen alle Betreuer, wie bisher.

### B) Einladung annehmen (`/einladung/:token`)

- **Ohne Anmeldung:** Den Code in `localStorage` unter `pc-pending-invite` merken, dann zur Anmeldung. Der Hinweis dort lautet: „Melden Sie sich an oder registrieren Sie sich, um die Einladung anzunehmen.“
  - Nach erfolgreicher Anmeldung, auch nach Registrierung und E-Mail-Bestätigung, prüft die App `pc-pending-invite` und geht automatisch zu `/einladung/:token`.
  - Danach den Eintrag löschen.
- **Mit Anmeldung:** `invite_preview` aufrufen und anzeigen.
  - `open`: „{inviter_name} lädt Sie ein, {pet_name} ({Tierart}) gemeinsam zu betreuen.“ Darunter die Knöpfe **„Annehmen“** und **„Ablehnen“**. Ablehnen führt nur zur Startseite und ändert nichts.
  - `member`: „Sie betreuen {pet_name} bereits.“ Dazu ein Knopf zur Startseite.
  - `used`: „Diese Einladung wurde schon verwendet. Bitten Sie um einen neuen Link.“
  - `expired`: „Diese Einladung ist abgelaufen. Bitten Sie um einen neuen Link.“
  - Leer: „Dieser Einladungslink ist ungültig.“
- **Annehmen:**
  - `accept_pet_invite` aufrufen.
  - Tierliste neu laden und das neue Tier aktiv setzen.
  - Zur Startseite, Statusmeldung „Sie betreuen jetzt {pet_name} mit.“
  - Fehler mit den Texten von oben.
- Diese Seite muss auch erreichbar sein, wenn man noch kein Tier hat. Die Weiterleitung zu „Ihr erstes Tier“ in `AppShell` darf hier nicht greifen.

### C) Gemeinsamer Alltag

- **Heute:** Hat jemand anderes einen Eintrag abgehakt, zeige „erledigt von {Name}“ statt nur „erledigt“. `listDone` liefert dafür auch `owner_id`. Die Namen kommen aus `profiles`; einmal pro Tier laden genügt.
- **Aktualisieren:** Lade Tagesplan und Häkchen neu, wenn das Fenster wieder in den Vordergrund kommt (`visibilitychange` oder `focus`) und zusätzlich jede Minute, solange die Seite offen ist. Realtime brauchen wir noch nicht.
- **Alltag:** Unter dem Schalter „Alle Erinnerungen“ steht der Hinweis „Gilt für alle, die {Tier} betreuen.“, aber nur, wenn das Tier mehr als einen Betreuer hat.
- **Tier-Umschalter:** Geteilte Tiere bekommen ein kleines Personen-Symbol mit `aria-label` „gemeinsam betreut“.

## 3. Texte und Barrierefreiheit

- Alle neuen Texte in allen 11 Sprachen, Deutsch in der Sie-Form.
- Dialoge mit der vorhandenen `Dialog`-Komponente.
- Statusmeldungen über `role="status"`.
- Touch-Ziele mindestens 44 px. Bei 320 px Breite darf nichts seitlich scrollen.
- Den Einladungscode nie in der Konsole ausgeben.

## 4. Tests und Abschluss

- **Vitest:**
  - Einladungslink bauen.
  - Fehler-Zuordnung (`invite_used` → Text).
  - Logik „erledigt von“ (eigene Person ergibt kein „von“).
- `npm run build` und `npm run test` müssen fehlerfrei laufen.
- `README.md`: Einen Abschnitt „Gemeinsam betreuen“ ergänzen.
- Am Ende committen mit der Nachricht „Auftrag 02: Ein Tier gemeinsam betreuen“. Nicht pushen.

Wenn du fertig bist, nenne mir:
1. die geänderten Dateien,
2. was getestet ist,
3. was bewusst noch fehlt.

Lass den Dev-Server auf Port 3000 laufen.
