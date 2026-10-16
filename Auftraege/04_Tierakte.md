# Auftrag 04: Tierakte – Gewicht, Impfungen, Dokumente

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–03 sind erledigt, Commit 75a4739 oder neuer).

## Ziel

Auf der Tierseite gibt es eine **Tierakte** mit drei Bereichen:

1. **Gewicht** – Verlauf der Messungen, neue Messung eintragen, ändern, löschen.
2. **Impfungen** – Liste der Impfungen mit „geimpft am“ und „gültig bis“, neue eintragen, ändern, löschen.
3. **Dokumente** – Befunde, Impfpass, Rechnungen usw. als PDF oder Foto hochladen, ansehen, umbenennen, löschen.

Vorbild für Aufbau, Reihenfolge und Wortlaut ist die Tierakte im Prototyp (`Projekt Petconnect\index.html`). Übernimm von dort Texte und Aufbau, aber **keine Demo-Daten**.

## Datenbank

Gewicht und Impfungen sind schon live. Für die Dokumente gibt es die neue Migration
`Technik\supabase\migrations\20261016200000_tierdokumente.sql` (Tabelle `pet_documents` + privater Bucket `pet-documents`).
**Sie ist live schon ausgeführt (16.10.2026). Du führst keine Migration aus** und änderst sie nicht. Lies sie, damit du die Regeln kennst.
Der DB-Test dafür liegt schon fertig in `Technik\tests\app\db_06_tierakte.sql` (32 Prüfungen) – nicht neu schreiben.

**`public.weights`**
| Spalte | Typ | Hinweis |
|---|---|---|
| id | uuid | automatisch |
| pet_id | uuid | Pflicht |
| owner_id | uuid | automatisch `auth.uid()` – nicht mitschicken |
| measured_on | date | Pflicht, Standard heute |
| kg | numeric | Pflicht, > 0 und < 2000 |
| created_at | timestamptz | automatisch |

**`public.vaccinations`**
| Spalte | Typ | Hinweis |
|---|---|---|
| id | uuid | automatisch |
| pet_id | uuid | Pflicht |
| owner_id | uuid | automatisch – nicht mitschicken |
| name | text | Pflicht, 1–80 Zeichen |
| given_on | date | optional |
| valid_until | date | optional |
| source | text | `'owner'` oder `'practice'`; die App legt nur `'owner'` an (Standard) |
| created_at | timestamptz | automatisch |

**Rechte (RLS, schon aktiv):**
- Lesen: alle Mitglieder des Tiers (owner, carer, viewer).
- Anlegen/Ändern/Löschen: nur owner und carer (`private.can_edit_pet`).
- Impfungen mit `source = 'practice'` darf niemand in der App ändern oder löschen.

