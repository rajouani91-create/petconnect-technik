# Auftrag 10b: Impressum und Datenschutz ausfüllen

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Auftrag 10 erledigt). Keine Datenbank-Änderung.

## Ziel

Die Platzhalter `[BITTE ERGÄNZEN: …]` in `/impressum` und `/datenschutz` durch die Angaben ersetzen, die schon im Prototyp (`Projekt Petconnect\index.html`, Objekt `LEGAL`, Funktionen `impressumHTML()` und `datenschutzHTML()`) stehen, und die Texte an die echte App anpassen (echte Konten, Netlify statt GitHub Pages, Supabase, Push). Danach darf auf beiden Seiten **kein** `[BITTE ERGÄNZEN` mehr stehen.

## 1. `src/lib/legal.ts`

```ts
export const LEGAL: LegalInfo = {
  name: 'Ahmed Rajouani',
  address: 'Hessenring 104\n65428 Rüsselsheim am Main\nDeutschland',
  email: 'info@petconnect24.com',
  phone: null,
};
```
- Telefon ist **nicht** angegeben: Zeile „Telefon“ im Impressum dann **ganz weglassen** (kein Platzhalter).
- `deleteAccountMailto` nutzt damit automatisch `info@petconnect24.com`.
- Zusätzlich `updated: 'Oktober 2026'` (Stand der Datenschutzerklärung) aufnehmen.

## 2. Impressum (`Imprint`)

Reihenfolge und Wortlaut (Sie-Form, sachlich):
1. **Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)** – Name, Anschrift (Zeilenumbrüche erhalten).
2. **Kontakt** – E-Mail als `mailto:`-Link.
3. **Verbraucherstreitbeilegung** – „Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.“
4. **Haftung für Links** – Text aus dem Prototyp übernehmen.
5. **Kartendaten** – wie bisher (`FACTS.maps`).
- Den Block „Weitere Angaben“ (Rechtsform, Register, USt-ID) **entfernen** – es gibt keine Firma. Im Code einen Kommentar lassen: „Bei Gewerbe/Firma: Rechtsform, Register, USt-ID ergänzen.“
- Den Prototyp-Abschnitt „Hinweis zum Angebot … Prototyp mit Beispieldaten …“ **nicht** übernehmen (die App hat echte Konten).

## 3. Datenschutz (`Privacy`)

Oben den Todo-Hinweis entfernen, „Stand: Oktober 2026“ anzeigen. Abschnitte:

1. **Verantwortlicher** – Name, Anschrift, E-Mail.
2. **Überblick** – PetConnect ist eine App für Tierhalter:innen. Keine Werbung, kein Tracking, keine Analyse-Dienste, keine Cookies zu Werbe- oder Analysezwecken.
3. **Konto und Inhalte** – wie bisher (E-Mail, Anzeigename, Sprache, Angaben zu Tieren: Tierakte, Medikamente, Termine, Erinnerungen, Notfallkarte, Fotos, Dokumente, Versicherung). Zweck: Bereitstellung der App-Funktionen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag). Speicherdauer: bis zur Löschung des Kontos bzw. des Eintrags. Hinweis: Mit Familie/Mithalter:innen oder Sitter geteilte Angaben sehen nur die von Ihnen eingeladenen Personen.
4. **Hosting** – Netlify (`FACTS.hosting`): Server-Logfiles (IP-Adresse, Datum/Uhrzeit, aufgerufene Seite, Datenmenge, Browser/Betriebssystem, Referrer) zur sicheren Auslieferung; Art. 6 Abs. 1 lit. f DSGVO; Löschung nach den Fristen des Anbieters; Netlify, Inc. sitzt in den USA, dabei können Daten in die USA übermittelt werden.
5. **Datenbank und Anmeldung** – Supabase (`FACTS.database`): Daten liegen in Frankfurt am Main; Supabase, Inc. ist ein Unternehmen mit Sitz in den USA.
6. **Push-Benachrichtigungen** – wie bisher, plus Rechtsgrundlage Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch Aktivieren auf dem Gerät), jederzeit widerrufbar unter „Mehr → Benachrichtigungen“. Bei Android über Google Firebase Cloud Messaging (Google, USA).
7. **Standort und Praxissuche** – wie bisher.
8. **Lokale Speicherung im Browser** – Sprache, Anmeldung (Sitzung) und Einstellungen wie „Nicht mehr anzeigen“ werden im lokalen Speicher des Browsers gespeichert, weil die Funktion sonst nicht möglich ist (§ 25 Abs. 2 Nr. 2 TDDDG). Löschbar über die Browser-Einstellungen. (Vor dem Schreiben im Code prüfen, welche `localStorage`-Schlüssel die App tatsächlich nutzt, und genau diese Zwecke nennen.)
9. **Schriftarten** – nur wenn zutreffend (im Code prüfen): „Alle Schriftarten sind lokal eingebunden; es wird keine Verbindung zu Google Fonts aufgebaut.“ Falls doch extern geladen: Abschnitt weglassen und im Bericht melden.
10. **Kontakt per E-Mail** – Text aus dem Prototyp (Art. 6 Abs. 1 lit. b bzw. f DSGVO; Weiterleitung von `info@petconnect24.com` über Namecheap, Inc. (USA) an ein Postfach bei Google (Gmail); Übermittlung in die USA möglich; Löschung, sobald nicht mehr erforderlich).
11. **Konto löschen** – wie bisher, mit der echten Adresse.
12. **Ihre Rechte** – Text aus dem Prototyp (Art. 15, 16, 17, 18, 20, 21, 7 Abs. 3; Beschwerde nach Art. 77 bei: Der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Gustav-Stresemann-Ring 1, 65189 Wiesbaden).
13. **Automatisierte Entscheidungen** – „findet nicht statt“ (Art. 22 DSGVO). Hinweis: Symptom- oder Medikamentenfunktionen geben keine tierärztliche Diagnose und berechnen keine Dosierungen.
14. **Änderungen** – wird angepasst, wenn sich App oder Rechtslage ändern.

Keine weiteren Rechtsbehauptungen erfinden (z. B. keine Aussagen zu Zertifizierungen oder konkreten Verträgen wie „Standardvertragsklauseln abgeschlossen“). Wo Ahmed etwas prüfen muss, **im Code** einen Kommentar `// RECHTLICH PRÜFEN: …` setzen, nicht in der Oberfläche.

## 4. Sonstiges

- `Technik\Android\LIESMICH.md`: Punkt „Impressum/Datenschutz ausfüllen“ auf „ausgefüllt am 18.10.2026 – rechtliche Prüfung steht noch aus“ ändern.
- Store-Eintrag: Die Datenschutz-URL für die Play Console ist `https://petconnect24.com/datenschutz` (in der LIESMICH nennen).

## Tests

- E2E: `/impressum` und `/datenschutz` enthalten „Ahmed Rajouani“, „Hessenring 104“, „info@petconnect24.com“, **kein** „BITTE ERGÄNZEN“, keine Zeile „Telefon“; `mailto:`-Link vorhanden.
- „Konto löschen“-Dialog: `mailto:info@petconnect24.com?subject=…`.
- Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber; alle Tests.
2. Commit in `App` („Impressum und Datenschutz ausgefüllt“) + `git push`; Änderungen in `Technik` committen und pushen.
3. `.env.local` nicht lesen. Nichts löschen, was nicht zum Auftrag gehört.
4. Kurze Zusammenfassung, inkl. der `RECHTLICH PRÜFEN`-Stellen.
