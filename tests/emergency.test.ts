import { describe, expect, it } from 'vitest';
import { findOpenClinics, isOpen, distanceKm, type Clinic } from '../src/emergency';

const ruesselsheim = { lat: 49.9917, lng: 8.4128 };
const clinic = (id: string, lat: number, lng: number, extra: Partial<Clinic> = {}): Clinic => ({ id, name: id, location: { lat, lng }, open24h: false, ...extra });

describe('Notfall-Finder', () => {
  it('fehlender oder ungültiger Standort', () => {
    expect(findOpenClinics(null, [], 12, 30).kind).toBe('no-location');
    expect(findOpenClinics(undefined, [], 12, 30).kind).toBe('no-location');
    expect(findOpenClinics({ lat: NaN, lng: 0 }, [], 12, 30).kind).toBe('no-location');
    expect(findOpenClinics({ lat: 91, lng: 0 }, [], 12, 30).kind).toBe('no-location');
  });
  it('keine offene Klinik im Umkreis', () => {
    const far = clinic('weit', 52.52, 13.4, { open24h: true });
    expect(findOpenClinics(ruesselsheim, [far], 3, 30).kind).toBe('none-open');
    expect(findOpenClinics(ruesselsheim, [clinic('zu', 50.0, 8.4, { opensAt: 8, closesAt: 18 })], 3, 30).kind).toBe('none-open');
    expect(findOpenClinics(ruesselsheim, [], 3, 30).kind).toBe('none-open');
  });
  it('sortiert nach Entfernung und nimmt nur geöffnete', () => {
    const r = findOpenClinics(ruesselsheim, [clinic('b', 50.1, 8.68, { open24h: true }), clinic('a', 50.0, 8.42, { open24h: true }), clinic('zu', 49.99, 8.41)], 3, 50);
    expect(r.kind === 'ok' && r.clinics.map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('Öffnungszeiten über Mitternacht', () => {
    const nacht = clinic('nacht', 0, 0, { opensAt: 20, closesAt: 6 });
    expect(isOpen(nacht, 23)).toBe(true);
    expect(isOpen(nacht, 2)).toBe(true);
    expect(isOpen(nacht, 12)).toBe(false);
  });
  it('Distanz ist symmetrisch und 0 bei gleichem Ort', () => {
    expect(distanceKm(ruesselsheim, ruesselsheim)).toBe(0);
    expect(distanceKm(ruesselsheim, { lat: 50.11, lng: 8.68 })).toBeCloseTo(distanceKm({ lat: 50.11, lng: 8.68 }, ruesselsheim), 6);
  });
});
