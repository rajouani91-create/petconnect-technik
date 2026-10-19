# Auftrag 11: Tagesplan und Medikation verknüpfen

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–10b erledigt; falls 10b noch offen ist, erst 10b abschließen).

## Ziel

Medikamente haben **genau eine Quelle: die Medikation** (`pet_medications`). Der Tagesplan („Alltag“, `/alltag`, Tabelle `routine_items`) zeigt die Uhrzeiten laufender Medikamente **automatisch** zwischen Gassi und Füttern an – zum Abhaken, aber nicht zum Ändern. Wer im Tagesplan „Medikament“ wählt, wählt ein eingetragenes Medikament aus oder trägt ein neues ein; einen freien Medikamenten-Eintrag im Tagesplan gibt es nicht mehr.

Vorbild: Prototyp Etappe 21 (Medikamente erscheinen im Tagesablauf mit Pill „aus der Medikation“, ohne Löschen-Knopf).

## Datenbank – schon live, nichts ändern

Migration `Technik\supabase\migrations\20261018160000_tagesplan_medikation.sql` ist ausgeführt, Edge Function `push-senden` ist aktualisiert. **Keine Migration ausführen, nichts deployen.** DB-Test: `Technik\tests\app\db_13_tagesplan_medikation.sql` (10 Prüfungen, grün).

- **Neue `routine_items` mit `kind = 'med'` werden abgelehnt** (auch Umstellen eines Eintrags auf `med`). Fehlertext der DB: `routine_use_medication` (Code 23514). Bestehende `med`-Einträge bleiben lesbar, änderbar und löschbar (live gibt es genau einen).
- **Push für den Tagesplan**: Einträge mit `reminder_on = true` lösen zur Uhrzeit eine Benachrichtigung aus (Wiederholung täglich/werktags/Wochenende beachtet, nicht wenn heute schon erledigt). Klick öffnet `/alltag`. Alte `med`-Einträge im Tagesplan lösen **keinen** Push aus.
- **`notification_prefs.routine`** (bool, Standard an) – neuer Schalter „Tagesplan (Gassi, Füttern …)“.

`database.types.ts` von Hand ergänzen (App und Technik).

## Oberfläche

### 1. Tagesplan zeigt die Medikamente
- Für das gewählte Tier und den Tag: aus `pet_medications` alle mit `frequency = 'daily'`, `remind = true`, heute im Zeitraum (`starts_on ≤ heute`, `ends_on`/`stopped_on` nicht vorbei) – je Uhrzeit ein Eintrag, nach Uhrzeit **zusammen mit** den `routine_items` sortiert.
- Darstellung wie die anderen Einträge (gleiches Raster/Zeitleiste), Icon Medikament, Text „Meloxicam · 0,5 ml · mit Futter“, Pill **„aus der Medikation“**. Kein Löschen-, kein Bearbeiten-, kein Erinnerungs-Schalter.
- Abhaken = dieselbe Gabe wie unter „Heute: Medikamente“ (`medication_doses`, inkl. „gegeben von {Name} um {HH:MM}“ und „Rückgängig“). Beide Ansichten müssen nach dem Abhaken sofort denselben Stand zeigen (gemeinsamer Hook/Store, kein doppelter Code).
- Tipp auf den Text → Tierakte, Karte Medikation, mit diesem Medikament im Fokus.
- „Nächster Punkt“ auf der Übersicht/oben im Tagesplan berücksichtigt Medikamente genauso.
- „bei Bedarf“ und Einträge mit `remind = false` erscheinen **nicht** im Tagesplan.
- viewer: sehen alles, keine Knöpfe.

### 2. „Eintrag hinzufügen“ → Art „Medikament“
Statt Freitext ein kleiner Auswahlschritt:
- **Liste der laufenden Medikamente des Tiers** (Name + Dosierung). Auswahl → Uhrzeit(en) wählen (Vorbelegung: vorhandene `times` des Medikaments, sonst 08:00). Speichern **aktualisiert `pet_medications.times`** (und setzt `frequency = 'daily'`, `remind = true`), es entsteht **kein** `routine_items`-Eintrag. Toast „Uhrzeit für {Name} gespeichert. Sie steht jetzt im Tagesplan.“
  - Bei `source = 'practice'` darf die Halterin die Zeiten nicht ändern (RLS) → Hinweis „Uhrzeiten von Praxis-Medikamenten legt die Praxis fest.“ (Hinweis, kein Fehler). *(Sobald es Praxis-Einträge gibt, kommt eine eigene Erinnerungszeit je Halter:in – nicht in diesem Auftrag.)*
  - Max. 4 Uhrzeiten, keine doppelten (Regeln der DB).
