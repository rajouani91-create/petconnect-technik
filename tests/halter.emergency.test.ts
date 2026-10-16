/**
 * Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter", Bereich „Notfall & SOS"
 * sowie der Notfall-Button aus dem Symptomcheck (H-058).
 * Benennung: „H-0xx (Zeile n)" = Szenario-ID und Zeile im Blatt.
 */
import { describe, expect, it } from 'vitest';
import { findOpenClinics, type Clinic } from '../src/emergency';
import { triage } from '../src/triage';

const ruesselsheim = { lat: 49.9917, lng: 8.4128 };
const clinic = (id: string, lat: number, lng: number, extra: Partial<Clinic> = {}): Clinic => ({ id, name: id, location: { lat, lng }, open24h: false, ...extra });

const tagklinik = clinic('tag', 49.995, 8.42, { opensAt: 8, closesAt: 18 });
const notdienst = clinic('24h', 50.05, 8.55, { open24h: true });
const nachtklinik = clinic('nacht', 50.0, 8.27, { opensAt: 18, closesAt: 8 });

describe('Halter-Protokoll: Notfall-Finder', () => {
  it('H-157 (Zeile 158): SOS zeigt geöffnete Kliniken in der Nähe, nächste zuerst', () => {
    const r = findOpenClinics(ruesselsheim, [notdienst, tagklinik, nachtklinik], 12, 30);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.clinics.map((c) => c.id)).toEqual(['tag', '24h']);
  });

  it('H-157 (Zeile 158, nachts): um 3 Uhr erscheinen nur Notdienst und Nachtklinik', () => {
    const r = findOpenClinics(ruesselsheim, [tagklinik, notdienst, nachtklinik], 3, 30);
    expect(r.kind === 'ok' && r.clinics.map((c) => c.id).sort()).toEqual(['24h', 'nacht']);
  });

  it('H-157 (Zeile 158, Randfall): fehlender oder unsinniger Standort ergibt „no-location" statt Absturz', () => {
    for (const pos of [null, undefined, { lat: NaN, lng: 8 }, { lat: 49, lng: Infinity }, { lat: 0, lng: 181 }, { lat: -90.0001, lng: 0 }]) {
      expect(findOpenClinics(pos, [notdienst], 12, 30).kind, JSON.stringify(pos)).toBe('no-location');
    }
  });

  it('H-157 (Zeile 158, Randfall): Kliniken mit fehlerhaftem Standort werden übersprungen', () => {
    const kaputt = clinic('kaputt', NaN, 8.4, { open24h: true });
    const r = findOpenClinics(ruesselsheim, [kaputt, notdienst], 12, 30);
    expect(r.kind === 'ok' && r.clinics.map((c) => c.id)).toEqual(['24h']);
  });

  it('H-157 (Zeile 158, Randfall): keine geöffnete Klinik im Umkreis bzw. Umkreis 0/negativ/NaN', () => {
    expect(findOpenClinics(ruesselsheim, [tagklinik], 22, 30).kind).toBe('none-open');
    expect(findOpenClinics(ruesselsheim, [notdienst], 12, 0).kind).toBe('none-open');
    expect(findOpenClinics(ruesselsheim, [notdienst], 12, -5).kind).toBe('none-open');
    expect(findOpenClinics(ruesselsheim, [notdienst], 12, NaN).kind).toBe('none-open');
  });

  it('H-157 (Zeile 158, Randfall): Schließzeit ist exklusiv, Öffnungszeit inklusiv', () => {
    expect(findOpenClinics(ruesselsheim, [tagklinik], 18, 30).kind).toBe('none-open');
    expect(findOpenClinics(ruesselsheim, [tagklinik], 8, 30).kind).toBe('ok');
  });

  it('H-157 (Zeile 158, Randfall): Klinik ohne Öffnungszeiten und nicht 24 h gilt als geschlossen', () => {
    expect(findOpenClinics(ruesselsheim, [clinic('unbekannt', 49.99, 8.41)], 12, 30).kind).toBe('none-open');
  });

  it('H-058 (Zeile 59) → Notfall-Finder: ROT-Ergebnis bei Atemnot führt zu einer geöffneten Klinik in der Nähe', () => {
    const r = triage({ symptoms: ['s_breath'], duration: '<24h', general: 'normal', species: 'dog' });
    expect(r?.action).toBe('emergency');
    const found = findOpenClinics(ruesselsheim, [tagklinik, notdienst], 2, 30);
    expect(found.kind === 'ok' && found.clinics[0]?.id).toBe('24h');
  });
});
