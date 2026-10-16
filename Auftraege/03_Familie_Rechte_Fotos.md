# Auftrag 03: Familie & Mithalter:innen mit Rechte-Stufen, Tierfoto

Arbeite in `C:\Users\user\Desktop\Projekt Petconnect\App`. **Auftrag 02 ist umgesetzt** (Commit „Auftrag 02: Ein Tier gemeinsam betreuen“). Baue darauf auf, statt neu anzufangen. Vorbild für Ablauf und Texte ist die Karte „Familie & Mithalter:innen“ im Prototyp `..\index.html` (Profil). Die App spricht aber in der **Sie-Form**.

Die **Datenbank wurde erweitert**; ändere sie nicht. Beschreibung: `..\Technik\supabase\migrations\20261016153000_familie_rechte_fotos.sql`.

## 0. Vorab: Was sich gegenüber Auftrag 02 ändert

- Kopiere `..\Technik\supabase\database.types.ts` nach `src/lib/database.types.ts`. Dann zeigt `tsc` dir alle Stellen, die angepasst werden müssen.
- **Einladung anlegen:** Nicht mehr `insert` in `pet_invites` (das ist jetzt gesperrt), sondern `rpc('create_pet_invite', { p_name, p_role, p_pet_ids })`.
- **`pet_invites` hat kein `pet_id` mehr:**
  - Neu sind `invitee_name` und `role`.
  - Welche Tiere dazugehören, steht in `pet_invite_pets`. Lesen per Einbettung: `select('id, invitee_name, role, expires_at, accepted_at, pet_invite_pets(pet_id)')`.
- **`invite_preview`** liefert jetzt **ein JSON-Objekt**, keine Tabelle. Dazu kommen die Felder `role`, `invitee_name`, `expires_at`, `pets[]` und der Status `empty`.
- **`accept_pet_invite`** liefert jetzt ein **Array** von `pet_id`s. Neuer Fehler: `invite_own`.
- **Neue Rolle `viewer`** („Nur ansehen“). Der Besitzer kann Rollen per `update` ändern.
- **Neu:** Fotos im Storage-Bucket `pet-photos`.
- **Bekannte Lücke aus Auftrag 02 schließen:** Beim Abmelden `pc-pending-invite` löschen.
- **Das Einladen** zieht von der Tier-Seite in die Karte „Familie & Mithalter:innen“ unter „Mehr“ (siehe 2A). Die Tier-Seite zeigt danach nur noch, mit wem das Tier geteilt ist, und den Link „Personen verwalten“ zur Karte.

## 1. Was die Datenbank kann

### Rollen in `pet_members (pet_id, user_id, role)`

| role | Anzeige | Darf |
|---|---|---|
| `owner` | Haupthalter:in | alles, einladen, Rechte ändern, Personen entfernen, Tier löschen |
| `carer` | Mithalter:in | Tierakte und Tagesplan ändern, abhaken, Erinnerungen schalten, Foto ändern. Kein Einladen, kein Löschen des Tieres. |
| `viewer` | Nur ansehen | alles sehen, nichts ändern |

- Der Besitzer wird beim Anlegen eines Tieres automatisch eingetragen.
- Lesen: alle Betreuer des Tieres.
- Rolle ändern (`update role` auf `carer` oder `viewer`): nur der Besitzer.
- Löschen einer Zeile: der Besitzer (Person entfernen) oder die Person selbst (Betreuung beenden). Die Besitzer-Zeile ist geschützt.
- Schreibrechte setzt die Datenbank durch. Die App soll für `viewer` trotzdem keine Bearbeiten-Knöpfe zeigen.

### Einladungen

- **Anlegen nur über RPC:** `rpc('create_pet_invite', { p_name, p_role, p_pet_ids })` liefert `[{ id, token, expires_at }]`.
  - Fehlertexte (`error.message`): `invite_name`, `invite_role`, `invite_no_pets`, `invite_not_owner`, `invite_duplicate` (gleicher Name schon offen eingeladen), `invite_max` (höchstens 5 weitere Personen inkl. offener Einladungen).
- **Tabellen:**
  - `pet_invites (id, invitee_name, role, token, expires_at, accepted_by, accepted_at, created_at)`: Lesen und Löschen (= zurückziehen) nur durch die einladende Person.
  - `pet_invite_pets (invite_id, pet_id)`: welche Tiere zur Einladung gehören.
- **Vorschau:** `rpc('invite_preview', { p_token })` liefert JSON `{ inviter_name, invitee_name, role, expires_at, pets: [{name, species, species_other}], status }` oder `null`.
  - `status`: `open`, `used`, `expired`, `member` (betreue schon alle Tiere) oder `empty` (Tiere wurden gelöscht).
- **Annehmen:** `rpc('accept_pet_invite', { p_token })` liefert ein Array von `pet_id`s.
  - Fehlertexte: `invite_not_found`, `invite_used`, `invite_expired`, `invite_own` (eigene Einladung), `not_authenticated`.

