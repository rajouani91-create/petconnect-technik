# Auftrag 08b: Praxissuche verbessern

Erst starten, wenn **Auftrag 08 fertig, getestet und gepusht** ist. Lies diesen Auftrag ganz, bevor du anfängst.

## Ziel

Die Praxissuche aus Auftrag 08 wird genauer, fehlertoleranter und ehrlicher – ohne Kosten, ohne neue Dienste. Alle Anforderungen aus `08_Praxissuche.md` (ODbL-Quellenangabe, i18n, WCAG/WAI-ARIA, Favoriten, Stammpraxis, „Praxis einladen“) bleiben gültig.

## Datenbank – schon live, nichts ändern

Migration `Technik\supabase\migrations\20261017120000_praxissuche_fehlertolerant.sql` ist ausgeführt. **Keine Migration ausführen.** DB-Test: `Technik\tests\app\db_10_praxissuche_fehlertolerant.sql` (21 Prüfungen, grün).

Was sich geändert hat (Signaturen von `search_practices` und `geocode_place` sind **unverändert**):
- **Namenssuche (`p_q`) ist jetzt fehlertolerant in der Datenbank**: Umlaute und Schreibweisen (ü/ue/u, ß/ss), Groß/Klein, Füllwörter („Praxis“, „Dr.“, „Tierarzt“, „Tierarztpraxis“ …) und kleine Tippfehler („Pferdklinik“, „Hatersheim“). **Im Frontend den Suchtext nur trimmen – nicht selbst Umlaute umwandeln oder Wörter entfernen** (das würde die Datenbanksuche verschlechtern).
- **`geocode_place`** findet jetzt auch „Ruesselsheim“, „Rüselsheim“ (Tippfehler), Wortteile („Main“) und PLZ-Anfänge („654“, 2–4 Ziffern). Ein einzelner Buchstabe liefert nichts.
- **Neu: `count_practices_by_radius(p_lat, p_lon, p_species, p_services, p_titles, p_q)`** → vier Zeilen für 5/10/25/50 km mit `total` (alle Praxen), `with_profile` (Praxen mit Angebot) und `matches` (echte Treffer für die Filter). Für die Radius-Vorschläge unten.

`database.types.ts` um `count_practices_by_radius` ergänzen (App und Technik). `fake-supabase.ts` entsprechend erweitern (gleiche Regeln, inkl. Normalisierung für Namen/Orte in einfacher Form).

## Verbesserungen im Frontend

### 1. Sortierung innerhalb der Treffer
- Die Trennung bleibt: oben **Treffer** (`matches = true`), darunter „Noch nicht bei PetConnect – Angebot unbekannt“.
- **Innerhalb der Treffer** sortieren nach: `registered` zuerst, dann `titles_verified`, dann Entfernung. Umschalter „Entfernung / Name“ bleibt; „Entfernung“ heißt dann „Empfohlen (Entfernung)“ mit diesem Vorrang.
- **Kein Namens-Raten als Treffer:** Ein Name wie „Exotenpraxis“ macht eine Praxis **nicht** zum Treffer und darf nicht so aussehen. Erlaubt ist nur: Im Abschnitt „Angebot unbekannt“ dürfen Praxen, deren Name zur gewählten Tierart passt (kleine Schlüsselwortliste je Tierart in `practiceCatalog.ts`, z. B. reptile → „exoten“, „reptil“, „vogel“ für bird, horse → „pferd“, „pferde“), **weiter oben** stehen – mit dem Hinweis „Name deutet auf {Tierart} hin – bitte anrufen und nachfragen“. Keine Treffer-Kennzeichnung.

### 2. Ehrliche Leer-Zustände und Radius-Vorschlag
Nach jeder Suche zusätzlich `count_practices_by_radius` aufrufen (gleiche Filter) und daraus ableiten:
- **Treffer vorhanden:** wie bisher.
- **0 Treffer im gewählten Umkreis, aber `matches > 0` in einer größeren Stufe:** unter dem Hinweis `psNone` ein deutlicher Knopf **„Suchradius auf {nächste Stufe mit Treffern} km erweitern“** und darunter „{n} passende Praxen im Umkreis von {k} km“. Klick setzt den Radius (URL wird aktualisiert) und sucht neu; Fokus auf den Zähler.
- **0 Treffer in allen Stufen, aber Praxen im Umkreis (`total > 0`) und keine mit Angebot (`with_profile = 0`):** **kein** Radius-Knopf. Stattdessen: „Noch keine Praxis in Ihrer Nähe hat Angaben zu Leistungen gemacht. Diese Praxen könnten passen – bitte anrufen und nachfragen.“ Darunter die Liste „Angebot unbekannt“.
- **0 Treffer in allen Stufen, es gibt Praxen mit Angebot, aber keine passt:** `psNone` + „Filter zurücksetzen“, kein Radius-Knopf.
- **Gar keine Praxis bis 50 km (`total = 0` bei 50):** „Im Umkreis von 50 km haben wir keine Praxis gefunden.“ + Link „Praxis bei OpenStreetMap eintragen“.
- Zähltext immer mit `aria-live="polite"`.

