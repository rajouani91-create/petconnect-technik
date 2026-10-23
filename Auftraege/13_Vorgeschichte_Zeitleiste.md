# Auftrag 13: Vorgeschichte und Zeitleiste (Entwurf)

Abgestimmt, bereit zur Umsetzung. Vorbild ist der Prototyp (Karte „Vorgeschichte“, Zeitleiste „tl…“). Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–12 bis auf 12 erledigt; Auftrag 12 ist noch nicht begonnen). Achtung: Einige Änderungen aus den letzten Schritten sind lokal committet, aber noch nicht gepusht. Vor dem Start klären, was gepusht ist.

## Ziel

Die Halterin trägt vor dem ersten Besuch die Vorgeschichte ihres Tieres ein. Die Praxis sieht sie vorab und kann sie ergänzen. Zusätzlich zeigt eine Zeitleiste alle wichtigen Ereignisse des Tieres in einer Reihenfolge: Impfungen, Befunde, Medikation, Laborwerte und Gewicht.

## Umfang: Vorgeschichte (Fragebogen)

Alle Felder sind freiwillig. Die Halterin speichert mit „Vorgeschichte speichern“. Der Stand zeigt „Ausgefüllt am {Datum}“. Es gibt eine Leeranzeige „Noch keine Vorgeschichte angegeben.“

| Feld | Art | Antworten |
|---|---|---|
| Herkunft | Auswahl | Züchter · Tierheim / Tierschutz · Privat · Fundtier · Ausland |
| Seit wann bei dir | Datum | optional |
| Kastriert / sterilisiert | Auswahl | Ja · Nein · Unbekannt |
| Haltung | Auswahl | Wohnung · Freigänger · Haus mit Garten · Draußen / Stall |
| Frühere Erkrankungen | Freitext | |
| Operationen | Freitext | |
| Chronische Erkrankungen | Freitext | |
| Allergien und Unverträglichkeiten | Freitext | |
| Bisherige Medikamente | Freitext | |
| Auslandsaufenthalte / Reisen | Freitext | |
| Bisherige Tierarztpraxis | Freitext | |
| Sonstiges | Freitext | |

Regeln:
- Ergänzung der Praxis: eigener Bereich „Ergänzung der Praxis“ mit eigenem Speichern. Die Praxis kann nur ergänzen, nicht die Angaben der Halterin ändern.
- Kennzeichnung: „Angaben der Halter:in“ und „Ergänzung der Praxis“ sind getrennt sichtbar.
- Hinweis für Erstbesuch: „Erster Besuch? Fülle die Vorgeschichte vorab aus – das spart Zeit in der Praxis.“
- Keine Pflichtfelder, keine Diagnose oder Bewertung durch die App.

## Umfang: Zeitleiste

- Chronologische Liste aller Ereignisse des Tieres, neueste zuerst.
- Filter nach Art: Impfung · Befund · Medikation · Labor · Gewicht.
- Jeder Eintrag zeigt Datum, Art und Kurztext. Tipp führt zur passenden Karte der Tierakte.
- Leerzustand: „Noch keine Einträge.“
- Quellen: vorhandene Daten aus Impfungen, Dokumenten (Befunde), `medication_doses` bzw. Medikation, Gewicht und Laborwerten. Laborwerte ist ein eigener Schritt (siehe unten).

## Nicht Teil dieses Auftrags

- Laborwerte mit Referenzbereichen je Tierart. Die Referenzwerte müssen fachlich geprüft werden, bevor sie in die App kommen. Eigener Auftrag, danach.
- Freigabe der Vorgeschichte an die Betreuung ist ausgeschlossen (siehe Abschnitt Betreuung). Eine Freigabe an Praxen ist nicht Teil dieses Auftrags.

## Technik

