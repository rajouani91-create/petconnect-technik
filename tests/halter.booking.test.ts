/**
 * Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter", Bereiche „Termine buchen" / „Termine verwalten".
 * Benennung: „H-0xx (Zeile n)" = Szenario-ID und Zeile im Blatt.
 */
import { describe, expect, it } from 'vitest';
import { checkBooking, ownerConflict, type Slot } from '../src/booking';

const MIN = 60_000;
const H = 60 * MIN;
const DAY = 24 * H;
const now = Date.UTC(2026, 9, 12, 10); // 12.10.2026, 12:00 Uhr Berlin (MESZ)
const slot = (p: string, offsetMin: number, lenMin = 30): Slot => ({ practiceId: p, start: now + offsetMin * MIN, end: now + (offsetMin + lenMin) * MIN });

describe('Halter-Protokoll: Terminbuchung & Kalender', () => {
  it('H-033 (Zeile 34): Standardfall – freier Slot in der Zukunft ist buchbar', () => {
    const existing = [slot('p1', 60), slot('p1', 120), slot('p2', 90)];
    expect(checkBooking(slot('p1', 90), existing, now)).toBeNull();
    expect(checkBooking(slot('p1', 3 * 24 * 60), existing, now)).toBeNull();
  });

  it('H-037 (Zeile 38): Doppelbuchung desselben Slots – nach der ersten Buchung ist der Slot nicht mehr frei', () => {
    const booked: Slot[] = [];
    const wish = slot('p1', 180);
    expect(checkBooking(wish, booked, now)).toBeNull();
    booked.push(wish); // erste Person bucht
    expect(checkBooking({ ...wish }, booked, now)).toBe('collision'); // zweite Person, gleicher Slot
  });

  it('H-037 (Zeile 38, Randfall): teilweise Überlappung um wenige Minuten ist ebenfalls belegt', () => {
    const existing = [slot('p1', 180, 30)];
    expect(checkBooking(slot('p1', 205, 30), existing, now)).toBe('collision'); // 5 Min Überlappung am Ende
    expect(checkBooking(slot('p1', 155, 30), existing, now)).toBe('collision'); // 5 Min Überlappung am Anfang
    expect(checkBooking(slot('p1', 185, 10), existing, now)).toBe('collision'); // vollständig innerhalb
    expect(checkBooking(slot('p1', 170, 60), existing, now)).toBe('collision'); // umschließt den bestehenden
  });

  it('H-037 (Zeile 38, Randfall): Überbuchung wird auch erkannt, wenn der Konflikt nicht der erste Eintrag ist', () => {
    const existing = [slot('p2', 180), slot('p1', 0), slot('p1', 60), slot('p1', 180)];
    expect(checkBooking(slot('p1', 180), existing, now)).toBe('collision');
  });

  it('H-037 (Zeile 38, Zeitzonenwechsel): Überlappung über die Sommerzeit-Umstellung (29.03.2026) wird erkannt', () => {
    // 01:30 MEZ (00:30 UTC) bis 03:30 MESZ (01:30 UTC) überlappt 03:00–04:00 MESZ (01:00–02:00 UTC).
    const a: Slot = { practiceId: 'p1', start: Date.UTC(2026, 2, 29, 0, 30), end: Date.UTC(2026, 2, 29, 1, 30) };
    const b: Slot = { practiceId: 'p1', start: Date.UTC(2026, 2, 29, 1, 0), end: Date.UTC(2026, 2, 29, 2, 0) };
    expect(checkBooking(b, [a], Date.UTC(2026, 2, 28))).toBe('collision');
  });

  it('H-037 (Zeile 38, Halter-Sicht): derselbe Halter kann nicht zur gleichen Zeit in zwei Praxen gebucht werden', () => {
    expect(ownerConflict(slot('p2', 190), [slot('p1', 180)])).toBe(true);
    expect(ownerConflict(slot('p2', 210), [slot('p1', 180)])).toBe(false);
  });

  it('H-042 (Zeile 43): vergangene Tage sind nicht wählbar', () => {
    expect(checkBooking(slot('p1', -1 * 24 * 60), [], now)).toBe('past'); // gestern
    expect(checkBooking(slot('p1', -365 * 24 * 60), [], now)).toBe('past'); // letztes Jahr
    expect(checkBooking({ practiceId: 'p1', start: -DAY, end: -DAY + H }, [], now)).toBe('past'); // vor 1970
  });

  it('H-042 (Zeile 43, Randfall): Slot, der vor einer Minute begonnen hat, ist nicht mehr buchbar', () => {
    expect(checkBooking(slot('p1', -1, 30), [], now)).toBe('past');
  });

  it('H-042 (Zeile 43, Randfall): ungültige Zeitwerte werden abgelehnt statt gebucht', () => {
    expect(checkBooking({ practiceId: 'p1', start: now + H, end: Infinity }, [], now)).toBe('invalid');
    expect(checkBooking({ practiceId: 'p1', start: now + 2 * H, end: now + H }, [], now)).toBe('invalid'); // Ende vor Start
    expect(checkBooking(slot('p1', 60), [], NaN)).toBe('invalid'); // unbekannte aktuelle Zeit
  });
});