### 3. Öffnungszeiten genauer
Mit der in 08 gewählten Bibliothek (Land `de`, Bundesland aus der PLZ bzw. Koordinate, damit Feiertage `PH` stimmen; im Zweifel `HE`):
- **„Jetzt geöffnet – bis {Uhrzeit}“**
- **„Schließt bald – um {Uhrzeit}“** (weniger als 45 Minuten bis Schluss)
- **„Geschlossen – öffnet heute um {Uhrzeit}“** bzw. **„Geschlossen – öffnet {Tag} um {Uhrzeit}“**
- **„Öffnungszeiten unbekannt“**, wenn leer oder nicht auswertbar (nie Fehler werfen; Praxis nicht ausblenden).
- Kommentare in den Zeiten (z. B. `"nur Notfälle"`) als Text anzeigen.
- Badges **immer mit Text**, Farbe nur zusätzlich (Kontrast AA). „Jetzt geöffnet“-Filter wie in 08; „Schließt bald“ zählt als geöffnet.
- Unit-Tests mit festen Zeiten, inkl. Mitternacht, Wochenende, Feiertag, `24/7`, ungültiger String.

### 4. Ort/PLZ-Feld
- Aufruf von `geocode_place` **verzögert (250 ms)**, laufende Anfragen beim Weitertippen verwerfen (AbortController bzw. Ergebnis ignorieren), ab 2 Zeichen.
- Treffende Stelle im Vorschlag **fett** (`<mark>` oder `<strong>`, ohne `innerHTML` mit Nutzereingabe).
- Bei **genau 5 Ziffern** und genau einem Treffer: automatisch übernehmen und suchen; per `aria-live` ansagen („Rüsselsheim am Main, 65428 ausgewählt“).
- Kein Treffer: „Ort nicht gefunden – bitte PLZ oder anderen Ortsnamen versuchen.“

### 5. Namensfeld
- Ebenfalls 250 ms verzögert, ab 2 Zeichen; Text nur trimmen.
- Leeres Ergebnis bei Namenssuche: „Keine Praxis mit diesem Namen im Umkreis. Umkreis vergrößern?“ (Knopf nächste Stufe, wenn `count_practices_by_radius` dort `total > 0` zeigt).

## Tests (Pflicht)

1. **Unit**: Sortierung (registered → verifiziert → Entfernung), Schlüsselwort-Hinweis je Tierart (nie `matches`), Leer-Zustand-Entscheidung (alle vier Fälle aus Abschnitt 2), Öffnungszeiten-Texte (siehe oben), Hervorhebung ohne HTML-Einschleusung (`<script>` im Suchtext), Debounce.
2. **E2E `praxen.e2e.ts` erweitern**:
   - „Mueller“, „muller“, „Tierarztpraxis Dr. Müller“, „Pferdklinik“ finden die passende Fake-Praxis.
   - „Ruesselsheim“ und „Rüselsheim“ liefern Rüsselsheim als Vorschlag; 5-stellige PLZ wird automatisch übernommen und angesagt.
   - Radius-Knopf erscheint nur, wenn im größeren Umkreis echte Treffer sind; Klick erweitert Radius und URL.
   - Ohne jedes Praxisprofil: Hinweis „Noch keine Praxis in Ihrer Nähe hat Angaben …“, kein Radius-Knopf.
   - Öffnungsstatus mit Playwright-`clock` (geöffnet, schließt bald, geschlossen/öffnet um, unbekannt).
   - Name „Exotenpraxis“ bei Filter Reptil: nur Hinweis im Abschnitt „Angebot unbekannt“, kein Treffer.
3. `db_10_praxissuche_fehlertolerant.sql` liegt bereit – nur ausführen, wenn lokale Test-DB vorhanden.

Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber.
2. Alle Tests, Ergebnis zusammenfassen.
3. Commit in `App` („Praxissuche verbessert“) + `git push`; Test-Änderungen in `Technik` committen und pushen.
4. `.env.local` nicht lesen oder hinzufügen. Nichts löschen, was nicht zum Auftrag gehört. Keine temporären Dateien außerhalb des Projekts verschieben oder löschen.
5. Kurze Zusammenfassung mit offenen Punkten.
