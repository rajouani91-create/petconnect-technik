# Auftrag 01: PetConnect App, Grundgerüst (Halter-Seite)

Du baust das erste lauffähige Grundgerüst der PetConnect-App. PetConnect ist eine Tiergesundheits-App für Tierhalter (später auch Praxen). Ein fertiger Klick-Prototyp liegt als `..\index.html` (eine Datei, nur Demo-Daten im Browser). Jetzt entsteht die echte App mit Konto und Datenbank.

Arbeite im Ordner `C:\Users\user\Desktop\Projekt Petconnect\App` (neu anlegen). Ändere nichts außerhalb dieses Ordners, außer Lesen von `..\index.html` und `..\Technik\supabase\`.

## 1. Technik

- Vite + React + TypeScript (strict), Paketmanager npm.
- `@supabase/supabase-js` v2, `react-router-dom` v6.
- Kein UI-Framework. Eigenes CSS mit Design-Tokens (siehe 4).
- PWA-Grundlage: `manifest.webmanifest` mit Name „PetConnect“, theme_color aus den Tokens. Service Worker erst später.
- Vitest für Logik-Tests.
- Dev-Server auf **Port 3000** (`vite.config.ts`: `server.port = 3000, strictPort: true`). Supabase leitet Bestätigungs-Mails standardmäßig auf `http://localhost:3000` zurück.
- `git init` im Ordner `App`, erster Commit. **Nicht pushen**, kein Remote anlegen.

## 2. Supabase-Verbindung

Datei `App/.env.local` (steht in `.gitignore`):

```
VITE_SUPABASE_URL=https://cpnbkegojxagbzkomzap.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Z9Hqy3mDvGOpcdXjmJeTOg_wv4V7RE9
```

Zusätzlich `App/.env.example` mit denselben Namen, aber leeren Werten.

- Kopiere `..\Technik\supabase\database.types.ts` nach `src/lib/database.types.ts`.
- `src/lib/supabase.ts`: `createClient<Database>(url, key)`, mit Fehlermeldung, falls eine Variable fehlt.
- Niemals einen `service_role`- oder `sb_secret_`-Schlüssel verwenden. Die Sicherheit kommt aus Row Level Security in der Datenbank.

### Datenbank (existiert schon, nicht ändern)

