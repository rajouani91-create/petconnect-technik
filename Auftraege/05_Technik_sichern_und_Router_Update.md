# Auftrag 05: Technik-Ordner sichern und react-router aktualisieren

Lies diesen Auftrag ganz, bevor du anfängst. Zwei getrennte Teile, nacheinander.

## Teil A – Technik-Ordner auf GitHub sichern

Das leere, **private** Repository ist schon angelegt:
`https://github.com/rajouani91-create/petconnect-technik` (Branch `main`).

1. Im Ordner `Technik` ein Git-Repository anlegen (`git init -b main`).
2. `.gitignore` anlegen, mindestens:
   ```
   node_modules/
   test-results/
   playwright-report/
   blob-report/
   .vitest/
   .claude/
   .impeccable/
   .agents/
   _to_delete/
   *.log
   .env
   .env.*
   *.local
   ```
3. **Vor dem ersten Commit prüfen**, dass keine Geheimnisse dabei sind: `git status` und `git add -n .` ansehen. Es dürfen **keine** `.env`-Dateien, Passwörter, Service-Role-Keys oder Tokens hinein. Der Supabase-Publishable-Key (`sb_publishable_…`) und die Projekt-URL sind öffentlich und dürfen drinbleiben. Wenn du etwas Verdächtiges findest: anhalten und Ahmed fragen.
4. Erster Commit „Technik: Aufträge, Migrationen, Tests“, Remote `origin` auf das Repository oben setzen, `git push -u origin main`.
5. Danach auf GitHub kontrollieren (oder `git ls-remote`), dass der Push angekommen ist, und mir die Anzahl der Dateien im Commit nennen.

**Nicht** den Ordner `App` oder den Prototyp-Ordner `petconnect-github` hier hineinkopieren – die haben eigene Repositories.

## Teil B – react-router aktualisieren (App)

`npm audit` meldet 2 mittlere Schwachstellen in `react-router-dom`.

1. Im Ordner `App`: aktuelle Version prüfen (`npm ls react-router-dom react-router`) und `npm audit` ausgeben.
2. Auf die aktuelle stabile Version aktualisieren, die die Meldungen behebt. Bei React Router 7 heißt das Paket `react-router` (Imports von `react-router-dom` auf `react-router` umstellen; `react-router-dom` entfernen). Folge der offiziellen Upgrade-Anleitung von v6 auf v7, falls ein Major-Sprung nötig ist.
3. Nichts am Verhalten der App ändern. Wichtig sind besonders:
   - Weiterleitung zur Anmeldung und zurück (`RequireAuth`, inkl. ausstehender Einladung),
   - Einladungslinks,
   - Netlify-Weiterleitung `/* /index.html 200` muss weiter funktionieren (direkt eine Unterseite aufrufen).
4. `npm audit` danach: keine Meldungen mehr zu react-router. Andere Meldungen nur nennen, nicht blind `npm audit fix --force` ausführen.
5. Prüfen: `npm run lint`, `npm run build`, alle Unit- und E2E-Tests (`app.e2e.ts`, `familie.e2e.ts`, `tierakte.e2e.ts`). Alles muss grün sein.
6. Commit „react-router aktualisiert“ in `App` und `git push`. Netlify veröffentlicht dann automatisch.

## Allgemein

- `.env.local` nicht lesen und nicht hinzufügen.
- Keine Dateien löschen, die nicht zu diesem Auftrag gehören.
- Zum Schluss kurze Zusammenfassung: was gemacht wurde, Versionen vorher/nachher, Testergebnisse, offene Punkte.
