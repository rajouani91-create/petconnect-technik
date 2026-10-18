# Auftrag 08: Praxissuche

Lies diesen Auftrag ganz, bevor du anfängst. Baue auf dem aktuellen Stand von `main` auf (Aufträge 01–07 erledigt).

## Ziel

Halter:innen finden Tierarztpraxen in ihrer Nähe – **auch Praxen, die (noch) nicht bei PetConnect sind** – und können nach Tierart, Leistungen und Fachtierarzt-Bezeichnung filtern, wie im Prototyp (`Projekt Petconnect\index.html`, Etappe 20 „Praxissuche“, Schlüssel `ps…`, `svc…`, `f…`, `nb…`). Texte von dort übernehmen, **in der App immer „Sie“**. Keine erfundenen Praxen, keine Beispieldaten.

Die Praxisdaten kommen aus **OpenStreetMap** (Lizenz ODbL). Grunddaten (Name, Adresse, Lage, Telefon, Webseite, Öffnungszeiten) gibt es für alle Praxen. **Angebot** (Tierarten, Leistungen, Fachtitel) gibt es nur für Praxen mit Profil – das tragen später die Praxen selbst ein. Bis dahin hat noch keine Praxis ein Profil; die Filter müssen trotzdem vollständig funktionieren (Tests mit Fake-Daten).

## Datenbank – schon live, nichts ändern

Migrationen `Technik\supabase\migrations\20261017100000_praxissuche_osm.sql` und `20261017110000_osm_import_laender.sql` sind ausgeführt, der erste Import aus OpenStreetMap läuft auf dem Server; danach monatlich automatisch. **Keine Migration ausführen.** DB-Test liegt fertig in `Technik\tests\app\db_09_praxissuche.sql` (26 Prüfungen).

Tabellen (nur lesen, außer Favoriten/Einladungswünsche):
- `practices`: `id`, `name`, `street`, `housenumber`, `postcode`, `city`, `lat`, `lon`, `phone`, `website`, `opening_hours` (OSM-Syntax), `registered` (bei PetConnect), `active`.
- `practice_profiles`: `practice_id`, `species[]`, `services[]`, `titles[]`, `focus[]`, `titles_verified`.
- `postal_codes`: `postcode`, `place`, `lat`, `lon`.
- `practice_favorites` (eigene): `practice_id` anlegen/löschen.
- `practice_invite_requests` (eigene): „Praxis einladen“ – speichert nur den Wunsch, **es wird nichts versendet**.

RPCs:
- **`geocode_place(p_q)`** → bis zu 10 Treffer `{postcode, place, lat, lon}`; 5-stellige PLZ exakt, sonst Ortsanfang.
- **`search_practices(p_lat, p_lon, p_radius_km, p_species, p_services, p_titles, p_q, p_limit)`** → Praxen im Umkreis (max. 100 km), sortiert nach Entfernung, mit `distance_km`, Profilfeldern, `has_profile`, **`matches`** (alle gewählten Filter erfüllt; Praxen ohne Profil sind nie `matches`) und `is_favorite`.

Schlüssel (so in der DB, Anzeige über i18n mit den Prototyp-Texten):
- Tierarten: `dog`, `cat`, `rabbit`, `guinea`, `bird`, `reptile`, `horse`
- Leistungen: `surgery` (Operationen), `dentistry` (Zahnheilkunde), `imaging` (Röntgen und Ultraschall), `ct_mri` (CT oder MRT), `blood_bank` (Blutspende und Blutbank), `hibernation` (Überwinterung/Winterstarre-Betreuung), `home_visits` (Hausbesuche), `emergency_24h` (24-h-Notdienst), `physio` (Physiotherapie), `equine_mobile` (Fahrpraxis für Pferde)
- Fachtitel: `small_animals`, `surgery`, `reptiles`, `birds`, `horses` (Fachtierarzt für Kleintiere / Chirurgie / Reptilien / Zier-, Zoo- und Wildvögel / Pferde)

Die Listen liegen in **einer** Datei (z. B. `src/lib/practiceCatalog.ts`), damit sie später leicht erweitert werden können.

`database.types.ts` von Hand ergänzen (App und Technik).

## Oberfläche

