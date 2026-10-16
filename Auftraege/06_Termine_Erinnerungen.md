# Auftrag 06: Termine und Erinnerungen

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–05 erledigt).

## Ziel

Zwei neue Bereiche für Halter:innen, wie im Prototyp (`Projekt Petconnect\index.html`, Bereiche „Termine“ und „Erinnerungen“ – Texte und Aufbau von dort übernehmen, **keine Demo-Daten, keine Praxen**):

1. **Termine** – eigene Termine je Tier (Tierarzt, Impfung, Pflege, Training, Sonstiges) mit Datum, Uhrzeit, Ort, Notiz. Alle Mitbetreuenden sehen sie.
2. **Erinnerungen** – einmalige oder wiederkehrende Aufgaben je Tier (Entwurmung, Floh/Zecke, Medikament, Impfung, Kontrolle, Pflege, Sonstiges), abhaken, bei Wiederholung automatisch neu fällig.

Online-Buchung bei Praxen, Praxissuche und Push-Benachrichtigungen gehören **nicht** zu diesem Auftrag. Wo der Prototyp „Termin buchen“ zeigt, steht in der App „Termin eintragen“.

## Datenbank – schon live, nichts ändern

Migration `Technik\supabase\migrations\20261016220000_termine_erinnerungen.sql` ist ausgeführt. **Keine Migration ausführen.** Lies sie für die Regeln. DB-Test liegt fertig in `Technik\tests\app\db_07_termine.sql` (27 Prüfungen).

**`public.appointments`**
| Spalte | Typ | Hinweis |
|---|---|---|
| id, owner_id, created_at | | automatisch – owner_id nicht mitschicken |
| pet_id | uuid | Pflicht, nachträglich nicht änderbar |
| title | text | Pflicht, 1–120 |
| kind | text | `vet` (Tierarzt), `vaccination` (Impfung), `grooming` (Pflege/Friseur), `training`, `other`; Standard `vet` |
| starts_at | timestamptz | Pflicht |
| ends_at | timestamptz | optional, muss nach `starts_at` liegen |
| location | text | optional, ≤ 200 |
| note | text | optional, ≤ 1000 |
| status | text | `planned` (Standard), `done`, `cancelled` |

**`public.reminders`**
| Spalte | Typ | Hinweis |
|---|---|---|
| id, owner_id, created_at | | automatisch |
| pet_id | uuid | Pflicht, nicht änderbar |
| title | text | Pflicht, 1–120 |
| kind | text | `deworming`, `flea_tick`, `medication`, `vaccination`, `checkup`, `grooming`, `other` |
| due_on | date | Pflicht, nächste Fälligkeit |
| repeat_days | integer | optional, 1–3650; leer = einmalig |
| note | text | optional, ≤ 1000 |
| last_done_on | date | zuletzt erledigt |
| done_at | timestamptz | nur bei einmaligen: erledigt |

**RPC `complete_reminder(p_id uuid, p_done_on date default heute)`** → gibt die aktualisierte Zeile zurück. Wiederkehrend: `due_on = p_done_on + repeat_days`. Einmalig: `done_at` gesetzt. Fehler: `reminder_future` (Datum mehr als 1 Tag in der Zukunft), `reminder_not_found`, `reminder_not_allowed`. **Zum Abhaken immer diese Funktion nutzen**, nicht selbst rechnen.

Rechte wie bei der Tierakte: alle Mitglieder lesen; owner und carer anlegen/ändern/löschen/abhaken; viewer nur lesen.

`database.types.ts`: Tabellen und RPC von Hand ergänzen (App und `Technik\supabase\database.types.ts`).

## Oberfläche

### Navigation
- Neue Menüpunkte „Termine“ und „Erinnerungen“ in der Reihenfolge des Prototyps. Auf dem Handy erreichbar wie die bestehenden Bereiche.
- Beide Seiten zeigen alle Tiere, die die Person betreut, mit Filter nach Tier (Standard „Alle Tiere“). Bei jedem Eintrag steht der Tiername.

### Termine
- Liste „Nächste Termine“ (geplant, ab heute, aufsteigend) und darunter einklappbar „Vergangene und abgesagte“.
- Je Eintrag: Datum + Uhrzeit (deutsch, „Di., 03.11.2026, 10:00“), Titel, Art als Text, Tier, Ort, Notiz gekürzt.
- Formular „Termin eintragen“: Tier (Auswahl, nur Tiere mit Schreibrecht), Titel, Art, Datum, Uhrzeit von, optional bis, Ort, Notiz. Prüfungen wie in der DB.
- Aktionen (owner/carer): ändern, „erledigt“, „abgesagt“, löschen (mit Dialog).
- **„In meinen Kalender eintragen“**: lädt eine `.ics`-Datei (RFC 5545) für den Termin herunter, mit `VALARM` 1 Tag und 1 Stunde vorher, korrekter Zeitzone (Europe/Berlin bzw. UTC mit `Z`), UID = Termin-ID@petconnect24.com, Text ohne persönliche Daten außer Titel, Tiername, Ort. Diese Funktion gibt es auch für viewer. Das ersetzt vorerst Push: Das Handy erinnert über den eigenen Kalender.
- Leerer Zustand: „Keine Termine geplant.“

