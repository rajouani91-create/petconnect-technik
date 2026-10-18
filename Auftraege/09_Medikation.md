# Auftrag 09: Medikation mit Dosierung, Uhrzeiten und „Gabe abhaken“

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–08b erledigt). Falls Auftrag 08b noch nicht fertig ist: erst 08b abschließen.

## Ziel

Halter:innen und Mithalter:innen tragen die Medikamente ihres Tiers **strukturiert** ein: Präparat, Menge pro Gabe, Einheit, wie oft und zu welchen Uhrzeiten, Hinweis zur Gabe, Zeitraum. Jede geplante Gabe lässt sich **abhaken** – mit Person und Uhrzeit („gegeben von Kyra um 08:05“), damit in einer Familie niemand doppelt gibt.

Die laufenden Medikamente erscheinen automatisch auf **Notfallkarte**, **öffentlicher Sitter-Seite** und in der **Gesundheitsakte (PDF)**.

Vorbild für Aufbau und Wortlaut: Prototyp `Projekt Petconnect\index.html`, **Etappe 21** (Schlüssel `om…`, `u_…`, `md…`) – in der App immer „Sie“.

**Wichtig – Sicherheit:** Die App **berechnet, prüft oder empfiehlt keine Dosierungen** (kein Umrechnen nach Gewicht, keine Vorschläge, keine Warnungen „zu viel/zu wenig“). Sie speichert nur, was die Praxis verordnet hat.

## Datenbank – schon live, nichts ändern

Migration `Technik\supabase\migrations\20261017200000_medikation.sql` ist ausgeführt. **Keine Migration ausführen.** DB-Test: `Technik\tests\app\db_11_medikation.sql` (36 Prüfungen, grün).

**`pet_medications`**
| Spalte | Hinweis |
|---|---|
| pet_id | Tier |
| owner_id | wer angelegt hat (automatisch `auth.uid()`) |
| source | `owner` (Halter:in) oder `practice` (später von Praxen). Halter:innen können **nur** `owner` anlegen; Einträge mit `practice` sind für sie **nicht änderbar und nicht löschbar** |
| name | Präparat, 1–80 Zeichen, Pflicht |
| amount | Menge pro Gabe, `numeric(7,2)`, > 0 und ≤ 1000, Pflicht |
| unit | `tablet`, `capsule`, `ml`, `drop`, `pipette`, `puff`, `sachet`, `g`, `mg`, `application` |
| frequency | `daily` oder `as_needed` (bei Bedarf) |
| times | `time[]` – bei `daily` 1–4 verschiedene Uhrzeiten, bei `as_needed` leer |
| intake_hint | `none`, `with_food` (mit Futter), `empty_stomach` (nüchtern) |
| note | weitere Hinweise, ≤ 200 |
| reason | Grund, ≤ 200 |
| prescribed_by | verordnet von (Freitext), ≤ 120 |
| starts_on | Beginn (Standard heute) |
| ends_on | Ende, leer = Dauermedikation, ≥ Beginn |
| stopped_on | vorzeitig beendet am (letzter Tag der Gabe) |
| remind | Uhrzeiten als Erinnerung zeigen (Standard `true`) |
| created_at, updated_at | automatisch |

Änderbar per `update`: alle fachlichen Spalten, **nicht** `pet_id`, `owner_id`, `source`.

**`medication_doses`** (abgehakte Gaben)
| Spalte | Hinweis |
|---|---|
| medication_id + pet_id | müssen zusammenpassen |
| scheduled_on, scheduled_time | geplante Gabe (Tag + eine der `times`) |
| given_at | Zeitpunkt des Abhakens (automatisch) |
| given_by | Person (automatisch `auth.uid()`; fremde ID wird abgelehnt) |

Regeln in der DB: jede geplante Gabe höchstens einmal (eindeutig je Medikament, Tag, Uhrzeit); nur Uhrzeiten aus `times`; nicht in der Zukunft und höchstens 7 Tage rückwirkend; nur im Zeitraum der Medikation. Zurücknehmen = Zeile löschen. Fehlercodes: `dose_time_not_planned`, `dose_day_out_of_range`, `dose_outside_period` (Code 23514), Doppelt = Unique-Verletzung 23505.

Name „gegeben von“: über `profiles.display_name` (Mitglieder desselben Tiers sind lesbar).

**RPC `sitter_view`** liefert zusätzlich `active_medications`: Liste mit `name`, `amount`, `unit`, `frequency`, `times` (`["08:00","19:30"]`), `intake_hint`, `note`, `ends_on` – alle Medikamente, die im Zeitraum des Sitter-Zugangs (ab heute) laufen.

Rechte: alle Mitglieder lesen; owner und carer anlegen/ändern/löschen/abhaken; viewer nur lesen.