**`public.pet_documents`** (neu)
| Spalte | Typ | Hinweis |
|---|---|---|
| id | uuid | automatisch |
| pet_id | uuid | Pflicht |
| owner_id | uuid | automatisch – nicht mitschicken |
| title | text | Pflicht, 1–120 Zeichen |
| category | text | `finding` (Befund), `vaccination` (Impfpass), `invoice` (Rechnung), `insurance` (Versicherung), `prescription` (Rezept), `other` (Sonstiges); Standard `other` |
| doc_date | date | optional (Datum des Dokuments) |
| storage_path | text | Pflicht, eindeutig, muss mit `<pet_id>/` beginnen |
| mime_type | text | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` |
| size_bytes | integer | > 0 und ≤ 10 MB (10485760) |
| created_at | timestamptz | automatisch |

Nachträglich änderbar sind nur `title`, `category`, `doc_date`. Rechte wie bei Gewicht: alle Mitglieder lesen, owner und carer schreiben.

**Bucket `pet-documents`** (privat, max. 10 MB, PDF/JPEG/PNG/WebP), Pfad `<pet_id>/<zufällige-uuid>.<endung>`. Lesen: Mitglieder; Hochladen/Löschen: owner und carer. **Kein Überschreiben** (`upsert: false`), jede Datei bekommt einen neuen Namen.

`database.types.ts` (v3) enthält `weights` und `vaccinations` schon. Ergänze `pet_documents` von Hand passend zur Migration (Row/Insert/Update) – in `App\src` und in `Technik\supabase\database.types.ts`.

## Oberfläche

### Allgemein
- Die Tierakte liegt auf der bestehenden Tierseite (`src/pages/Pet.tsx`) unter dem Profil, oder als eigener Abschnitt bzw. Reiter „Tierakte“. Nimm das, was zum jetzigen Aufbau passt, und mach die Seite nicht unübersichtlich.
- Die Rolle bestimmt, was sichtbar ist. **Nur ansehen (viewer):** keine Knöpfe für Hinzufügen/Ändern/Löschen, nur Lesen. Daneben ein kurzer Hinweis „Sie können die Tierakte ansehen, aber nicht ändern.“ Die Rolle kommt aus `pet_members` wie schon bei Auftrag 03.
- Alle Texte kommen über i18n (`src/i18n/de.ts` und die anderen vorhandenen Sprachen). Deutsch mit „Sie“.
- Datumsanzeige im deutschen Format (TT.MM.JJJJ), Gewicht mit Komma („12,4 kg“). Bei der Eingabe Komma **und** Punkt akzeptieren.
- WCAG 2.2 AA: echte `<label>` für jedes Feld, Fehlermeldungen mit `aria-describedby`, Fokus nach Speichern sinnvoll setzen, Lösch-Bestätigung per Dialog (kein `window.confirm`), Zielgrößen mindestens 24×24 px, Kontrast prüfen.

### Gewicht
- Liste, neueste Messung oben: Datum, kg, und die Veränderung zur vorherigen Messung („+0,3 kg“ / „−0,5 kg“).
- Ganz oben das **aktuelle Gewicht** groß.
- Ein **einfaches Verlaufsdiagramm** ab zwei Messungen (SVG, ohne neue schwere Bibliothek). Unter dem Diagramm dieselben Werte als Tabelle oder Liste, damit es auch ohne Diagramm verständlich ist (Screenreader).
- Formular „Gewicht eintragen“: Datum (Standard heute, nicht in der Zukunft), kg (Pflicht, > 0, < 2000, höchstens 2 Nachkommastellen).
- Ändern und Löschen pro Eintrag (nur owner und carer).
- Leerer Zustand: „Noch kein Gewicht eingetragen.“

### Impfungen
- Liste sortiert nach „gültig bis“ (nächste Fälligkeit oben; ohne Datum ans Ende).
- Status pro Impfung, **nicht nur über Farbe**, sondern mit Text:
  - „gültig“ (gültig bis liegt mehr als 30 Tage in der Zukunft),
  - „läuft bald ab“ (in 0–30 Tagen),
  - „abgelaufen“ (Datum vorbei),
  - kein Status, wenn „gültig bis“ fehlt.
- Einträge mit `source = 'practice'` bekommen den Hinweis „von der Praxis eingetragen“ und haben keine Knöpfe zum Ändern oder Löschen. (Solche Einträge gibt es noch nicht, aber die Anzeige soll stimmen.)
- Formular „Impfung eintragen“: Name (Pflicht, 1–80 Zeichen, mit Vorschlagsliste über `<datalist>`, z. B. Tollwut, Staupe, Parvovirose, Hepatitis, Leptospirose, Zwingerhusten, Katzenschnupfen, Katzenseuche, Leukose; eigene Eingabe erlaubt), geimpft am (optional, nicht in der Zukunft), gültig bis (optional, nicht vor „geimpft am“).
- **Keine** automatische Berechnung von „gültig bis“ und keine medizinischen Empfehlungen zu Impfabständen. Falls du einen Hinweistext brauchst: „Die Angaben stammen von Ihnen und sind noch nicht tierärztlich geprüft.“
- Leerer Zustand: „Noch keine Impfung eingetragen.“

### Dokumente
- Liste, neueste oben (nach `doc_date`, sonst `created_at`). Je Eintrag: Titel, Kategorie als Text, Datum, Dateityp und Größe („PDF, 240 KB“).
- Filter nach Kategorie (Auswahlfeld „Alle“ + die sechs Kategorien).
- **Hochladen:** Datei wählen (`accept="application/pdf,image/jpeg,image/png,image/webp"`, auf dem Handy auch Kamera möglich), Titel (vorbelegt mit dem Dateinamen ohne Endung), Kategorie, Datum (optional, nicht in der Zukunft). Vor dem Hochladen prüfen: Typ und Größe ≤ 10 MB, sonst verständliche Meldung. Fortschritt bzw. „Wird hochgeladen …“ anzeigen.
- Reihenfolge beim Hochladen: erst Datei in den Bucket, dann Zeile in `pet_documents`. Scheitert die Zeile, die hochgeladene Datei wieder löschen.
- **Ansehen:** über eine signierte URL (`createSignedUrl`, 60 Sekunden) in neuem Tab öffnen. Bilder zusätzlich als kleine Vorschau in der Liste (ebenfalls signierte URL). Niemals öffentliche URLs.
- **Umbenennen:** Titel, Kategorie, Datum ändern (nur owner und carer).
- **Löschen:** mit Dialog; erst Zeile löschen, dann Datei. Wenn das Löschen der Datei scheitert, trotzdem Erfolg melden (die Zeile ist weg) und den Fehler nur in die Konsole schreiben, ohne Pfad oder Token.
- Viewer sehen und öffnen alles, haben aber keine Knöpfe zum Hochladen, Ändern oder Löschen.
- Leerer Zustand: „Noch keine Dokumente abgelegt.“
- Hinweis unter dem Bereich: „Dokumente sind nur für Personen sichtbar, die dieses Tier mitbetreuen.“

### Gemeinsam betreuen
- Was owner oder carer einträgt, sehen alle Mitglieder des Tiers.
- Optional, wenn einfach machbar: „eingetragen von <Name>“ über `profiles.display_name` (owner_id). Wenn das Profil nicht lesbar ist, einfach weglassen, aber keinen Fehler anzeigen.

## Fehler
- Datenbankfehler verständlich auf Deutsch anzeigen, z. B. „Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.“ Bei RLS-Ablehnung (403/42501): „Dafür fehlen Ihnen die Rechte.“
- Prüfung auch im Formular (vor dem Senden), nicht nur über die Datenbank.

## Tests (Pflicht)

Lege die Tests in `Technik\tests\app\` ab, wie bei Auftrag 03.

1. **Unit-Tests** für die Hilfsfunktionen: kg-Eingabe parsen (Komma/Punkt, Grenzen), Veränderung zur Vormessung, Impfstatus (gültig / läuft bald ab / abgelaufen / ohne Datum, inkl. Grenzfälle 0 und 30 Tage), Sortierung.
2. **E2E `tierakte.e2e.ts`** mit `fake-supabase.ts`. Erweitere die Fake-Datenbank um `weights` und `vaccinations` mit denselben Rechten (viewer nur lesen, practice-Einträge unveränderbar). Mindestens:
   - owner trägt Gewicht ein → erscheint oben, Diagramm ab 2 Werten.
   - Gewicht ändern und löschen (mit Dialog).
   - Ungültige kg (0, 2000, Text, Zukunftsdatum) → Fehlermeldung, nichts gespeichert.
   - Impfung eintragen mit und ohne Daten; Status-Texte stimmen.
   - „gültig bis“ vor „geimpft am“ → Fehlermeldung.
   - carer darf eintragen; viewer sieht alles, aber keine Knöpfe.
   - practice-Eintrag hat keine Knöpfe und den Hinweis.
   - Leere Zustände.
   - Tastaturbedienung: Formular und Löschdialog ohne Maus bedienbar.
   - Dokumente (Fake um `pet_documents` und Bucket `pet-documents` erweitern; `luna.jpg` und `kein-bild.pdf` aus dem Testordner nutzen): PDF und Bild hochladen, erscheinen in der Liste; Datei > 10 MB und falscher Typ (z. B. .txt) abgelehnt, nichts gespeichert; Kategorie-Filter; umbenennen; löschen (Zeile und Datei weg); Öffnen ruft eine signierte URL auf; viewer sieht und öffnet, hat aber keine Knöpfe.
3. **DB-Test** `db_06_tierakte.sql` liegt schon bereit (Gewicht, Impfungen, Dokumente, 32 Prüfungen). Nur ausführen, falls du die lokale Test-DB hast; sonst überspringen und das im Bericht sagen.

Alle bisherigen Tests müssen weiter grün sein (Unit, `app.e2e.ts`, `familie.e2e.ts`).

## Abschluss

1. `npm run build` ohne Fehler, `npm run lint` sauber.
2. Alle Tests laufen lassen, Ergebnis zusammenfassen (Anzahl grün/rot).
3. Commit auf `main` mit einer klaren Nachricht, z. B. „Tierakte: Gewicht, Impfungen, Dokumente“, dann `git push`. Netlify baut danach automatisch, die App ist dann unter https://petconnect24.com aktualisiert.
4. `.env.local` **nicht** hinzufügen oder lesen.
5. Kurze Zusammenfassung: was gebaut wurde, welche Dateien neu bzw. geändert sind, offene Punkte.
