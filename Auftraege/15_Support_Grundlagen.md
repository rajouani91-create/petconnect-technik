# Auftrag 15: Support-Grundlagen (Entwurf)

Entwurf zur Abstimmung. Teil 1 von Punkt 7 (Admin-Portal). Ohne Analyse (Auftrag 16) und ohne „Als Nutzer anmelden“ (Auftrag 17).

Baue auf dem aktuellen Stand von `main` auf. Vorher klären, welche lokalen Änderungen gepusht sind.

## Ziel

Ein eigener Bereich für Support-Mitarbeitende. Sie finden Halterinnen und ihre Tiere, sehen den Kontostatus, lösen einen Passwort-Reset aus und bearbeiten Support-Anfragen. Sie können nichts ändern, was über das hinausgeht.

## Rollen (serverseitig)

- Rollen liegen in einer eigenen Tabelle `staff_roles` (`user_id`, `role` mit den Werten `admin` oder `support`, `created_at`). Die Tabelle wird per Migration angelegt. **Vor dem Ausführen melden.**
- Rechte werden in der Datenbank per RLS und Funktion geprüft, nicht nur in der Oberfläche. Eine Funktion `private.is_staff(role)` mit `SECURITY DEFINER` liefert `true` oder `false`.
- Ein normaler Nutzer kann die Tabelle nicht lesen oder schreiben.
- Die erste Rolle `admin` wird manuell per SQL gesetzt, durch dich.
- Der Bereich ist unter `/admin` erreichbar. Ohne Rolle: Weiterleitung auf die Startseite, keine Fehlermeldung mit Details.

## Umfang

### 1. Benutzersuche
- Suchfeld für Name, E-Mail oder Tiername. Mindestens drei Zeichen.
- Ergebnis: Halterin, Registrierungsdatum, Kontostatus, Liste der Tiere (Name, Art).
- Keine Anzeige von Gesundheitsdaten, Dokumenten, Notizen oder Rechnungen. Nur Stammdaten und Anzahl der Einträge.

### 2. Kontostatus
- Status: aktiv, gesperrt, ausstehend (noch nicht bestätigt).
- Sperren und Freigeben nur mit Bestätigungsdialog und Angabe eines Grundes (Pflichtfeld, Freitext, max. 200 Zeichen).
- Jede Sperrung und Freigabe wird protokolliert (wer, wann, welcher Nutzer, Grund).

### 3. Passwort-Reset
- Knopf „Reset-Link senden“. Die Mail geht an die Adresse des Kontos über den bestehenden Reset-Mechanismus der Anmeldung.
- Der Support sieht das Passwort nie. Er sieht nur „Link gesendet am …“.
- Protokolleintrag wie bei Punkt 2.

### 4. Ticket-Übersicht
- Liste der Support-Anfragen mit Status: Neu, In Bearbeitung, Gelöst.
- Filter nach Status. Sortierung: neueste zuerst.
- Status ändern, interne Notiz hinzufügen.
- Quelle der Tickets: Kontaktanfragen über die App. Die Tabelle `support_tickets` wird ebenfalls per Migration angelegt. **Vor dem Ausführen melden.**

### 5. Ankündigungen
- Banner für alle Nutzer mit Text, Beginn und Ende (z. B. Wartungsarbeiten).
- Anzeige oben in der App, schließbar, pro Nutzer nur einmal bis zum Ende gespeichert.

## Nicht Teil dieses Auftrags

- Besucher- und Nutzungsstatistik (Auftrag 16, nach Datenschutzkonzept).
- „Als Nutzer anmelden“ (Auftrag 17, nach Entscheidung zu Protokoll und Zustimmung).
- Fehler-Logs mit Push- und Upload-Fehlern. Eigener Schritt, weil die Daten aus mehreren Stellen kommen.
- Rassen-Korrektur bei der KI (Stufe 2).

## Technik

- Seite `src/pages/admin/Admin.tsx` mit Unterseiten für Suche, Konto, Tickets und Ankündigungen.
- Zugriff nur über Funktionen, die die Rolle prüfen. Keine Tabelle direkt aus dem Frontend für Staff-Daten.
- Protokolltabelle `staff_audit` (`id`, `staff_id`, `action`, `target_user_id`, `reason`, `created_at`), nur einfügbar, nicht änderbar und nicht löschbar.
- i18n für alle Texte in 11 Sprachen, „Sie“. WCAG 2.2 AA.
- Datenschutz: Support-Zugriffe auf Konten sind Verarbeitung personenbezogener Daten. Vor dem Live-Gang im Datenschutztext ergänzen. Kommentar `// RECHTLICH PRÜFEN` setzen.

## Tests (Pflicht)

1. **DB-Test** `db_14_staff.sql`: Normaler Nutzer kann `staff_roles` nicht lesen, Support kann Konten suchen, Support kann nicht sperren (nur Admin), Protokoll ist nicht änderbar.
2. **Unit** `admin.test.ts`: Suche (Mindestlänge, Groß- und Kleinschreibung), Grund-Pflichtfeld und Maximallänge, Statusübergänge der Tickets.
3. **E2E** `admin.e2e.ts`:
   - Ohne Rolle: Weiterleitung.
   - Support: sucht, öffnet ein Konto, sieht keine Gesundheitsdaten.
   - Sperren nur mit Grund, Protokolleintrag entsteht.
   - Reset-Link: Hinweis „Link gesendet“, kein Passwort sichtbar.
4. Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build`, alle Tests.
2. Migrationen (`staff_roles`, `support_tickets`, `staff_audit`) erst nach Freigabe in `Technik` anlegen, dann committen und pushen.
3. Commit in `App` („Support-Grundlagen“), jeweils `git push`.
4. `.env.local` nicht lesen. Nichts löschen, was nicht zum Auftrag gehört.
5. Kurze Zusammenfassung mit offenen Punkten.

## Entscheidungen

1. **Erster Admin:** Eigenes Admin-Konto, nicht das Halterkonto. Die Rolle `admin` setzt Ahmed selbst per SQL. Zugangsdaten gehören nicht in Dateien oder in den Chat.
2. **Tickets:** Anfragen kommen per E-Mail an info@petconnect24.com (Weiterleitung über Namecheap an Gmail). Es gibt in diesem Auftrag kein Kontaktformular. Tickets werden von Hand in der App angelegt, Felder: Absender, Betreff, Status, Notiz. Die Tabelle `support_tickets` bleibt dafür.
3. **Migrationen:** Freigegeben (`staff_roles`, `support_tickets`, `staff_audit`). Umsetzung erst nach dem Commit der lokalen Änderungen.

## Hinweis

Das Passwort für das Admin-Konto wurde im Chat genannt. Ich habe es nicht übernommen und nicht verwendet. Bitte ändere es, weil es jetzt im Verlauf steht.