- Knopf **„Neues Medikament eintragen“** → öffnet das Medikamenten-Formular aus Auftrag 09 (mit Rücksprung in den Tagesplan nach dem Speichern).
- Keine laufenden Medikamente: Hinweis „Noch kein Medikament eingetragen.“ + nur der Knopf „Neues Medikament eintragen“.
- Die DB-Ablehnung `routine_use_medication` abfangen (falls sie doch auftritt) mit verständlichem Text, nie als technischer Fehler.

### 3. Alte Medikamenten-Einträge im Tagesplan
Bestehende `routine_items` mit `kind = 'med'`:
- weiter anzeigen, mit Hinweis **„Bitte als Medikament eintragen – dann erscheint es auch auf Notfallkarte und in der Gesundheitsakte.“**
- Knopf **„Umwandeln“**: öffnet das Medikamenten-Formular vorausgefüllt (Präparat = `label` oder leer, eine Uhrzeit = `time_of_day`, Menge leer → muss eingegeben werden). Nach dem Speichern des Medikaments den alten `routine_items`-Eintrag löschen (nur nach erfolgreichem Speichern) und Toast „{Name} ist jetzt in der Medikation.“
- Kein automatisches Umwandeln ohne Klick.

### 4. Medikation → Tagesplan (andere Richtung)
- Nach dem Speichern eines Medikaments mit Uhrzeiten: Toast zusätzlich „… und steht im Tagesplan.“
- Beenden/Löschen eines Medikaments: verschwindet sofort aus Tagesplan und „Heute: Medikamente“ (Cache/Store aktualisieren).

### 5. Benachrichtigungen
- Unter Mehr → Benachrichtigungen neuer Schalter **„Tagesplan (Gassi, Füttern …)“** (`routine`), Reihenfolge: Medikamente · Tagesplan · Erinnerungen · Termine.
- Im Tagesplan bleibt der bestehende Schalter je Eintrag (`reminder_on`) – Hinweis darunter: „Erinnerungen kommen als Benachrichtigung aufs Handy, wenn sie unter Mehr → Benachrichtigungen aktiviert sind.“ (Link, nur wenn auf diesem Gerät nicht aktiv.)
- Service Worker: Push mit `url: "/alltag"` öffnet den Tagesplan (bestehende Logik reicht, nur prüfen).

### Allgemein
- i18n für alle neuen Texte (11 Sprachen), „Sie“. WCAG 2.2 AA wie bisher.

## Tests (Pflicht)

1. **Unit**: Zusammenführen und Sortieren von `routine_items` + Medikamenten-Uhrzeiten für einen Tag (Wiederholung werktags/Wochenende, Zeitraum, beendet, `remind = false`, bei Bedarf), Status gegeben/offen.
2. **E2E `tagesplan-medikation.e2e.ts`** (Fake um Trigger-Regel und `routine` in `notification_prefs` ergänzen):
   - Medikament mit 08:00/20:00 anlegen → beide Zeiten im Tagesplan mit Pill „aus der Medikation“, ohne Löschen-Knopf.
   - Im Tagesplan abhaken → unter Erinnerungen „gegeben von Ihnen“ und umgekehrt.
   - „Eintrag hinzufügen → Medikament“: Auswahl eines vorhandenen Medikaments, Uhrzeit ändern → `pet_medications.times` geändert, kein neuer `routine_items`-Eintrag.
   - „Neues Medikament eintragen“ aus dem Tagesplan → Formular → zurück, Eintrag sichtbar.
   - Alter `med`-Eintrag: Hinweis + „Umwandeln“ → Medikament angelegt, alter Eintrag weg.
   - Medikament beenden → verschwindet aus dem Tagesplan.
   - Bei Bedarf → nicht im Tagesplan.
   - Schalter „Tagesplan“ unter Benachrichtigungen speichert `routine`.
3. `db_13_tagesplan_medikation.sql` nur ausführen, wenn lokale Test-DB vorhanden.

Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber; alle Tests.
2. Commit in `App` („Tagesplan und Medikation verknüpft“) + `git push`; Tests/Typen in `Technik` committen und pushen (inkl. der neuen Migration, des DB-Tests und der geänderten Edge-Function-Dateien in `supabase/functions/push-senden/`).
3. `.env.local` nicht lesen. Nichts löschen, was nicht zum Auftrag gehört.
4. Kurze Zusammenfassung mit offenen Punkten.
