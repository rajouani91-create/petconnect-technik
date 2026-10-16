# Auftrag 07: Notfallkarte, Versicherung, Betreuung, Gesundheitsakte (PDF)

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–06 erledigt). Falls Auftrag 06 noch nicht fertig ist: erst 06 abschließen.

## Ziel

In der Tierakte gibt es wie im Prototyp einen Block **„Mehr zu {Tiername}“** mit Knöpfen. In diesem Auftrag kommen vier davon:

1. **Notfallkarte** – das Wichtigste für den Notfall auf einen Blick, druckbar.
2. **Versicherung** – Versicherungen pro Tier und Einreichungen (Erstattungen) verfolgen.
3. **Betreuung** – zeitlich begrenzter Sitter-Zugang per Link/QR-Code **ohne Anmeldung**, plus Verweis auf Familie & Mithalter:innen.
4. **Gesundheitsakte (PDF)** – alle Daten des Tiers als druckbares Dokument, mit **Impfnachweis**.

Vorbild für Aufbau, Reihenfolge und Wortlaut: Prototyp `Projekt Petconnect\index.html` (Schlüssel `cTitle…`, `iTitle…`, `sit…`, `sos…`, `vlt…`, `mAreas…`). Der Prototyp duzt teilweise – **in der App immer „Sie“**. Keine Demo-Daten, keine erfundenen Versicherungen oder Praxen.

Die übrigen Knöpfe aus dem Prototyp (Gesundheitsbereiche, Teilen & Freigaben, Laborwerte, Vorgeschichte, Weitere Optionen) kommen in einem späteren Auftrag. Zeige sie jetzt **nicht** an.

## Datenbank – schon live, nichts ändern

Migration `Technik\supabase\migrations\20261017010000_notfall_versicherung_betreuung.sql` ist ausgeführt. **Keine Migration ausführen.** DB-Test liegt fertig in `Technik\tests\app\db_08_notfall_versicherung_betreuung.sql` (34 Prüfungen).

**`pets` – neue Spalten** (zusätzlich zu den vorhandenen `chip_no`, `allergies`, `medications`, `emergency_contact`):
| Spalte | Hinweis |
|---|---|
| vet_name | Stammpraxis (Freitext), ≤ 120 |
| vet_phone | Telefon Stammpraxis, ≤ 40 |
| owner_phone | Telefon Halter:in für die Notfallkarte, ≤ 40 |

**`pet_insurances`**: `pet_id`, `insurer` (Pflicht, 1–120), `policy_no` (Pflicht, 1–60), `holder_name` (≤ 120), `deductible` (Selbstbeteiligung €, ≥ 0), `reimbursement_pct` (0–100), `submission` (`portal`, `email`, `post`, `app`, `other`), `note` (≤ 500). Mehrere pro Tier.

**`insurance_claims`**: `insurance_id` + `pet_id` (müssen zusammenpassen), `title` (1–120), `amount` (> 0), `claim_date`, `status` (`open` offen, `submitted` eingereicht, `query` Rückfrage, `partial` teilweise erstattet, `reimbursed` erstattet, `rejected` abgelehnt), `reimbursed_amount` (≤ amount), `document_id` (optional, Dokument **desselben Tiers** aus `pet_documents`; wird beim Löschen des Dokuments leer), `note`.

**`sitter_access`**: `pet_id`, `sitter_name` (1–80), `valid_from`, `valid_to` (≥ von, höchstens 92 Tage), `feeding` (Fütterung & Pflege, ≤ 2000), `care_notes` (Medikamente & Hinweise, ≤ 2000), `token` (automatisch, 64 Zeichen, **nicht änderbar, nie loggen**), `revoked_at`. Sichtbar nur für owner/carer (viewer sehen keine Sitter-Links).

**RPC `sitter_view(p_token text)`** – auch **ohne Anmeldung** (Rolle `anon`) aufrufbar. Liefert JSON:
- `status`: `ok`, `not_yet` (nur `valid_from` und `pet_name`), `expired`, `revoked`, `not_found`
- bei `ok`: `sitter_name`, `valid_from`, `valid_to`, `feeding`, `care_notes`, `pet{name,species,species_other,breed,chip_no,allergies,medications}`, `owner_name`, `owner_phone`, `emergency_contact`, `vet_name`, `vet_phone`.
Keine Versicherung, keine Dokumente, keine Rechnungen, keine Gesundheitsakte.

Rechte allgemein: Mitglieder lesen (außer Sitter-Zugänge), owner und carer schreiben, viewer nur lesen.

`database.types.ts` von Hand ergänzen (App und Technik).

## Oberfläche

### „Mehr zu {Tiername}“ in der Tierakte
Karte mit Knöpfen: **Notfallkarte**, **Versicherung**, **Betreuung**, **Gesundheitsakte (PDF)**, außerdem „Gewicht & Verlauf“ (springt zum vorhandenen Bereich). Jede Unterseite hat „Zurück zur Tierakte“. Eigene URLs, z. B. `/tiere/:id/notfallkarte`, `/tiere/:id/versicherung`, `/tiere/:id/betreuung`, `/tiere/:id/gesundheitsakte` (an die vorhandene Routen-Struktur anpassen).

