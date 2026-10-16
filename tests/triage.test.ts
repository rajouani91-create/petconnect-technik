import { describe, expect, it } from 'vitest';
import { triage, triageScore, RED_SIGNS, YELLOW_SIGNS, type TriageInput } from '../src/triage';

const base: TriageInput = { symptoms: [], duration: '<24h', general: 'normal', species: 'dog' };

describe('Symptomcheck-Triage', () => {
  it('leere Symptomliste ergibt kein Ergebnis', () => {
    expect(triage(base)).toBeNull();
  });
  it('jedes rote Warnzeichen ist ein Notfall, auch allein und bei kurzer Dauer', () => {
    for (const s of RED_SIGNS) expect(triage({ ...base, symptoms: [s] })?.level).toBe('crit');
  });
  it('plötzliche Atemnot schlägt gegensätzliche Angaben (normal + nur kurz)', () => {
    expect(triage({ ...base, symptoms: ['s_breath', 's_itch'], general: 'normal' })?.action).toBe('emergency');
  });
  it('apathisches Tier ist ein Notfall, selbst ohne Symptome', () => {
    expect(triage({ ...base, general: 'apathisch' })?.level).toBe('crit');
  });
  it('Erbrechen und Durchfall zusammen führen zum Termin', () => {
    expect(triage({ ...base, symptoms: ['s_vomit', 's_diarrhea'] })?.level).toBe('warn');
  });
  it('Katze frisst nicht seit 1-3 Tagen führt zum Termin, Hund nicht', () => {
    expect(triage({ ...base, symptoms: ['s_noeat'], duration: '1-3d', species: 'cat' })?.level).toBe('warn');
    expect(triage({ ...base, symptoms: ['s_noeat'], duration: '1-3d', species: 'dog' })?.level).toBe('ok');
  });
  it('länger als 3 Tage ist immer mindestens Termin', () => {
    for (const s of YELLOW_SIGNS) expect(triage({ ...base, symptoms: [s], duration: '>3d' })?.level).toBe('warn');
  });
  it('doppelte Symptome zählen nur einmal', () => {
    expect(triage({ ...base, symptoms: ['s_itch', 's_itch'], duration: '1-3d' })?.level).toBe('ok');
  });
  it('unbekannte Symptome lösen keinen Notfall aus', () => {
    expect(triage({ ...base, symptoms: ['???', ''] })?.level).toBe('ok');
  });
  it('ungültige Dauer oder Allgemeinzustand werfen einen Fehler', () => {
    expect(() => triage({ ...base, symptoms: ['s_itch'], duration: 'x' as never })).toThrow(RangeError);
    expect(() => triage({ ...base, symptoms: ['s_itch'], general: 'x' as never })).toThrow(RangeError);
  });
});

describe('Symptomcheck-Triage – Punktwert wie index.html (Etappe 8)', () => {
  it('Punktwert = Symptome + Dauer (>3d: 2, 1-3d: 1) + matt (1)', () => {
    expect(triageScore(['s_itch'], '<24h', 'normal')).toBe(1);
    expect(triageScore(['s_itch', 's_cough'], '1-3d', 'normal')).toBe(3);
    expect(triageScore(['s_itch'], '>3d', 'matt')).toBe(4);
    expect(triageScore(['s_itch', 's_itch'], '<24h', 'matt')).toBe(2);
  });
  it('Punktwert 3 ergibt GELB, Punktwert 2 ergibt GRÜN', () => {
    expect(triage({ ...base, symptoms: ['s_itch', 's_cough'], duration: '1-3d' })?.level).toBe('warn');
    expect(triage({ ...base, symptoms: ['s_itch', 's_cough'], general: 'matt' })?.level).toBe('warn');
    expect(triage({ ...base, symptoms: ['s_cough'], duration: '1-3d', general: 'matt' })?.level).toBe('warn');
    expect(triage({ ...base, symptoms: ['s_cough', 's_itch', 's_eyes'] })?.level).toBe('warn');
    expect(triage({ ...base, symptoms: ['s_itch', 's_cough'] })?.level).toBe('ok');
    expect(triage({ ...base, symptoms: ['s_cough'], duration: '1-3d' })?.level).toBe('ok');
  });
  it('matt zählt nur einen Punkt: ein Symptom unter 24 h bleibt GRÜN', () => {
    expect(triage({ ...base, symptoms: ['s_cough'], general: 'matt' })?.level).toBe('ok');
  });
  it('matt macht aus GELB kein ROT', () => {
    expect(triage({ ...base, symptoms: ['s_vomit', 's_diarrhea'], general: 'matt' })?.level).toBe('warn');
    expect(triage({ ...base, symptoms: ['s_itch'], duration: '>3d', general: 'matt' })?.level).toBe('warn');
  });
  it('doppelte Symptome erhöhen den Punktwert nicht', () => {
    expect(triage({ ...base, symptoms: ['s_itch', 's_itch', 's_itch'], general: 'matt' })?.level).toBe('ok');
  });
  it('Katze frisst nicht unter 24 h ergibt GRÜN', () => {
    expect(triage({ ...base, symptoms: ['s_noeat'], species: 'cat' })?.level).toBe('ok');
  });
});