- Neue Tabelle `pet_history` (ein Datensatz pro Tier, Felder wie oben, `updated_by`, `updated_at`), dazu Spalten für die Praxisergänzung. Migration im Ordner `Technik/supabase/migrations`. **Vor dem Ausführen melden.**
- RLS: Halterin und Mithalter:in lesen und schreiben die Halterangaben. Praxis schreibt nur die Ergänzung. „Nur ansehen“ liest alles, schreibt nichts.
- Datenschutz: Die Angaben sind Gesundheitsangaben zum Tier mit Bezug zur Halterin. Vor der Umsetzung im Datenschutztext ergänzen (Abschnitt „Konto und Inhalte“ bzw. neuer Punkt). Kommentar `// RECHTLICH PRÜFEN` im Code setzen.
- Zeitleiste lädt bestehende Daten über `lib/api.ts`. Keine neuen Abfragen ohne Index-Prüfung.
- Zeitzone `Europe/Berlin`. i18n für alle neuen Texte in 11 Sprachen, „Sie“. WCAG 2.2 AA.

## Betreuung und Familie (aus dem Prototyp, Tierakte → Betreuung)

Der Prototyp regelt das klar. Diese Regeln gelten für die App unverändert:

**Betreuung (Sitter, Vertretung):**
- Die Halterin legt einen zeitlich begrenzten Zugang an: Name der Person, Von und Bis. Das Ende muss nach dem Anfang liegen.
- Sichtbar für die Betreuung: Alimentation und Pflege, Medikamente und Hinweise, Notfallkarte, Kontakt der Praxis.
- **Nicht sichtbar:** Vorgeschichte, Zeitleiste, Rechnungen, Versicherung, persönliche Notizen. Die Vorgeschichte gehört damit nicht zur Betreuung.
- Zugang per Link oder QR-Code, ohne Anmeldung. Der Link enthält nur die Betreuungsdaten.
- Der Zugang läuft ab, wenn der Zeitraum endet. Die Halterin kann ihn vorher widerrufen. Der Widerruf wirkt in der App sofort.
- Status je Zugang: aktiv, geplant (Start liegt in der Zukunft), abgelaufen, widerrufen.
- Die Halterin kann die Sicht der Betreuung ansehen („Vista del cuidador“), bevor sie den Zugang teilt.

**Familie und Mitbesitzer:innen (Mithalter:in):**
- Vollzugriff, auch auf Rechnungen und Termine, also auch auf die Vorgeschichte und die Zeitleiste.
- Einladung per E-Mail. Der Eingeladene bekommt den Status „eingeladen“, bis er annimmt.

**Nur ansehen:** sieht die Daten, hat keine Knöpfe.

Wichtig für die Umsetzung: Die Betreuungsseite zeigt keine Vorgeschichte, und das muss im E2E-Test geprüft werden.

## Tests (Pflicht)

1. **Unit** `history.test.ts`: Speichern nur mit Werten aus der Auswahl, Datum in der Zukunft abgelehnt, Herkunft „Ausland“ ohne Zusatzangabe erlaubt, Zeitleiste sortiert und gefiltert, leere Liste.
2. **E2E** `vorgeschichte.e2e.ts`:
   - Betreuungszugang: Vorgeschichte und Zeitleiste sind nicht sichtbar, Notfallkarte und Medikamente schon.
   - Widerruf wirkt sofort.
   - Halterin füllt aus, speichert, sieht „Ausgefüllt am …“.
   - Praxis sieht die Angaben, ergänzt, Halterin sieht die Ergänzung getrennt.
   - „Nur ansehen“ sieht alles, hat keine Knöpfe.
   - Zeitleiste zeigt Impfung, Gewicht und Medikation in richtiger Reihenfolge; Filter funktioniert.
3. Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build`, alle Tests.
2. Commit in `App` („Vorgeschichte und Zeitleiste“), Migration und Tests in `Technik`, jeweils `git push`.
3. `.env.local` nicht lesen. Nichts löschen, was nicht zum Auftrag gehört.
4. Kurze Zusammenfassung mit offenen Punkten.

## Entschieden

1. **Freigabe:** Die Vorgeschichte ist nicht Teil der Betreuung (siehe unten). Für Mithalter:innen mit Vollzugriff ist sie sichtbar.
2. **Praxisergänzung:** Die Praxis darf ergänzen, ohne Bestätigung der Halterin. Die Ergänzung ist gekennzeichnet.
3. **Zeitleiste:** Impfungen, Befunde, Medikation und Gewicht. Laborwerte kommen mit ihrem eigenen Auftrag.
4. **Migration:** Die Tabelle `pet_history` darf angelegt werden.

## Offen

Keine offenen Punkte. Umsetzung kann beginnen.