### Einstieg
- Neuer Bereich **„Praxen“** (`/praxen`). In der unteren Leiste: die vier wichtigsten Punkte (Übersicht, Termine, Tierakte, Praxen) und **„Mehr“** für den Rest (Erinnerungen, Profil, Familie …). Damit ist das 320-px-Problem aus Auftrag 06 gelöst.
- Von der Notfallkarte und aus „Termin eintragen“ ein Link „Praxis suchen“.

### 1. Wo suchen
- Eingabefeld **„Ort oder PLZ“** mit Vorschlagsliste aus `geocode_place` (Combobox nach WAI-ARIA, Tastatur bedienbar).
- Knopf **„Mein Standort“** → `navigator.geolocation` (nur nach Klick, nie automatisch). Bei Ablehnung freundlicher Hinweis, Ortseingabe bleibt möglich. Der Standort wird **nicht gespeichert** und nur für die Suche verwendet.
- Umkreis: 5 / 10 / 25 / 50 km (Standard 10).
- Optional Namenssuche („Praxisname“).
- Letzte Ortswahl darf in `localStorage` gemerkt werden (nur PLZ/Ort, keine Koordinaten vom Gerät).

### 2. Filter (wie Prototyp)
- **„Für welches Tier?“** – Chips „Alle Tierarten“ + die 7 Arten; bei eigenen Tieren Zusatz „Hund · Luna“ (nicht verstorbene Tiere).
- **„Was brauchen Sie?“** – Chips der 10 Leistungen (Mehrfachauswahl).
- **„Fachtierarzt-Bezeichnung“** – Chips der 5 Titel (Mehrfachauswahl).
- **„Jetzt geöffnet“** – Schalter. Auswertung von `opening_hours` in der App mit einer gepflegten Bibliothek (z. B. `opening_hours` oder `simple-opening-hours`; Lizenz im Bericht nennen). Praxen ohne Öffnungszeiten werden bei aktivem Schalter **nicht** ausgeblendet, sondern unten mit „Öffnungszeiten unbekannt“ gezeigt.
- Chips mit `aria-pressed`, Gruppen mit Überschrift (`role="group"` + `aria-labelledby`).
- „Filter zurücksetzen“.
- Filter stehen in der URL (`?plz=65428&r=10&tier=reptile&l=hibernation&t=reptiles`), damit man Suchen teilen und zurückspringen kann.

### 3. Ergebnis
- Zähler oben (`aria-live="polite"`): „{n} Praxen passen“ / „1 Praxis passt“ – gezählt werden nur `matches`. Ohne gesetzte Angebots-Filter zählen alle Praxen im Umkreis.
- Liste 1: **Treffer** (mit Profil, alle Filter erfüllt), sortiert nach Entfernung (wahlweise Name).
- Liste 2: **„Noch nicht bei PetConnect – Angebot unbekannt, bitte anrufen“** – Praxen ohne Profil im Umkreis (nur sichtbar, wenn Angebots-Filter gesetzt sind; sonst stehen alle in einer Liste mit Hinweis „Angebot unbekannt“).
- Keine Treffer: Text `psNone` + „Filter zurücksetzen“.
- **Praxis-Karte**: Name, Adresse, Entfernung („2,3 km“), heute geöffnet/geschlossen + Zeiten heute (falls bekannt), Telefon, Webseite. Bei Profil: „Behandelt: …“, „Angebot: …“, Schwerpunkt, Fachtitel mit Kennzeichen **„geprüft“** nur wenn `titles_verified`, sonst **„Angabe der Praxis“**. Bei `registered`: Hinweis „bei PetConnect“, sonst „noch nicht bei PetConnect“.
- Aktionen: **Anrufen** (`tel:`), **Route** (Link `https://www.openstreetmap.org/directions?to=lat,lon` und – auf Apple-Geräten – `maps://`; außerdem Google-Maps-Link `https://www.google.com/maps/dir/?api=1&destination=lat,lon`), **Webseite**, **Favorit** (Stern, `aria-pressed`), **„Als Stammpraxis übernehmen“** (Tier wählen → schreibt `vet_name` und `vet_phone` in `pets`, nur für Tiere mit Schreibrecht; Bestätigung „{Praxis} ist jetzt Stammpraxis von {Tier}.“), bei nicht registrierten **„Praxis einladen“** (Dialog: „Wir merken uns Ihren Wunsch und laden {Praxis} zu PetConnect ein. Es wird nichts in Ihrem Namen gesendet.“ → `practice_invite_requests`).
- Abschnitt **„Meine Favoriten“** oberhalb der Suche (falls vorhanden).
- **Keine Karte (Map) in diesem Auftrag** – nur Liste. (Kartenansicht später.)