### Erinnerungen
- Gruppen: **Überfällig** (due_on < heute), **Heute**, **Nächste 30 Tage**, **Später**; erledigte einmalige einklappbar unter „Erledigt“.
- Status in Worten, nicht nur Farbe („überfällig seit 3 Tagen“, „heute“, „in 5 Tagen“).
- Je Eintrag: Titel, Art, Tier, Fälligkeit, Wiederholung („alle 90 Tage“ / „einmalig“), zuletzt erledigt.
- **Abhaken** (owner/carer): Knopf „Erledigt“ → `complete_reminder`. Danach Meldung wie im Prototyp: „Erledigt. Nächste Erinnerung am {Datum}.“ bzw. „Erledigt.“ bei einmaligen. Optional „Erledigt am …“ mit anderem Datum (nicht in der Zukunft).
- Formular „Erinnerung anlegen“: Tier, Titel, Art, fällig am, Wiederholung (Auswahl: einmalig, wöchentlich=7, monatlich=30, alle 3 Monate=90, halbjährlich=182, jährlich=365, eigene Anzahl Tage), Notiz.
- **Keine voreingestellten medizinischen Intervalle** (z. B. „Entwurmung alle 3 Monate“) vorschlagen. Die Person wählt selbst. Hinweis unter dem Formular: „Die Abstände legen Sie selbst fest. Fragen Sie im Zweifel Ihre Tierarztpraxis.“
- **Abgeleitete Erinnerungen aus der Tierakte** (nur Anzeige, nicht gespeichert): Impfungen mit `valid_until` in den nächsten 60 Tagen oder abgelaufen erscheinen in der Liste als „Impfung {Name} läuft ab am …“ mit Link zur Tierakte. Kein Abhaken-Knopf.
- „In meinen Kalender eintragen“ auch hier (`.ics`, ganztägig am Fälligkeitstag, `RRULE:FREQ=DAILY;INTERVAL={repeat_days}` bei Wiederholung, `VALARM` am Morgen um 9:00).
- Leerer Zustand: „Alles erledigt.“

### Übersicht (Startseite)
- Neue Karte „Als Nächstes“: die nächsten 3 Termine und alle überfälligen bzw. heute fälligen Erinnerungen, mit Links zu den Seiten. Abhaken direkt auf der Karte möglich (owner/carer).

### Allgemein
- i18n für alle Texte (de + vorhandene Sprachen), „Sie“.
- Zeitzone: Anzeige in der Zeitzone des Geräts; „heute“ nach lokaler Zeit.
- WCAG 2.2 AA wie bisher (Labels, Fehlermeldungen mit `aria-describedby`, Dialoge statt `confirm`, Fokus, Zielgrößen ≥ 24 px, kein reiner Farbcode).
- viewer: alles sehen, Kalender-Export ja, sonst keine Bearbeitungsknöpfe, Hinweis wie in der Tierakte.

## Tests (Pflicht)

1. **Unit**: Gruppierung/Status der Erinnerungen (Grenzen: gestern, heute, +30, +31), Wiederholungs-Auswahl → Tage, Datums-/Zeitformat, `.ics`-Erzeugung (Pflichtfelder, Escaping von Komma/Semikolon/Zeilenumbruch, Zeilen ≤ 75 Oktette gefaltet, CRLF, VALARM, RRULE), abgeleitete Impf-Erinnerungen.
2. **E2E `termine.e2e.ts`** mit `fake-supabase.ts` (um `appointments`, `reminders`, RPC `complete_reminder` mit denselben Regeln erweitern):
   - Termin anlegen, erscheint unter „Nächste Termine“ und auf der Übersicht; ändern; erledigt/abgesagt; löschen.
   - Ungültige Eingaben (Ende vor Beginn, leerer Titel) → Fehlermeldung, nichts gespeichert.
   - `.ics`-Download wird ausgelöst und enthält Titel, Tiername, Startzeit, VALARM.
   - Erinnerung wiederkehrend abhaken → neue Fälligkeit + Meldung; einmalig abhaken → unter „Erledigt“.
   - Überfällig/Heute/Später korrekt gruppiert.
   - Abgeleitete Impf-Erinnerung erscheint ohne Abhaken-Knopf.
   - Filter nach Tier.
   - carer darf alles; viewer sieht alles, hat nur Kalender-Export.
   - Tastaturbedienung der Formulare und Dialoge.
3. `db_07_termine.sql` liegt bereit – nur ausführen, wenn lokale Test-DB vorhanden; sonst im Bericht sagen.

Alle bisherigen Tests bleiben grün (app, familie, tierakte, Unit).

## Abschluss

1. `npm run lint`, `npm run build` sauber.
2. Alle Tests, Ergebnis zusammenfassen.
3. Commit in `App` („Termine und Erinnerungen“) + `git push` → Netlify veröffentlicht automatisch.
4. Test-Änderungen in `Technik` committen und pushen (Repository `petconnect-technik`).
5. `.env.local` nicht lesen oder hinzufügen. Nichts löschen, was nicht zum Auftrag gehört. Keine temporären Dateien außerhalb des Projekts verschieben oder löschen.
6. Kurze Zusammenfassung: was gebaut wurde, geänderte/neue Dateien, offene Punkte.
