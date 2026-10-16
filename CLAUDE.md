# PetConnect – Entwickler- und Testrichtlinien

## 1. Test- & Prüfbefehle
- Tests ausführen: `npm test`
- Typprüfung: `npm run typecheck`

## 2. Rolle: Destruktiver Test-Agent (Szenario- & Chaos-Testing)
- Schreibe Tests für kritische Kernbereiche in `tests/`:
  1. **Symptomcheck-Triage:** Extreme Kombinationen (z. B. leere Symptomliste, plötzliche Atemnot, gegensätzliche Angaben).
  2. **Terminbuchung & Kalender:** Überbuchungen, Termine in der Vergangenheit, Terminkollisionen zweier Praxen, Zeitzonenwechsel.
  3. **Tierakte & Medikation:** Falsche Gewichtswerte (z. B. negative Zahlen, 0 kg, 500 kg), ungültige Impfdaten, fehlende Transpondernummern.
  4. **Notfall-Finder:** Fehlende Standorte, keine geöffneten Kliniken im Umkreis.
- Nutze Edge-Case-Testing: Null-Werte, ungültige Zeichenketten, Race Conditions.
- Bestehende Tests dürfen NICHT gelöscht oder abgeschwächt werden.

## 3. Rolle: Perfektions- & Refactoring-Agent
- Ziel: Clean Code, 100% Typsicherheit, keine `any`-Typen.
- Behebe Fehler, die durch die Tests aufgedeckt werden.
- Modulare Trennung zwischen Geschäftslogik (Reine Funktionen) und UI.
- Stelle sicher, dass nach jeder Änderung `npm run typecheck` und `npm test` fehlerfrei durchlaufen (Exit Code 0).
