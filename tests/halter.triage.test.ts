/**
 * Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter", Bereich Symptomcheck.
 * Benennung: „H-0xx (Zeile n)" = Szenario-ID und Zeile im Blatt.
 *
 * ACHTUNG: Die Triage-Regeln (welche Symptome ROT/GELB/GRÜN ergeben) sind fachliche Annahmen
 * aus dem Testprotokoll und müssen von Tierärzt:innen geprüft werden. Grüne Tests sind KEIN
 * Beweis medizinischer Richtigkeit.
 */
import { describe, expect, it } from 'vitest';
import { triage, RED_SIGNS, YELLOW_SIGNS, type Duration, type General, type Species, type TriageInput } from '../src/triage';

const base: TriageInput = { symptoms: [], duration: '<24h', general: 'normal', species: 'dog' };
const DURATIONS: readonly Duration[] = ['<24h', '1-3d', '>3d'];
const GENERALS: readonly General[] = ['normal', 'matt', 'apathisch'];
const SPECIES: readonly Species[] = ['dog', 'cat', 'other'];

/** Alle Kombinationen aus Dauer, Allgemeinbefinden und Tierart. */
function allContexts(): { duration: Duration; general: General; species: Species }[] {
  const out: { duration: Duration; general: General; species: Species }[] = [];
  for (const duration of DURATIONS) for (const general of GENERALS) for (const species of SPECIES) out.push({ duration, general, species });
  return out;
}

describe('Halter-Protokoll: Symptomcheck-Triage', () => {
  it('H-057 (Zeile 58): kein Symptom gewählt ergibt kein Ergebnis – auch bei langer Dauer oder „matt"', () => {
    expect(triage(base)).toBeNull();
    expect(triage({ ...base, duration: '>3d' })).toBeNull();
    expect(triage({ ...base, duration: '1-3d', general: 'matt', species: 'cat' })).toBeNull();
  });

  it('H-058 (Zeile 59): Atemnot allein ist ROT/Notfall – in jeder Kombination aus Dauer, Befinden und Tierart', () => {
    for (const ctx of allContexts()) {
      expect(triage({ ...ctx, symptoms: ['s_breath'] }), JSON.stringify(ctx)).toEqual({ level: 'crit', action: 'emergency' });
    }
  });

  it('H-059 (Zeile 60): Krampf, Vergiftung, aufgeblähter Bauch, Blutung, Harnverhalt sind jeweils ROT', () => {
    const alarm = ['s_seizure', 's_poison', 's_bloat', 's_bleed', 's_urine'] as const;
    for (const s of alarm) expect(RED_SIGNS).toContain(s);
    for (const s of alarm) {
      for (const ctx of allContexts()) {
        expect(triage({ ...ctx, symptoms: [s] })?.level, `${s} ${JSON.stringify(ctx)}`).toBe('crit');
      }
    }
  });

  it('H-059 (Zeile 60, Randfall): Alarmsymptom bleibt ROT, auch zusammen mit vielen leichten Symptomen', () => {
    for (const s of RED_SIGNS) {
      expect(triage({ ...base, symptoms: [...YELLOW_SIGNS, s] })?.level).toBe('crit');
      expect(triage({ ...base, symptoms: [s, ...YELLOW_SIGNS] })?.level).toBe('crit');
    }
  });

  it('H-060 (Zeile 61): teilnahmslos mit genau einem leichten Symptom ist ROT', () => {
    for (const s of YELLOW_SIGNS) {
      for (const duration of DURATIONS) {
        for (const species of SPECIES) {
          expect(triage({ symptoms: [s], duration, general: 'apathisch', species })?.level).toBe('crit');
        }
      }
    }
  });

  it('H-061 (Zeile 62): Husten, unter 24 h, munter ergibt GRÜN (beobachten/Videoberatung)', () => {
    expect(triage({ ...base, symptoms: ['s_cough'] })).toEqual({ level: 'ok', action: 'telehealth' });
  });

  it('H-062 (Zeile 63): Husten, 1–3 Tage, matt ergibt GELB (zeitnah Termin)', () => {
    expect(triage({ ...base, symptoms: ['s_cough'], duration: '1-3d', general: 'matt' })).toEqual({ level: 'warn', action: 'appointment' });
  });

  it('H-063 (Zeile 64): Juckreiz länger als 3 Tage, normal ergibt GELB', () => {
    expect(triage({ ...base, symptoms: ['s_itch'], duration: '>3d' })).toEqual({ level: 'warn', action: 'appointment' });
  });

  it('H-064 (Zeile 65): frisst nicht, >3 Tage, teilnahmslos ergibt ROT (Hund und Katze)', () => {
    for (const species of SPECIES) {
      expect(triage({ symptoms: ['s_noeat'], duration: '>3d', general: 'apathisch', species })?.level).toBe('crit');
    }
  });

  it('H-065 (Zeile 66): Erbrechen und Durchfall zusammen sind nie GRÜN – in jeder Kombination', () => {
    for (const ctx of allContexts()) {
      const r = triage({ ...ctx, symptoms: ['s_vomit', 's_diarrhea'] });
      expect(r, JSON.stringify(ctx)).not.toBeNull();
      expect(r?.level, JSON.stringify(ctx)).not.toBe('ok');
    }
  });

  it('H-065 (Zeile 66, Randfall): Reihenfolge und Duplikate ändern das Ergebnis nicht', () => {
    expect(triage({ ...base, symptoms: ['s_diarrhea', 's_vomit', 's_vomit'] })?.level).toBe('warn');
  });

  it('H-066 (Zeile 67): Katze frisst nicht seit 1–3 Tagen ergibt GELB (auch >3 Tage)', () => {
    expect(triage({ ...base, species: 'cat', symptoms: ['s_noeat'], duration: '1-3d' })?.level).toBe('warn');
    expect(triage({ ...base, species: 'cat', symptoms: ['s_noeat'], duration: '>3d' })?.level).toBe('warn');
  });

  it('H-067 (Zeile 68): drei leichte Symptome unter 24 h (Punktwert ≥ 3) ergeben GELB', () => {
    expect(triage({ ...base, symptoms: ['s_cough', 's_itch', 's_eyes'] })?.level).toBe('warn');
  });

  it('H-023 (Zeile 24, Symptom-Teil): Sonstige Tierart (Kaninchen/Vogel) – jedes Symptom liefert ein Ergebnis ohne Absturz', () => {
    for (const s of [...RED_SIGNS, ...YELLOW_SIGNS]) {
      for (const duration of DURATIONS) {
        const r = triage({ symptoms: [s], duration, general: 'normal', species: 'other' });
        expect(r).not.toBeNull();
        expect(['crit', 'warn', 'ok']).toContain(r?.level);
      }
    }
  });

  it('H-023 (Zeile 24, Randfall): unbekannte Tierart zur Laufzeit (z. B. „rabbit" aus dem Prototyp) stürzt nicht ab', () => {
    expect(() => triage({ ...base, symptoms: ['s_noeat'], duration: '1-3d', species: 'rabbit' as never })).not.toThrow();
  });
});