Das alte Freitextfeld `pets.medications` **bleibt** und heißt in der Oberfläche künftig „Weitere Hinweise zur Medikation“.

`database.types.ts` von Hand ergänzen (App und Technik). `times` kommt als `string[]` im Format `"HH:MM:SS"` – beim Anzeigen auf `HH:MM` kürzen, beim Speichern `HH:MM` senden.

## Oberfläche

### Tierakte → Karte „Medikation“
- Oben immer sichtbar (nicht wegklickbar, `role="note"`), farbig hinterlegt:
  „Geben Sie Medikamente nur so, wie Ihre Tierarztpraxis sie verordnet hat. Ändern Sie die Dosierung nicht ohne Rücksprache. PetConnect berechnet und empfiehlt keine Dosierungen.“
- Liste: laufende zuerst (nach Beginn), beendete darunter (einklappbar „Beendet ({n})“).
- Je Eintrag: **Präparat** + Herkunft („von Ihnen“ / „von {Name}“ bei Mithalter:in / „Von der Praxis“), Zeile **Dosierung** z. B. „0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter“, Hinweise, Grund, „verordnet von …“, „seit … · bis …“, Status als Text-Pill: „Dauermedikation“, „laufend“, „endet bald“ (≤ 7 Tage), „beendet“.
- Aktionen (owner/carer, nur `source = owner`): **Bearbeiten** (gleiches Formular), **Beenden** (setzt `stopped_on` = heute, Bestätigung nicht nötig, Toast „Medikation beendet“), **Löschen** (Bestätigungsdialog: „{Name} wirklich löschen? Auch die abgehakten Gaben werden gelöscht.“).
- Einträge mit `source = practice`: keine Aktionen, Hinweis „Einträge der Praxis kann nur die Praxis ändern.“
- Darunter Feld „Weitere Hinweise zur Medikation“ (bisheriges `pets.medications`), wie bisher bearbeitbar.
- viewer: alles lesen, keine Knöpfe.

### Formular „Medikament eintragen“ (Dialog oder eigene Seite, an vorhandene Muster anpassen)
- **Präparat** (Pflicht), **Menge pro Gabe** (Pflicht, Text mit `inputmode="decimal"`, Komma und Punkt erlaubt, max. 2 Nachkommastellen, > 0), **Einheit** (Auswahl; Anzeige Einzahl/Mehrzahl: „1 Tablette“, „2 Tabletten“, „0,5 Tabletten“ → Mehrzahl außer bei genau 1).
- **Wie oft?** Auswahl als Knopfgruppe (`role="radiogroup"` oder `aria-pressed`): „1× täglich“ … „4× täglich“, „bei Bedarf“.
- **Uhrzeiten** je Gabe („1. Gabe“, „2. Gabe“ …), vorbelegt: 1× 08:00 · 2× 08:00/20:00 · 3× 08:00/14:00/20:00 · 4× 07:00/12:00/17:00/22:00. Bei „bei Bedarf“ keine Uhrzeit, Hinweis „Bei Bedarf gibt es keine feste Uhrzeit und keine Erinnerung.“
- **Hinweis zur Gabe**: kein Hinweis / mit Futter / nüchtern (vor dem Füttern); **Weitere Hinweise** (optional).
- **Grund** (optional), **Verordnet von** (optional, vorbelegt mit `pets.vet_name`, falls vorhanden).
- **Beginn** (Standard heute), **Ende** (leer = Dauermedikation).
- Checkbox **„Uhrzeiten als Erinnerung anzeigen“** (= `remind`, Standard an).
- Fehler am Feld (mit `aria-invalid` + `aria-describedby`), Wortlaut wie Prototyp: „Bitte geben Sie das Präparat an.“, „Bitte geben Sie die Menge als Zahl an, z. B. 1 oder 0,5.“, „Bitte geben Sie eine Uhrzeit an.“, „Diese Uhrzeit ist schon eingetragen.“, „Das Ende liegt vor dem Beginn.“ Fokus auf das erste fehlerhafte Feld.
- Toast nach Speichern: „{Name} eingetragen.“

### „Heute: Medikamente“ (Gabe abhaken)
- Auf der Seite **Erinnerungen** oben ein Abschnitt **„Heute: Medikamente“** und auf der **Übersicht** eine kompakte Karte mit der **nächsten offenen Gabe** (über alle Tiere) + Link „Alle Gaben heute“.
- Liste aller heutigen Gaben (`frequency = daily`, `remind = true`, heute im Zeitraum, nicht beendet), nach Uhrzeit: „08:00 · Luna · Meloxicam 0,5 ml · mit Futter“.
- Zustand in Worten (nicht nur Farbe): „offen“, „jetzt fällig“ (ab Uhrzeit bis 60 Min. danach), „überfällig seit {n} Min.“, „gegeben von {Name} um {HH:MM}“ (bei sich selbst „von Ihnen“).
- Knopf **„Gegeben“** (owner/carer) → Zeile in `medication_doses`; danach Knopf **„Rückgängig“** (löscht die Zeile, nur am selben Tag). Bei Unique-Verletzung (jemand anderes war schneller): neu laden und Toast „{Name} hat diese Gabe schon um {HH:MM} abgehakt.“
- Datum = Kalendertag in `Europe/Berlin`.
- viewer sehen die Liste ohne Knöpfe.
- Keine Push-Benachrichtigungen in diesem Auftrag (kommt mit dem Android/PWA-Auftrag).

