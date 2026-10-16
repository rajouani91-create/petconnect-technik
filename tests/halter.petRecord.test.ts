/**
 * Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter", Bereiche „Haustiere" (Stammdaten) und „Tierakte".
 * Benennung: „H-0xx (Zeile n)" = Szenario-ID und Zeile im Blatt.
 *
 * ACHTUNG: Gewichtsgrenzen je Tierart sind fachliche Annahmen und müssen von Tierärzt:innen geprüft
 * werden. Grüne Tests sind KEIN Beweis medizinischer Richtigkeit.
 */
import { describe, expect, it } from 'vitest';
import { validateMicrochip, validateVaccinationDate, validateWeight } from '../src/petRecord';

const today = new Date('2026-10-12T12:00:00Z');

describe('Halter-Protokoll: Tierakte – Stammdaten', () => {
  it('H-021 (Zeile 22): Hund mit plausiblem Gewicht und 15-stelliger Chipnummer wird akzeptiert', () => {
    expect(validateWeight(28.4, 'dog')).toBeNull();
    expect(validateMicrochip('276098100123456')).toBeNull();
  });

  it('H-022 (Zeile 23): Katze mit plausiblem Gewicht und Chipnummer wird akzeptiert', () => {
    expect(validateWeight(4.2, 'cat')).toBeNull();
    expect(validateMicrochip('276 098 100 654321')).toBeNull();
  });

  it('H-023 (Zeile 24): Kaninchen (1,6 kg) und Vogel (0,035 kg) als „Sonstige" werden akzeptiert', () => {
    expect(validateWeight(1.6, 'other')).toBeNull();
    expect(validateWeight(0.035, 'other')).toBeNull();
  });

  it('H-023 (Zeile 24, Randfall): Tierart „rabbit" aus den Prototyp-Daten führt nicht zum Absturz der Gewichtsprüfung', () => {
    // Der Prototyp (index.html) speichert Kaninchen mit art:'rabbit'. Laufzeitwerte sind nicht typgeprüft.
    expect(() => validateWeight(1.6, 'rabbit' as never)).not.toThrow();
  });

  it('H-026 (Zeile 27): 15-stellige Chipnummer gültig, 10-stellige führt zu Hinweis', () => {
    expect(validateMicrochip('276098100123456')).toBeNull();
    const issue = validateMicrochip('2760981001');
    expect(issue?.field).toBe('microchip');
    expect(issue?.message).toMatch(/15 Ziffern/);
  });

  it('H-026 (Zeile 27, Randfall): 14 und 16 Ziffern, Buchstaben, Platzhalter und nicht-lateinische Ziffern werden abgelehnt', () => {
    for (const v of ['27609810012345', '2760981001234567', '27609810012345O', '—', '٢٧٦٠٩٨١٠٠١٢٣٤٥٦', '276098100123456\n1']) {
      expect(validateMicrochip(v), JSON.stringify(v)).not.toBeNull();
    }
  });

  it('H-027 (Zeile 28): Gewicht beim Bearbeiten ändern – plausibler neuer Wert wird akzeptiert', () => {
    expect(validateWeight(29.1, 'dog')).toBeNull();
    expect(validateWeight(3.9, 'cat')).toBeNull();
  });
});

describe('Halter-Protokoll: Tierakte – Impfpass', () => {
  it('H-080 (Zeile 81): Impfung mit Datum in der Vergangenheit eintragen ist gültig', () => {
    expect(validateVaccinationDate('2026-03-15', today)).toBeNull();
    expect(validateVaccinationDate('2026-10-12', today)).toBeNull();
  });

  it('H-080 (Zeile 81, Randfall): leere und unsinnige Datumseingaben werden abgelehnt', () => {
    for (const v of ['', ' ', '2026-1-5', '2026/10/12', '15.03.2026', 'abc', '2026-00-10', '2026-10-00', '<script>']) {
      expect(validateVaccinationDate(v, today), JSON.stringify(v)).not.toBeNull();
    }
  });

  it('H-080 (Zeile 81, Zeitzonenrandfall): kurz nach Mitternacht in Berlin ist das heutige lokale Datum gültig', () => {
    // 13.10.2026 00:30 Uhr MESZ = 12.10.2026 22:30 UTC. Die Halterin trägt die heutige Impfung ein.
    const kurzNachMitternachtBerlin = new Date('2026-10-12T22:30:00Z');
    expect(validateVaccinationDate('2026-10-13', kurzNachMitternachtBerlin)).toBeNull();
  });

  it('H-081 (Zeile 82): Impfdatum in der Zukunft wird mit Hinweis abgelehnt', () => {
    const tomorrow = validateVaccinationDate('2026-10-13', today);
    expect(tomorrow?.field).toBe('vaccinationDate');
    expect(tomorrow?.message).toMatch(/Zukunft/);
    expect(validateVaccinationDate('2099-01-01', today)?.message).toMatch(/Zukunft/);
  });
});

describe('Halter-Protokoll: Tierakte – Gewicht', () => {
  it('H-095 (Zeile 96): plausibles Gewicht eintragen wird akzeptiert', () => {
    expect(validateWeight(12.5, 'dog')).toBeNull();
  });

  it('H-098 (Zeile 99): 0, negativ und 999 kg werden bei Hund und Katze abgelehnt', () => {
    for (const species of ['dog', 'cat'] as const) {
      for (const v of [0, -0, -1, -12.5, 999]) {
        expect(validateWeight(v, species), `${species} ${v}`).not.toBeNull();
      }
    }
  });

  it('H-098 (Zeile 99): 0 und negative Werte werden auch bei „Sonstige" abgelehnt', () => {
    for (const v of [0, -0.5]) expect(validateWeight(v, 'other')).not.toBeNull();
  });

  it('H-098 (Zeile 99, Randfall): Nicht-Zahlen zur Laufzeit (String, null, undefined) werden abgelehnt statt akzeptiert', () => {
    for (const v of ['12' as never, null as never, undefined as never, '' as never]) {
      expect(validateWeight(v, 'dog')?.message).toMatch(/keine gültige Zahl/);
    }
  });
});