### Weitere Regeln

- **Profile:** Man sieht das eigene und die der Personen, mit denen man ein Tier teilt.
- **`routine_done.owner_id`** ist die Person, die abgehakt hat.

### Fotos

- Supabase Storage, privater Bucket `pet-photos`, höchstens 5 MB, Formate JPEG, PNG oder WebP.
- **Pfad muss** `${pet_id}/${dateiname}` sein.
- Ansehen dürfen alle Betreuer, hochladen und löschen Besitzer und Mithalter:innen.
- Der Pfad wird in `pets.photo_path` gespeichert. Anzeigen über `createSignedUrl(path, 3600)`.

## 2. Funktionen in der App

### A) „Mehr“ → Karte „Familie & Mithalter:innen“

- **Kopf:** Unterzeile „Teilen Sie Tierprofile mit Partner:in oder Familie. Alle Beteiligten sehen dieselbe Tierakte, denselben Tagesplan und dieselben Erinnerungen.“
- **Erste Zeile:** „Sie · Haupthalter:in“ mit Ihren Tieren.
- **Personen** (aus `pet_members` aller Tiere, bei denen ich Besitzer bin, gruppiert nach Person). Pro Zeile:
  - Name
  - Rechte-Stufe
  - Tiere, z. B. „Luna, Mio“
  - Status „Aktiv“
  - bei unterschiedlichen Rechten je Tier: „Luna: Mithalter:in · Mio: Nur ansehen“
- **Offene Einladungen** als eigene Zeilen: Name · Rechte-Stufe · Tiere · „Eingeladen, gültig bis {Datum}“. Knöpfe „Link teilen“ und „Zurückziehen“. Angenommene und abgelaufene Einladungen nicht zeigen.
- **Pro Person** (nur Besitzer):
  - **„Rechte ändern“**: Auswahl Mithalter:in oder Nur ansehen. Gilt für alle Tiere dieser Person bei mir.
  - **„Entfernen“** mit Rückfrage im Dialog: „{Name} wirklich entfernen? Die Person verliert sofort den Zugriff auf die geteilten Tiere.“ Löscht alle `pet_members`-Zeilen dieser Person bei meinen Tieren.
- **Formular „Person einladen“:**
  - Name (Pflicht)
  - Rechte als zwei Auswahlknöpfe mit Erklärung:
    - Mithalter:in: „Darf Tierakte und Tagesplan ändern und abhaken. Kann keine Tiere löschen und keine Personen verwalten.“
    - Nur ansehen: „Sieht Tierakte, Tagesplan und Notfallkontakt, kann aber nichts ändern.“
  - „Welche Tiere?“ als Kacheln mit `aria-pressed`, alle eigenen Tiere vorausgewählt.
  - Knopf „Einladung erstellen“.
  - Fehler am Feld bzw. als Meldung, mit den Texten aus dem Prototyp: Name fehlt, kein Tier, doppelt, höchstens 5 Personen.
- **Nach dem Erstellen:**
  - Den Link `${location.origin}/einladung/${token}` zeigen.
  - Knöpfe **„Link teilen“** (`navigator.share`, falls vorhanden; Text „{Ihr Name} lädt Sie zu PetConnect ein, um {Tiere} mitzubetreuen.“) und **„Link kopieren“** (Bestätigung „Link kopiert“).
  - Hinweis: „Der Link gilt 7 Tage und nur für eine Person. Schicken Sie ihn nur an Menschen, denen Sie vertrauen.“
- **Wenn ich Tiere anderer mitbetreue:** Abschnitt „Mit Ihnen geteilt“. Pro Zeile Tier, von wem und meine Stufe, etwa „Luna · von Ahmed · Mithalter:in“. Dazu ein Knopf „Betreuung beenden“ mit Rückfrage.
- Wer keine eigenen Tiere hat, sieht kein Einladungsformular.

### B) Einladung annehmen (`/einladung/:token`)

- **Ohne Anmeldung:**
  - Code in `localStorage` unter `pc-pending-invite` merken, dann zur Anmeldung.
  - Hinweis dort: „Melden Sie sich an oder registrieren Sie sich, um die Einladung anzunehmen.“
  - Nach jeder erfolgreichen Anmeldung, auch nach Registrierung und E-Mail-Bestätigung, prüft die App den Eintrag und geht zu `/einladung/:token`. Danach den Eintrag löschen.
- **Mit Anmeldung:** `invite_preview` aufrufen und anzeigen.
  - `open`: „{inviter_name} lädt Sie ein, {Tiere} mitzubetreuen.“ Darunter die Stufe mit ihrer Erklärung und das Ablaufdatum.
    - Knöpfe **„Annehmen“** und **„Ablehnen“**. Ablehnen ändert nichts, nur zurück zur Startseite.
  - `member`: „Sie betreuen {Tiere} bereits.“
  - `used`: „Diese Einladung wurde schon verwendet. Bitten Sie um einen neuen Link.“
  - `expired`: „Diese Einladung ist abgelaufen. Bitten Sie um einen neuen Link.“
  - `empty` oder `null`: „Dieser Einladungslink ist ungültig.“