### 1. Notfallkarte
- Titel „Notfallkarte für {Name}“, Untertitel „Das Wichtigste für den Notfall, auf einen Blick“.
- Felder: Tier (Name, Art, Rasse, Foto falls vorhanden), Halter:in (Anzeigename) + Telefon, Chip, Allergien & Vorerkrankungen, Medikamente, Stammpraxis + Telefon, Notfallkontakt (Name, Telefon). Leere Felder: „Nichts eingetragen“.
- Telefonnummern als `tel:`-Links. Großer Knopf „Stammpraxis anrufen“, wenn eine Nummer da ist, sonst Hinweis „Noch keine Stammpraxis eingetragen.“
- „Bearbeiten“ (owner/carer): Formular für `owner_phone`, `chip_no`, `allergies`, `medications`, `vet_name`, `vet_phone`, `emergency_contact`.
- Abschnitt „Auf dem Weg“ mit den drei allgemeinen Hinweisen aus dem Prototyp (`sosTip1–3`, in Sie-Form) und dem Satz „Allgemeine Hinweise, sie ersetzen keine tierärztliche Beratung.“ Keine weiteren medizinischen Ratschläge.
- **„Karte drucken“**: Druckansicht im Kartenformat (Print-CSS, `window.print()`), schwarz auf weiß, ohne Navigation.
- Auf der **Übersicht** ein gut sichtbarer Knopf **„Notfall“** → Notfallkarte (bei mehreren Tieren erst Tier wählen).

### 2. Versicherung
- Liste der Versicherungen des Tiers: Versicherung, Nummer, Versicherungsnehmer:in, Selbstbeteiligung, Erstattungsquote, Einreichungsweg. Hinzufügen, ändern, entfernen (Dialog). Leer: „Noch keine Versicherung eingetragen.“
- Pro Versicherung **Einreichungen**: Bezeichnung, Datum, Rechnungsbetrag, Status, erstatteter Betrag, verknüpftes Dokument (Auswahl aus den Dokumenten des Tiers, bevorzugt Kategorie „Rechnung“; Öffnen über signierte URL wie in der Dokumentenablage).
- Status-Auswahl mit Text („offen“, „eingereicht“, „Rückfrage“, „teilweise erstattet“, „erstattet“, „abgelehnt“). Hinweis: „Den Status tragen Sie selbst ein. Er ist nicht von der Versicherung bestätigt.“
- Wenn Quote gesetzt: „Unverbindliche Schätzung: ca. {Betrag × Quote} € Erstattung (ohne Selbstbeteiligung gerechnet). Die Versicherung entscheidet verbindlich.“
- Summen pro Versicherung: eingereicht gesamt, erstattet gesamt, offen.
- Keine Versicherungsliste, keine Portale, keine Weiterleitung an Versicherungen in diesem Auftrag.

### 3. Betreuung
- Titel „Betreuung durch Sitter und Familie“, Untertitel „Geben Sie Sitter oder Vertretung zeitlich begrenzten Zugriff auf das Nötigste.“
- **Sitter-Zugang erstellen** (owner/carer): Name, von, bis (max. 92 Tage), Fütterung und Pflege, Medikamente und Hinweise. Fehlertexte wie im Prototyp (`sitNeed`, `sitDateBad`).
- Liste der Zugänge mit Status in Worten: „Startet am …“, „Aktiv bis …“, „Abgelaufen“, „Widerrufen“. Aktionen: Widerrufen (Dialog; setzt `revoked_at`), Löschen, „Sitter-Ansicht ansehen“ (öffnet die öffentliche Seite).
- **Einladung & QR-Code** je Zugang: Link `https://petconnect24.com/betreuung/{token}` (Domain aus `window.location.origin`), QR-Code (kleine, gepflegte Bibliothek, z. B. `qrcode`; SVG), Knöpfe „Link kopieren“, „Teilen“ (`navigator.share`, wenn vorhanden), „WhatsApp“ (`https://wa.me/?text=…`), „E-Mail“ (`mailto:`), „Karte drucken“ (QR + „Scannen für Betreuungsinfos“). Text der Nachricht nach `sitInviteText` (in Sie- bzw. neutraler Form).
- Hinweise: „Sichtbar: Fütterung, Pflege, Medikamente, Notfallkarte und Praxis-Kontakt.“ / „Nicht sichtbar: Rechnungen, Versicherung, Dokumente und persönliche Notizen.“
- Abschnitt **„Partner oder Familie (Mithalter:in)“**: kurzer Text + Knopf, der zur vorhandenen Einladung unter Familie & Mithalter:innen führt (nichts Neues bauen).
- viewer sehen diese Seite nur mit Hinweis „Sitter-Zugänge können nur Halter:in und Mithalter:innen verwalten.“

