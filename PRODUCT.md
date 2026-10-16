# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Zwei gleichrangige Zielgruppen; keine Seite wird priorisiert.

- **Tierhalter:innen** (inkl. Mitbesitzer:innen, Nur-Ansicht-Familienmitglieder und zeitlich begrenzte Tiersitter:innen): verwalten ein oder mehrere Tiere, buchen Termine, führen die Tierakte, prüfen Symptome und brauchen im Notfall schnell den richtigen Weg. Situationen reichen vom ruhigen Pflegen der Akte bis zum akuten Notfall am Handy.
- **Tierarztpraxen** (Praxisteam): arbeiten entlang des Tagesplans, bestätigen/verschieben Buchungen, pflegen Patientenakten, Recalls, Abrechnung und Kalender.

## Product Purpose

PetConnect verbindet Tierhalter:innen und Tierarztpraxen auf einer Plattform: Online-Terminbuchung, vollständige digitale Tierakte, Symptomcheck mit Ampel, Notfallhilfe, Telemedizin, Erinnerungen und Abrechnung. Zwei Apps (Halter-App, Praxisportal) teilen ein Datenmodell.

Der klickbare Prototyp auf petconnect24.com dient derzeit drei Zwecken:
1. Vorführung bei Tierarztpraxen, um sie als Partner zu gewinnen.
2. Nutzertests mit Halter:innen und Praxisteams.
3. Funktionale Vorlage für die geplante Produktions-App.

## Positioning

Die Tierakte gehört den Halter:innen und funktioniert praxisübergreifend: Halter:innen führen sie auch ohne angebundene Praxis selbst, entscheiden, welche Praxis was wie lange sieht, und nehmen sie zu jeder Praxis mit. Praxen arbeiten im selben Datenmodell, statt Daten abzutippen.

## Operating Context

- Prototyp ist eine einzelne, selbstständige Datei `../index.html` (Schriften eingebettet, kein Server), veröffentlicht per `hochladen.ps1` über GitHub auf petconnect24.com. Ältere Stände liegen in `../Archiv/Prototyp-Versionen/`.
- Demo-Login über „Demo“; Rollenwechsel Halter:in ↔ Praxis. Eingaben überleben ein Neuladen am selben Tag (nur Demo-Speicher im Browser).
- Regionale Ausrichtung zum Start: Hessen, Rhein-Main, RLP/BW (Praxislisten in `../Unterlagen/Geschaeft/`, `../Archiv/Praxislisten/`); Feiertagslogik derzeit für Hessen.
- Qualitätssicherung: Testprotokoll (`../Unterlagen/Testprotokoll/`), Vitest-Unit-Tests für Geschäftslogik in `src/`, Playwright-Browser-Tests in `tests/e2e/` gegen `index.html` mit fester Testuhr (Mi 14.10.2026, 10:00, Europe/Berlin).

## Capabilities and Constraints

- Funktionsumfang laut `../Unterlagen/Produkt/PetConnect_Feature_Overview.html`: Halter-App mit neun Bereichen, Praxisportal mit zehn Bereichen, plattformübergreifende Themen (Sprachen, Rollen, Geräte).
- 11 Sprachen, jede Ansicht vollständig übersetzt (DE, EN, FR, AR mit RTL, NL, ES, RU, TR, SV, DA, NO); förmliche Anrede im Deutschen (Sie) und Spanischen (usted); Sprachwahl nach Besucherland, manuelle Wahl wird gemerkt.
- Rollen: Halter:in, Mitbesitzer:in, Nur-Ansicht, Sitter:in, Praxis. Halter:innen steuern Freigaben je Praxis und Dauer.
- Medizinische Grenzen: Rote Warnzeichen führen immer zum Notfallweg und sperren die Online-Buchung zugunsten eines Anrufs. Die Symptomcheck-Regeln sind noch nicht tierärztlich freigegeben.
- Geplant, nicht gebaut: echtes Backend (Supabase, EU-Hosting Frankfurt, Row-Level-Zugriffsregeln, AV-Verträge mit Praxen), Produktions-Web-App in React/Vite, native Android-App mit Push, Foto-Upload mit On-Device-OCR. Abrechnung ist im Prototyp teilweise als „für spätere Versionen geplant“ markiert.
- Geschäftslogik als reine Funktionen in `src/` getrennt von der UI; keine `any`-Typen (siehe `CLAUDE.md`).

## Brand Commitments

- Name „PetConnect“, Domain petconnect24.com.
- Inklusive Sprache mit Gender-Doppelpunkt („Halter:innen“); förmliche Anrede (Sie/usted).
- Prototyp ist klar als Prototyp gekennzeichnet; Impressum und Datenschutzerklärung sind Teil der Seite.

## Evidence on Hand

- Klickbarer Prototyp `../index.html` und Feature-Übersicht (Stand 13.10.2026).
- Testprotokolle, Übersetzungs-Prüfliste, Fehlerliste mit behobenen Befunden.
- Praxislisten (Hessen, Rhein-Main, RLP/BW) und Einnahmenmodell (`../Unterlagen/Geschaeft/`).
- Nicht vorhanden und nicht zu erfinden: angebundene Partnerpraxen, Kund:innenzahlen, Testimonials, Pressestimmen, Preise für Praxen oder Halter:innen, tierärztliche Freigabe der Triage-Regeln, Zertifizierungen.

## Product Principles

1. **Die Akte gehört den Halter:innen.** Jede Funktion respektiert, dass Halter:innen Eigentum, Freigabe und Mitnahme ihrer Daten steuern; Praxen sehen nur, was freigegeben ist.
2. **Zwei Seiten, ein Datenmodell.** Was eine Seite einträgt, ist für die andere ohne Abtippen nutzbar; beide Apps sind gleich ernst zu nehmen.
3. **Im Zweifel der sichere Weg.** Gesundheitsentscheidungen eskalieren lieber zur Praxis oder Notfallklinik, als falsche Sicherheit zu geben.
4. **Funktioniert auch ohne angebundene Praxis.** Halter:innen haben vom ersten Tag an Nutzen; Praxen lassen sich nachträglich einladen.
5. **Für alle verständlich.** Elf Sprachen, RTL und Barrierefreiheit sind Grundanforderung, kein Zusatz.

## Accessibility & Inclusion

Verbindliches Ziel: WCAG 2.2 AA für Halter-App und Praxisportal. Vollständige Übersetzung in 11 Sprachen inkl. Rechts-nach-links-Layout (Arabisch); Notfallfunktionen müssen unter Stress und am Handy bedienbar bleiben.
