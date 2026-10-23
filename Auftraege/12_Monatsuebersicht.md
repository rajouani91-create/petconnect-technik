# Auftrag 12: Monatsübersicht (Entwurf)

Entwurf zur Abstimmung. Offene Punkte stehen ganz unten und müssen vor der Umsetzung entschieden werden. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–11 erledigt). Achtung: Anmeldeseite ist lokal committet (9105e7d, noch nicht gepusht). Erinnerungs-Drawer, Routenlinks, Tagesplan-Layout und Footer sind nur lokal geändert und noch nicht committet.

## Ziel

Eine Übersicht pro Tier und Monat, die auf einen Blick zeigt, wie der Monat gelaufen ist: Gaben, Erinnerungen, Termine und Gewicht. Sie dient der Halterin als Rückblick und kann für Tierarzt oder Betreuung ausgedruckt oder geteilt werden. Keine Auswertung über Gesundheit, nur Zählungen und Verläufe aus den vorhandenen Daten.

Vorbild: Prototyp, Widget „Haushaltsbericht / Monatsübersicht“ (im Prototyp vorhanden; vor der Umsetzung im Prototyp ansehen und übernehmen, was passt).

## Umfang (entschieden)

1. **Monatswahl:** Vor- und Zurück-Pfeil, Standard ist der laufende Monat. Umschaltung zwischen den Tieren wie auf der Startseite (`PetSwitcher`).
2. **Medikation:** je Medikament Anzahl geplanter Gaben, erledigte Gaben und verpasste Gaben. Quelle: `pet_medications` und `medication_doses`. Keine Dosierungsempfehlung, nur Zählung.
3. **Erinnerungen:** erledigt, überfällig, offen. Quelle: `reminders` und `routine_items` (Gassi, Füttern, eigene Erinnerungen) mit `routine_done`.
4. **Termine:** Anzahl geplanter Termine, davon stattgefunden, abgesagt. Quelle: `appointments`.
5. **Gewicht:** Wert am Monatsanfang und Monatsende, Differenz. Quelle: Gewichtsverlauf der Tierakte. Ohne Messung im Monat: Hinweis „Keine Messung in diesem Monat“.
6. **Export als PDF über den Browser:** Knopf „Als PDF speichern“ öffnet den Druckdialog des Browsers. Dort wählt die Nutzerin „Als PDF speichern“. Dafür gibt es eine eigene Druckansicht (`@media print`): nur der Monatsinhalt, ohne Navigation, Knöpfe und Tierauswahl. Kein CSV, keine zusätzliche Bibliothek, kein Versand per E-Mail in diesem Auftrag.

Nicht Teil dieses Auftrags: Ausgaben und Rechnungen (eigener Auftrag, falls gewünscht), Symptom-Prüfer, KI-Auswertungen.

## Technik

- Reine Berechnungsfunktionen in `src/lib/monthReport.ts`, ohne React und ohne Supabase. Eingabe: Listen von Gaben, Erinnerungen, Terminen, Gewichtswerten und der Monat. Ausgabe: Zahlen und Texte-Schlüssel.
- Eigene Seite unter „Mehr“, Route `/mehr/monatsuebersicht`, mit Tierauswahl. Keine Karte in der Tierakte.
- Daten laden über bestehende Funktionen in `src/lib/api.ts`. Keine neue Migration erwartet. Falls doch nötig: vorher melden.
- Keine PDF-Bibliothek. Der Knopf ruft `window.print()` auf. Der Hinweistext neben dem Knopf erklärt: „Im Druckdialog „Als PDF speichern“ wählen.“
- Zeitzone: `Europe/Berlin`, Monatsgrenzen in lokaler Zeit (`lib/time.ts`).
- Rechte: Halterin und Mithalter:in sehen alles, „Nur ansehen“ sieht alles ohne Knöpfe.
- i18n für alle neuen Texte in 11 Sprachen, „Sie“. WCAG 2.2 AA.

## Tests (Pflicht)

1. **Unit** `monthReport.test.ts`: Zählung Gaben (geplant, erledigt, verpasst) über Monatsgrenze, Medikament beendet im Monat, bei Bedarf nicht gezählt, Erinnerung wiederholt, Termin abgesagt, Gewicht ohne Messung, Monat mit 28, 30 und 31 Tagen.
2. **E2E** `monatsuebersicht.e2e.ts`:
   - Zahlen stimmen mit einem Fake-Datenbestand überein.
   - Monat wechseln, Zahlen ändern sich.
   - „Nur ansehen“ sieht keine Knöpfe.
   - „Als PDF speichern“ öffnet den Druckdialog (`window.print` wird aufgerufen; in E2E gestubbt).
   - Die Druckansicht enthält Tiername und Monat, aber keine Knöpfe und keine Navigation.
3. Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build`, alle Tests.
2. Commit in `App` („Monatsübersicht“), Tests in `Technik`, jeweils `git push`.
3. `.env.local` nicht lesen. Nichts löschen, was nicht zum Auftrag gehört.
4. Kurze Zusammenfassung mit offenen Punkten.

## Entschieden

- Export: PDF über die Druckfunktion des Browsers, mit Druckansicht. Keine zusätzliche Bibliothek.

- Ort: eigene Seite unter „Mehr“, nicht in der Tierakte.
- Gewicht: Anfang und Ende des Monats mit Differenz, kein Diagramm.
- Medikation: nur Zählung (geplant, erledigt, verpasst), keine Liste.
- Haushalt: pro Tier, keine gemeinsame Übersicht.

## Offen

Keine offenen Punkte. Umsetzung kann beginnen.