- **Annehmen:**
  - Tierliste neu laden, das erste neue Tier aktiv setzen.
  - Zur Startseite mit Statusmeldung „Sie betreuen jetzt {Tiere} mit.“
  - Fehler mit Text, `invite_own`: „Das ist Ihre eigene Einladung.“
- Die Seite muss auch ohne eigene Tiere erreichbar sein. Die Weiterleitung zu „Ihr erstes Tier“ in `AppShell` darf hier nicht greifen.
- **Erstes Tier:** „Ihr erstes Tier“ bekommt zusätzlich den Hinweis „Sie haben eine Einladung bekommen? Öffnen Sie einfach den Link aus der Nachricht.“

### C) Tier-Seite (`/tier`)

- **Foto:** groß im Kopf; ohne Foto das Tierart-Symbol wie bisher.
  - Für Besitzer und Mithalter:innen die Knöpfe „Foto hinzufügen“ bzw. „Foto ändern“ und „Foto entfernen“. Dazu `<input type="file" accept="image/*">`, damit am Handy Kamera oder Galerie angeboten werden.
  - **Vor dem Hochladen im Browser verkleinern:** längste Seite höchstens 1200 px, JPEG mit Qualität 0,85, Querformat und Hochformat richtig (EXIF beachten, `createImageBitmap(file, { imageOrientation: 'from-image' })`).
  - Pfad `${pet.id}/${crypto.randomUUID()}.jpg`. Danach `photo_path` setzen und das alte Foto löschen.
  - Fehler, etwa zu groß oder falsches Format, verständlich melden.
  - **Alt-Text** des Fotos: „Foto von {Name}“.
- Darunter **„Geteilt mit: Kyra · Mithalter:in, Oma Erika · Nur ansehen“**, falls geteilt. Bei Mitbetreuenden zusätzlich: „Haupthalter:in: Ahmed · Ihre Rechte: …“.
- **„Tier löschen“** ganz unten, abgesetzt, nur für den Besitzer, mit Rückfrage im Dialog: „{Tier} und alle Einträge werden für alle Betreuer gelöscht. Das lässt sich nicht rückgängig machen.“ Vorher das Foto aus dem Speicher löschen.
- Für `viewer` keinen Knopf „Bearbeiten“.

### D) Fotos überall

Ein kleines rundes Foto, falls vorhanden, an diesen Stellen: Tier-Umschalter, „Als Nächstes“-Karte (neben dem Tiernamen) und Notfall-Seite. Signed URLs pro Tier zwischenspeichern, bis sie ablaufen.

### E) Gemeinsamer Alltag

- **Heute:** „erledigt von {Name}“, wenn jemand anderes abgehakt hat. `listDone` liefert dafür auch `owner_id`.
- **Aktualisieren:** Tagesplan und Häkchen neu laden, wenn das Fenster wieder in den Vordergrund kommt (`visibilitychange`), und jede Minute.
- **Für `viewer`:**
  - Häkchen und „Erledigt“-Knopf sind deaktiviert (`aria-disabled`) mit dem Hinweis „Nur ansehen: Abhaken ist für Sie nicht freigeschaltet.“
  - Im Alltag sind Schalter, Hinzufügen und Löschen ausgeblendet.
- **Alltag:** Unter „Alle Erinnerungen“ steht „Gilt für alle, die {Tier} betreuen.“, sobald mehr als eine Person das Tier betreut.
- **Tier-Umschalter:** Geteilte Tiere bekommen ein kleines Personen-Symbol, `aria-label` „gemeinsam betreut“.

## 3. Texte und Barrierefreiheit

- Alle neuen Texte in allen 11 Sprachen, Deutsch in der Sie-Form.
- Dialoge mit der vorhandenen `Dialog`-Komponente. Statusmeldungen über `role="status"`.
- Touch-Ziele mindestens 44 px. Bei 320 px Breite darf nichts seitlich scrollen.
- Den Einladungscode nie in der Konsole ausgeben.

## 4. Tests und Abschluss

- **Vitest:**
  - Einladungslink bauen.
  - Fehler-Zuordnung aller Codes.
  - Gruppierung der Personen.
  - „erledigt von“-Logik.
  - Rechte-Helfer `canEdit(role)`.
  - Bildgröße berechnen (längste Seite 1200 px).
- `npm run build` und `npm run test` müssen fehlerfrei laufen.
- `README.md`: Abschnitt „Familie & Mithalter:innen“ und „Tierfoto“ ergänzen.
- Committen mit der Nachricht „Auftrag 03: Rechte-Stufen, Familie-Karte, Tierfoto“. Nicht pushen.

Wenn du fertig bist, nenne mir:
1. die geänderten Dateien,
2. was getestet ist,
3. was bewusst noch fehlt.

Lass den Dev-Server auf Port 3000 laufen.