### 4. Hinweise und Pflichtangaben
- Unter der Liste: `psNote` (in Sie-Form): „Tierarten, Leistungen und Fachtierarzt-Bezeichnungen gibt jede Praxis selbst in ihrem Profil an. Fachtierarzt-Bezeichnungen mit dem Zeichen „geprüft“ haben wir mit der Tierärztekammer abgeglichen.“
- **Quellenangabe (Pflicht, ODbL):** „Praxisdaten: © OpenStreetMap-Mitwirkende“ mit Link auf `https://www.openstreetmap.org/copyright`. Zusätzlich: „Fehlt eine Praxis oder stimmt etwas nicht? Sie können es bei OpenStreetMap ergänzen.“ mit Link `https://www.openstreetmap.org/note/new#map=18/{lat}/{lon}` je Praxis („Fehler melden“).
- Nie den Eindruck erwecken, nicht registrierte Praxen seien Partner von PetConnect.

### Allgemein
- i18n (de + vorhandene Sprachen), „Sie“.
- WCAG 2.2 AA wie bisher; Ergebnisliste als Liste (`<ul>`), Überschriften-Hierarchie, Fokus nach Suche auf den Zähler.
- Ladezustand und Fehlertext („Die Suche ist gerade nicht erreichbar. Bitte versuchen Sie es gleich noch einmal.“).
- Kein Tracking, keine Weitergabe des Standorts.

## Tests (Pflicht)

1. **Unit**: Filter → RPC-Parameter, URL ↔ Filter (hin und zurück), Zähltext, Entfernungsformat, „Jetzt geöffnet“ inkl. Praxen ohne Zeiten, Routen-Links, Katalog vollständig übersetzt (alle Schlüssel in allen Sprachen).
2. **E2E `praxen.e2e.ts`** mit `fake-supabase.ts` (Tabellen + `geocode_place` + `search_practices` mit denselben Regeln; Fake-Praxen nur in Tests):
   - PLZ eingeben → Vorschlag → Ergebnisse nach Entfernung.
   - „Mein Standort“ (Geolocation in Playwright simulieren) und Ablehnung.
   - Reptil + Überwinterung + Fachtierarzt für Reptilien → nur die passende Praxis als Treffer; Praxen ohne Profil im zweiten Abschnitt.
   - Keine Treffer → Hinweis + Zurücksetzen.
   - Umkreis ändern; Namenssuche; URL-Parameter wiederherstellen (Reload).
   - „Jetzt geöffnet“ mit fester Uhrzeit (Playwright `clock`).
   - Favorit setzen/entfernen, erscheint unter „Meine Favoriten“.
   - „Als Stammpraxis übernehmen“ → Notfallkarte zeigt Praxis und Telefon.
   - „Praxis einladen“ → Dialog, Wunsch gespeichert, Knopf zeigt „Einladung vorgemerkt“.
   - Quellenangabe OSM sichtbar.
   - Untere Leiste mit „Mehr“ bei 320 px ohne seitliches Scrollen.
   - Tastaturbedienung (Combobox, Chips, Dialoge).
3. `db_09_praxissuche.sql` liegt bereit – nur ausführen, wenn lokale Test-DB vorhanden.

Alle bisherigen Tests bleiben grün.

## Abschluss

1. `npm run lint`, `npm run build` sauber; neue Abhängigkeiten mit Lizenz und `npm audit` nennen.
2. Alle Tests, Ergebnis zusammenfassen.
3. Commit in `App` („Praxissuche“) + `git push`; Test-Änderungen in `Technik` committen und pushen.
4. `.env.local` nicht lesen oder hinzufügen. Nichts löschen, was nicht zum Auftrag gehört. Keine temporären Dateien außerhalb des Projekts verschieben oder löschen.
5. Kurze Zusammenfassung mit offenen Punkten.
