import { describe, expect, it } from 'vitest';
import { checkBooking, ownerConflict, type Slot } from '../src/booking';

const H = 3_600_000;
const now = Date.UTC(2026, 9, 12, 10);
const slot = (p: string, h: number, len = 1): Slot => ({ practiceId: p, start: now + h * H, end: now + (h + len) * H });

describe('Terminbuchung', () => {
  it('Termin in der Vergangenheit wird abgelehnt', () => {
    expect(checkBooking(slot('p1', -2), [], now)).toBe('past');
  });
  it('Ende vor oder gleich Start und NaN sind ungültig', () => {
    expect(checkBooking({ practiceId: 'p1', start: now + H, end: now + H }, [], now)).toBe('invalid');
    expect(checkBooking({ practiceId: 'p1', start: NaN, end: now }, [], now)).toBe('invalid');
  });
  it('Überbuchung in derselben Praxis wird erkannt', () => {
    expect(checkBooking(slot('p1', 2), [slot('p1', 2)], now)).toBe('collision');
    expect(checkBooking(slot('p1', 2, 2), [slot('p1', 3)], now)).toBe('collision');
  });
  it('direkt aufeinanderfolgende Termine sind erlaubt', () => {
    expect(checkBooking(slot('p1', 3), [slot('p1', 2)], now)).toBeNull();
  });
  it('gleiche Zeit in anderer Praxis ist für die Praxis kein Konflikt', () => {
    expect(checkBooking(slot('p2', 2), [slot('p1', 2)], now)).toBeNull();
  });
  it('Halter kann nicht gleichzeitig in zwei Praxen sein', () => {
    expect(ownerConflict(slot('p2', 2), [slot('p1', 2)])).toBe(true);
    expect(ownerConflict(slot('p2', 5), [slot('p1', 2)])).toBe(false);
  });
  it('Zeitzonenwechsel: UTC-Millisekunden bleiben eindeutig (Winterzeit-Umstellung)', () => {
    const a = Date.UTC(2026, 9, 25, 0, 30); // 02:30 Sommerzeit
    const b = Date.UTC(2026, 9, 25, 1, 30); // 02:30 Winterzeit
    expect(checkBooking({ practiceId: 'p1', start: b, end: b + H }, [{ practiceId: 'p1', start: a, end: a + H }], a - H)).toBeNull();
  });
});
