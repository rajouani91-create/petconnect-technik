/** Terminbuchung: Überbuchung, Vergangenheit und Kollisionen. Zeiten als UTC-Millisekunden. */
export interface Slot { readonly practiceId: string; readonly start: number; readonly end: number }
export type BookingError = 'invalid' | 'past' | 'collision';

export function overlaps(a: Slot, b: Slot): boolean {
  return a.start < b.end && b.start < a.end;
}

export function checkBooking(slot: Slot, existing: readonly Slot[], now: number): BookingError | null {
  if (![slot.start, slot.end, now].every(Number.isFinite) || slot.end <= slot.start) return 'invalid';
  if (slot.start < now) return 'past';
  if (existing.some((e) => e.practiceId === slot.practiceId && overlaps(slot, e))) return 'collision';
  return null;
}

/** Ein Halter kann nicht gleichzeitig in zwei Praxen sein. */
export function ownerConflict(slot: Slot, ownerSlots: readonly Slot[]): boolean {
  return ownerSlots.some((e) => overlaps(slot, e));
}