### Öffentliche Sitter-Seite `/betreuung/:token`
- **Ohne Anmeldung** erreichbar (außerhalb von `RequireAuth`), ruft nur `sitter_view` auf. Keine anderen Abfragen.
- `<meta name="robots" content="noindex, nofollow">` und `Referrer-Policy: no-referrer` (per `<meta name="referrer">`). Token nie in Konsole, Fehlertexte oder Analysen schreiben.
- Inhalt bei `ok`: „Betreuung von {Name}“, „Zugang für {Sitter}, gültig bis {Datum}“, Fütterung & Pflege, Medikamente & Hinweise, Allergien, Medikamente aus der Tierakte, Chip, Halter:in + Telefon, Notfallkontakt, Stammpraxis mit „Praxis anrufen“. Fußnote: „Diese Seite zeigt nur Betreuungsinfos – keine Gesundheitsakte, keine Rechnungen.“
- `not_yet`: „Gilt ab {Datum}.“ – `expired`/`revoked`/`not_found`: „Dieser Link ist nicht mehr gültig. Bitte fragen Sie nach einem neuen.“ (für alle drei derselbe Text).
- Sprache: Gerätesprache, sonst Deutsch. Gut lesbar auf dem Handy, druckbar.
- Netlify: Die vorhandene Weiterleitung `/* /index.html 200` reicht; prüfen, dass `/betreuung/…` direkt aufrufbar ist.

### 4. Gesundheitsakte (PDF)
- Seite „Gesundheitsakte“, Untertitel „Alle Daten von {Name} in einem Dokument zum Speichern, Teilen und Drucken“. Knopf **„Als PDF speichern / drucken“** → `window.print()` mit eigener Print-CSS (A4, Ränder, Seitenumbrüche zwischen Abschnitten, keine Navigation). Keine PDF-Bibliothek nötig.
- Abschnitte: **Stammdaten** (Name, Art, Rasse, Geschlecht, Geburtsdatum, Chip, Halter:in), **Impfnachweis** (Tabelle: Impfung, geimpft am, gültig bis, Status, Herkunft „eigene Angabe“ / „von der Praxis“), **Allergien & Medikamente**, **Gewicht** (Tabelle + kleines Diagramm), **Notfallkontakt & Stammpraxis**, optional **Versicherung** (Checkbox „Versicherung einschließen“, Standard aus).
- Kopf: Logo/Name PetConnect, Tiername. Fuß: „Erstellt am {Datum} mit PetConnect“ und „Einträge sind nach Herkunft gekennzeichnet. Eigene Einträge sind nicht von einer Praxis bestätigt.“
- Dokumente und Rechnungen **nicht** in die Akte aufnehmen.
- Auch viewer dürfen die Akte ansehen und drucken.

### Allgemein
- i18n für alle Texte (de + vorhandene Sprachen), „Sie“.
- WCAG 2.2 AA wie bisher. QR-Code mit Textalternative (Link daneben sichtbar).
- Datums-, Zahlen- und Währungsformat deutsch („1.234,50 €“).

## Tests (Pflicht)

1. **Unit**: Status-Texte der Sitter-Zugänge (Grenzen heute/gestern/morgen), Erstattungs-Schätzung und Summen, Währungsformat, Link-Erzeugung (keine doppelten Slashes, Origin).
2. **E2E `mehr.e2e.ts`** mit `fake-supabase.ts` (Tabellen, neue `pets`-Spalten und `sitter_view` mit denselben Regeln ergänzen):
   - Notfallkarte anzeigen, bearbeiten, `tel:`-Links vorhanden; viewer ohne Bearbeiten; Druckansicht ohne Navigation (Print-Media emulieren).
   - Notfall-Knopf auf der Übersicht.
   - Versicherung anlegen/ändern/löschen; Einreichung mit Status, Schätzung, Summen; Dokument verknüpfen und öffnen.
   - Sitter-Zugang anlegen (Fehlerfälle: kein Name, Ende vor Beginn, > 92 Tage), Link/QR sichtbar, widerrufen.
   - **Öffentliche Seite ohne Anmeldung**: gültig → Infos sichtbar, keine Versicherung/Dokumente; widerrufen/abgelaufen/unbekannt → derselbe Hinweis; zukünftig → „Gilt ab …“. Kein Weiterleiten zur Anmeldung.
   - Gesundheitsakte: Impfnachweis-Tabelle, Gewicht, Versicherung nur mit Checkbox; Druckansicht.
   - viewer: alles lesen, keine Bearbeitung, keine Sitter-Links.
   - Tastaturbedienung der Formulare und Dialoge.
3. `db_08_notfall_versicherung_betreuung.sql` liegt bereit – nur ausführen, wenn lokale Test-DB vorhanden; sonst im Bericht sagen.

Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber.
2. Alle Tests, Ergebnis zusammenfassen.
3. Commit in `App` („Notfallkarte, Versicherung, Betreuung, Gesundheitsakte“) + `git push`.
4. Test-Änderungen in `Technik` committen und pushen.
5. `.env.local` nicht lesen oder hinzufügen. Nichts löschen, was nicht zum Auftrag gehört. Keine temporären Dateien außerhalb des Projekts verschieben oder löschen.
6. Kurze Zusammenfassung mit offenen Punkten.