### Notfallkarte
- „Medikamente“ zeigt die **laufenden** Medikamente mit Dosierung (eine Zeile je Medikament, z. B. „Meloxicam – 0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter“), darunter „Weitere Hinweise zur Medikation“ (falls ausgefüllt). Leer: „Nichts eingetragen“.
- Druckansicht entsprechend.

### Öffentliche Sitter-Seite
- Abschnitt „Medikamente“ aus `active_medications`: Präparat, Menge + Einheit, Uhrzeiten, Hinweis, „bis {Datum}“ falls `ends_on`. Darunter wie bisher die Freitexte (`care_notes`, `pet.medications`).
- Der Sitter kann **nicht** abhaken (kein Login). Hinweis: „Bitte geben Sie Medikamente genau wie angegeben. Bei Fragen rufen Sie die Halter:in oder die Praxis an.“

### Gesundheitsakte (PDF)
- Neuer Abschnitt **„Medikationsplan“**: Tabelle Präparat · Dosierung · Zeitraum · Status · Herkunft (eigene Angabe / von der Praxis). Laufende zuerst, beendete der letzten 12 Monate darunter. Abgehakte Gaben **nicht** in die Akte.

### Allgemein
- i18n für alle Texte (de + vorhandene Sprachen), „Sie“. Übersetzungen der Einheiten und Texte aus Prototyp Etappe 21 übernehmen und in Sie-Form bringen.
- Zahlen im Sprachformat („0,5“ in de). Uhrzeiten 24-h.
- WCAG 2.2 AA wie bisher; Knopfgruppen per Tastatur; Statusänderungen über `aria-live="polite"`.

## Tests (Pflicht)

1. **Unit**: Dosierungstext (Einzahl/Mehrzahl, Komma, „bei Bedarf“, Hinweise), Zeit-Vorbelegung je Häufigkeit, Validierung Menge (`1`, `0,5`, `0.25` gültig; `0`, `-1`, `1,234`, `abc` ungültig), Zustand einer Gabe (offen / jetzt fällig / überfällig / gegeben) mit festen Uhrzeiten inkl. Mitternacht und Zeitumstellung, Status-Pill (Dauermedikation / laufend / endet bald / beendet).
2. **E2E `medikation.e2e.ts`** mit `fake-supabase.ts` (Tabellen und `sitter_view`-Erweiterung mit denselben Regeln ergänzen):
   - Sicherheitshinweis sichtbar; Medikament 2× täglich mit Futter anlegen → Dosierungstext stimmt.
   - Pflichtfelder und Fehlertexte; doppelte Uhrzeit; „bei Bedarf“ ohne Uhrzeit.
   - Bearbeiten, Beenden (verschwindet aus „Heute“), Löschen mit Bestätigung.
   - Praxis-Eintrag (`source = practice` im Fake) ohne Aktionen.
   - „Heute: Medikamente“: Gegeben → „gegeben von Ihnen um …“, Rückgängig; zweite Person (Mithalterin) sieht „gegeben von Ahmed“; gleichzeitiges Abhaken → Hinweis-Toast. Mit Playwright-`clock`.
   - Übersicht zeigt nächste offene Gabe.
   - Notfallkarte, öffentliche Sitter-Seite und Gesundheitsakte zeigen die laufenden Medikamente; beendete nicht (außer in der Akte unter „beendet“).
   - viewer: lesen ja, keine Knöpfe.
   - Tastatur: Formular und Knopfgruppen komplett ohne Maus bedienbar.
3. `db_11_medikation.sql` liegt bereit – nur ausführen, wenn lokale Test-DB vorhanden; sonst im Bericht sagen.

Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber.
2. Alle Tests, Ergebnis zusammenfassen.
3. Commit in `App` („Medikation mit Dosierung und Gaben abhaken“) + `git push`.
4. Test-Änderungen in `Technik` committen und pushen.
5. `.env.local` nicht lesen oder hinzufügen. Nichts löschen, was nicht zum Auftrag gehört. Keine temporären Dateien außerhalb des Projekts verschieben oder löschen.
6. Kurze Zusammenfassung mit offenen Punkten.