Das Schema steht in `..\Technik\supabase\migrations\`. Kurzfassung:

- `profiles` (id = auth-User, display_name, language). Wird bei Registrierung **automatisch per Trigger** angelegt aus den Metadaten `display_name` und `language`. Nicht selbst einfügen.
- `pets` (owner_id setzt die DB selbst, name, species, species_other, breed, sex `female|male`, birth_date, chip_no, cat_outdoor, stable, allergies, medications, emergency_contact, deceased).
  - species: `dog|cat|rabbit|guinea|bird|reptile|horse|other`. Bei `other` ist `species_other` Pflicht (DB-Constraint).
- `routine_items` (pet_id, kind `walk|feed|med|litter|cage|terra|muck|own`, label, time_of_day `HH:MM`, repeat `daily|weekdays|weekends`, reminder_on).
- `routine_done` (routine_item_id, done_on Datum, eindeutig pro Eintrag und Tag).
- `weights`, `vaccinations` (in diesem Auftrag noch nicht nutzen).

Jeder Nutzer sieht nur seine eigenen Zeilen (RLS). `owner_id` nie vom Client mitschicken.

## 3. Seiten und Ablauf

Mobile-first, Breite ab 320 px ohne seitliches Scrollen. Ab 900 px darf der Inhalt mittig mit max. 720 px stehen; Navigation dann links statt unten.

1. **Willkommen / Anmelden / Registrieren** (`/login`, `/registrieren`)
   - Registrierung: Anzeigename, E-Mail, Passwort (min. 8 Zeichen), Sprache (Auswahl, Vorbelegung aus Browser). `supabase.auth.signUp` mit `options.data = { display_name, language }`.
   - Danach Hinweis: „Wir haben Ihnen eine E-Mail geschickt. Bitte bestätigen Sie Ihre Adresse.“ (E-Mail-Bestätigung ist in Supabase an.)
   - Anmeldung mit E-Mail und Passwort, „Passwort vergessen“ über `resetPasswordForEmail`.
   - Fehler am Feld anzeigen (`aria-invalid`, `aria-describedby` auf die Fehlermeldung), nicht nur oben.
2. **Geschützter Bereich**: ohne Sitzung Weiterleitung auf `/login`. Sitzung über `onAuthStateChange` halten.
3. **Erstes Tier anlegen** (`/tier/neu`), erscheint automatisch, wenn noch kein Tier existiert.
   - Name (Pflicht), Tierart als 8 Kacheln (Buttons mit `aria-pressed`): Hund, Katze, Kaninchen, Meerschweinchen, Vogel, Reptil, Pferd, Anderes Tier. Hund vorausgewählt.
   - Bei „Anderes Tier“: Pflichtfeld „Welche Tierart?“. Bei Katze: Wohnungskatze / Freigänger. Bei Pferd: Feld „Stall / Hof“.
   - Optional: Rasse, Geschlecht, Geburtsdatum, Chipnummer.
   - Vorlagen-Karte unter der Auswahl zeigt den Tagesplan der Art (siehe 5) und den Schalter „Vorlage übernehmen“ (an). Hinweis in der Karte: „Vorschlag, noch nicht tierärztlich geprüft.“
   - Speichern: Tier einfügen, dann bei Vorlage = an alle Plan-Einträge als `routine_items` einfügen.
4. **Heute** (`/`, Startseite)
   - Begrüßung mit Anzeigename.
   - Karte „Als Nächstes“: nächster fälliger Eintrag des aktiven Tiers (Uhrzeit, Art, „in 25 Min.“ / „Jetzt“). Button „Erledigt“ schreibt in `routine_done` (heutiges Datum, Zeitzone Europe/Berlin).
   - Liste „Heute“: alle heutigen Einträge mit Häkchen-Status. Wochenend-/Wochentags-Einträge nur an passenden Tagen.
   - Tier-Umschalter oben, wenn mehrere Tiere.
5. **Alltag** (`/alltag`): Tagesplan des Tiers.
   - Liste mit Uhrzeit, Art, eigener Bezeichnung, Wiederholung.
   - Pro Eintrag ein Schalter „Erinnerung“ (`role="switch"`, schreibt `reminder_on`). Oben ein Schalter „Alle Erinnerungen“.
   - Eintrag hinzufügen (Art, Uhrzeit, Wiederholung, bei „Eigenes“ eine Bezeichnung) und löschen mit Rückfrage im Dialog (kein `confirm()`).
   - Hinweis: Echte Push-Erinnerungen kommen in einem späteren Auftrag. Der Schalter speichert nur die Einstellung.
6. **Tier** (`/tier`): Stammdaten ansehen und bearbeiten, weiteres Tier anlegen.
7. **Mehr** (`/mehr`): Sprache ändern (schreibt `profiles.language`), Abmelden.
8. **Termine**: nur Platzhalter-Seite „Kommt bald: Termine bei Ihrer Praxis“.

Untere Navigation (5 Punkte): Heute, Termine, Tier, Alltag, Mehr. Zusätzlich gut sichtbarer **Notfall**-Button oben rechts, der vorerst eine Seite mit „Im Notfall: Tierärztlichen Notdienst anrufen“ und dem Notfallkontakt des Tiers zeigt. Keine erfundenen Praxen oder Telefonnummern.

## 4. Gestaltung

- Übernimm Farben, Schriften, Radien und Abstände aus den CSS-Variablen in `..\index.html` (`:root`) als `src/styles/tokens.css`. Auch den Dark Mode, falls dort vorhanden.
- Kontraste nach WCAG 2.2 AA, Touch-Ziele mind. 44 × 44 px, sichtbarer Fokus, `prefers-reduced-motion` beachten.
- Icons als Inline-SVG, keine externen Bilder oder Schriften von fremden Servern.

## 5. Vorlagen je Tierart

`src/lib/templates.ts`, als reine Funktion `templateFor(species)` → Liste von `{kind, time, repeat}`:

| Art | Tagesplan |
|---|---|
| dog | walk 07:00, feed 07:30, walk 12:30, walk 18:00, feed 18:30, walk 21:30 (alle daily) |
| cat | feed 07:00, feed 18:30, litter 20:00 (daily) |
| rabbit | feed 07:30, feed 18:00 (daily), cage 10:00 (weekends) |
| guinea | feed 07:30, feed 18:00 (daily), cage 10:00 (weekends) |
| bird | feed 08:00 (daily), cage 10:00 (weekends) |
| reptile | terra 09:00 (daily) |
| horse | feed 07:00, muck 08:00, feed 18:00 (daily) |
| other | keine Vorlage |

Die Vorsorge-Listen aus dem Prototyp kommen in einem späteren Auftrag.

## 6. Sprachen

- 11 Sprachen: de, en, fr, ar, nl, es, ru, tr, sv, da, no. Arabisch mit `dir="rtl"` am `<html>`.
- Eigene kleine i18n-Lösung: `src/i18n/<lang>.ts`, Funktion `t(key, vars)`. Fehlende Schlüssel fallen auf Deutsch zurück und erscheinen in der Konsole als Warnung.
- Deutsch in der **Sie-Form**. Übernimm vorhandene Übersetzungen aus dem Objekt `STR` in `..\index.html`, wo die Texte passen. Neue Texte in allen 11 Sprachen anlegen.
- Datum und Uhrzeit mit `Intl` in der Sprache des Nutzers, Zeitzone Europe/Berlin.

## 7. Struktur

```
App/
  src/
    lib/ supabase.ts, database.types.ts, templates.ts, time.ts
    i18n/ index.ts, de.ts, en.ts, ...
    auth/ AuthProvider.tsx, RequireAuth.tsx
    pages/ Login, Register, Today, Routine, Pet, PetNew, More, Appointments, Emergency
    components/ BottomNav, Switch, SpeciesPicker, Dialog, Field
    styles/ tokens.css, app.css
  public/ manifest.webmanifest
  README.md
```

## 8. Tests und Abnahme

- Vitest: `templateFor` für alle Arten, Fälligkeitslogik in `time.ts` (nächster Eintrag, Wochenende/Wochentag, „Jetzt“ bei Überfälligkeit bis 30 Min.), i18n-Fallback.
- `npm run build` und `npm run test` müssen fehlerfrei laufen, `tsc` ohne Fehler.
- `README.md` auf Deutsch: Start mit `npm install` und `npm run dev`, wo die `.env.local` hingehört.

Wenn du fertig bist, nenne mir:
1. die Befehle zum Starten,
2. was getestet ist,
3. was bewusst noch fehlt.

Starte danach den Dev-Server, damit ich unter `http://localhost:3000` die erste Registrierung testen kann.
