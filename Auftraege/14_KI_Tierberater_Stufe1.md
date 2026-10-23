# Auftrag 14: Tierberater, Stufe 1 (Entwurf)

Abgestimmt. Stufe 1: manuelle Rassenauswahl und feste Hinweise, **ohne** Foto-Erkennung und **ohne** externen KI-Dienst. Die Foto-Erkennung (Stufe 2) kommt später mit eigenem Auftrag und eigener Entscheidung zu Anbieter, Kosten und Datenschutz.

Baue auf dem aktuellen Stand von `main` auf. Vorher klären, welche lokalen Änderungen gepusht sind (Stand siehe Auftrag 13).

## Ziel

Die Halterin wählt die Rasse ihres Tieres. Die App zeigt dann rassetypische Hinweise: Erkrankungen, die in dieser Rasse häufiger vorkommen, Allergie- und Futterhinweise, und Pflegehinweise bei Vorerkrankungen. Die Hinweise sind allgemein und ersetzen keine tierärztliche Beurteilung.

## Umfang

1. **Rassenauswahl:** Suchfeld mit Liste, nach Tierart gefiltert (Hund, Katze). Ohne Treffer: Hinweis „Rasse nicht in der Liste. Die Hinweise sind dann nicht verfügbar.“ Keine Freitext-Rasse als Quelle für Hinweise.
2. **Tierberater-Seite** je Tier, erreichbar über die Tierakte (Karte „Tierberater“): zeigt die gewählte Rasse und die Hinweise, gegliedert in Abschnitte:
   - Häufige Erkrankungen dieser Rasse
   - Allergien und Unverträglichkeiten
   - Futter: Was vermieden werden sollte
   - Pflege bei Vorerkrankungen
3. **Disclaimer** oben und unten auf der Seite, dauerhaft sichtbar: „Dieser Assistent berät nur allgemein. Er ersetzt keine tierärztliche Diagnose oder Behandlung. Bei Beschwerden wenden Sie sich an Ihre Praxis.“
4. **Speichern:** die gewählte Rasse wird am Tier gespeichert (Feld Rasse in der Tierakte ist bereits vorhanden, prüfen). Keine neue Migration erwartet.
5. **Rechte:** Halterin und Mithalter:in sehen und ändern. „Nur ansehen“ sieht nur. Betreuung sieht die Tierberater-Seite **nicht** (wie Vorgeschichte, siehe Auftrag 13).

## Inhalte (vor der Umsetzung zu liefern)

- Die Hinweistexte entstehen **einmal vorab** mit einer KI (Gemini-App im bestehenden Abo, manuell, ohne API). Das Ergebnis wird geprüft und als feste Datei `src/lib/breeds.json` abgelegt. Die App ruft nie eine KI auf.
- Muster für die Eingabe: siehe Abschnitt „Eingabe-Muster für die KI“ unten. Jede Rasse wird einzeln erzeugt und im Muster geprüft.
- Jede Rasse braucht eine Quelle (z. B. Fachliteratur oder Tierärztliche Leitlinie), die im Code angegeben wird.
- Start mit einer kleinen Liste (vorschlag: 10 Hunde- und 10 Katzenrassen mit den häufigsten Halterinnen-Angaben). Mehr kommt später.
- **Fachliche Prüfung durch Tierärztin oder Tierarzt vor dem Live-Gang.** Bis dahin Markierung `// RECHTLICH PRÜFEN` und im Auftrag „Inhalt ungeprüft“ sichtbar lassen. Die Seite zeigt dann einen Hinweis „Inhalte werden noch fachlich geprüft“.
- Die Inhalte in den 11 Sprachen: Übersetzungen durch Muttersprachler prüfen lassen (wie bei allen Texten).

## Eingabe-Muster für die KI

Dieses Muster in die Gemini-App einfügen, für jede Rasse einzeln, den Namen der Rasse am Ende ersetzen:

> Erstelle allgemeine, sachliche Hinweise für die Rasse **[RASSE]** (Tierart: **[Hund/Katze]**) für eine Tierhalter-App auf Deutsch.
> Regeln:
> - Nur allgemeine Informationen, keine Diagnose, keine Dosierungen, keine Behandlungsanweisungen.
> - Nur Aussagen, die in tierärztlicher Fachliteratur oder Leitlinien belegt sind. Wenn du dir bei etwas nicht sicher bist, schreibe „unsicher“ dahinter.
> - Nenne zu jedem Abschnitt mindestens eine Quelle (Titel, Autor oder Organisation, Jahr). Erfinde keine Quellen.
> - Maximal 4 Punkte je Abschnitt, jeweils ein Satz.
> - Gib die Antwort nur als JSON in genau diesem Aufbau aus:
> {"breed": "[RASSE]", "species": "[dog|cat]", "sections": {"diseases": [{"text": "...", "source": "..."}], "allergies": [{"text": "...", "source": "..."}], "food": [{"text": "...", "source": "..."}], "care_chronic": [{"text": "...", "source": "..."}]}, "unsure": ["..."]}

Hinweis zum Ablauf: Die KI-Antwort ist ein Entwurf. Quellen müssen vor dem Einbau nachgeprüft werden. Fehlt eine Quelle oder ist sie nicht auffindbar, kommt der Punkt nicht in die App.

## Technik

- Reine Funktionen in `src/lib/breedAdvice.ts`: Suche, Filter nach Tierart, Auswahl der Abschnitte. Ohne React, ohne Netzwerk.
- Textdatei `breeds.json` lokal, kein Aufruf an Dritte.
- i18n für alle Oberflächentexte in 11 Sprachen, „Sie“. WCAG 2.2 AA.
- Keine Speicherung von Fotos in dieser Stufe.

## Tests (Pflicht)

1. **Unit** `breedAdvice.test.ts`: Suche (Groß- und Kleinschreibung, Umlaute), Filter nach Tierart, Rasse ohne Eintrag liefert keine Hinweise, jeder Eintrag hat eine Quelle, Disclaimer ist immer enthalten.
2. **E2E** `tierberater.e2e.ts`:
   - Rasse wählen, Hinweise erscheinen, Disclaimer sichtbar.
   - Rasse ohne Treffer zeigt den Hinweis.
   - „Nur ansehen“ hat keine Auswahl.
   - Betreuung sieht die Seite nicht.
3. Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build`, alle Tests.
2. Commit in `App` („Tierberater Stufe 1“), Tests in `Technik`, jeweils `git push`.
3. `.env.local` nicht lesen. Nichts löschen, was nicht zum Auftrag gehört.
4. Kurze Zusammenfassung mit offenen Punkten, insbesondere der fachlichen Prüfung.

## Entschieden

1. **KI:** Gemini-App im bestehenden Abo, manuell. Keine API. Provider für später offen.
2. **Rassen:** Ich schlage die Liste vor, du prüfst sie. Die Erkennung läuft über die Liste (Suche mit Toleranz für Schreibfehler), nicht über eine KI.
3. **KI-Anbieter:** Gemini (Abo).

4. **Rassenliste (freigegeben):**
   - Hunde: Labrador Retriever, Deutscher Schäferhund, Golden Retriever, Französische Bulldogge, Dackel, Yorkshire Terrier, Chihuahua, Border Collie, Pudel, Mops.
   - Katzen: Europäisch Kurzhaar, Maine Coon, Britisch Kurzhaar, Perserkatze, Siamkatze, Norwegische Waldkatze, Ragdoll, Bengal, Sphynx, Russisch Blau.

## Offen

1. **Fachliche Prüfung:** Wer prüft die Inhalte vor dem Live-Gang? (Tierärztin oder Tierarzt)
