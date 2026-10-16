import { describe, expect, it } from 'vitest';
import { validateMicrochip, validateVaccinationDate, validateWeight } from '../src/petRecord';

describe('Tierakte: Gewicht', () => {
  it('lehnt negative Werte, 0 kg, NaN und Infinity ab', () => {
    for (const v of [-3, 0, NaN, Infinity, -Infinity]) expect(validateWeight(v, 'dog')).not.toBeNull();
  });
  it('lehnt 500 kg bei Hund und Katze ab', () => {
    expect(validateWeight(500, 'dog')).not.toBeNull();
    expect(validateWeight(500, 'cat')).not.toBeNull();
  });
  it('akzeptiert plausible Werte', () => {
    expect(validateWeight(28.4, 'dog')).toBeNull();
    expect(validateWeight(4.2, 'cat')).toBeNull();
  });
});

describe('Tierakte: Impfdatum', () => {
  const today = new Date('2026-10-12T12:00:00Z');
  it('lehnt falsches Format, nicht existierende Tage und Zukunft ab', () => {
    expect(validateVaccinationDate('12.10.2026', today)).not.toBeNull();
    expect(validateVaccinationDate('2026-02-30', today)).not.toBeNull();
    expect(validateVaccinationDate('2026-13-01', today)).not.toBeNull();
    expect(validateVaccinationDate('2027-01-01', today)).not.toBeNull();
  });
  it('akzeptiert heute und Schaltjahr', () => {
    expect(validateVaccinationDate('2026-10-12', today)).toBeNull();
    expect(validateVaccinationDate('2024-02-29', today)).toBeNull();
    expect(validateVaccinationDate('2025-02-29', today)).not.toBeNull();
  });
});

describe('Tierakte: Transpondernummer', () => {
  it('fehlende Nummer wird gemeldet', () => {
    for (const v of [null, undefined, '', '   ']) expect(validateMicrochip(v)?.message).toMatch(/fehlt/);
  });
  it('verlangt genau 15 Ziffern', () => {
    expect(validateMicrochip('276093900123456')).toBeNull();
    expect(validateMicrochip('276 093-900 123456')).toBeNull();
    expect(validateMicrochip('12345')).not.toBeNull();
    expect(validateMicrochip('27609390012345A')).not.toBeNull();
  });
});
