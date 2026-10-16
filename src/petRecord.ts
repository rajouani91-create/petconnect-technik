/** Tierakte: Prüfung von Gewicht, Impfdatum und Transpondernummer. */
export interface Issue { readonly field: string; readonly message: string }

const LIMITS = { dog: { min: 0.1, max: 120 }, cat: { min: 0.05, max: 15 }, other: { min: 0.001, max: 1000 } } as const;
export type Species = keyof typeof LIMITS;

/** Laufzeit-Typwächter: Werte aus ungeprüften Quellen (z. B. Prototyp `art:'rabbit'`) sind evtl. keine bekannte Tierart. */
function isKnownSpecies(value: unknown): value is Species {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LIMITS, value);
}

/** Unbekannte Tierarten fallen sicher auf die Grenzen von „Sonstige" ('other') zurück. */
function limitsFor(species: unknown): (typeof LIMITS)[Species] {
  return isKnownSpecies(species) ? LIMITS[species] : LIMITS.other;
}

export function validateWeight(kg: number, species: Species): Issue | null {
  if (typeof kg !== 'number' || !Number.isFinite(kg)) return { field: 'weight', message: 'Gewicht ist keine gültige Zahl' };
  if (kg <= 0) return { field: 'weight', message: 'Gewicht muss größer als 0 sein' };
  const l = limitsFor(species);
  if (kg < l.min || kg > l.max) return { field: 'weight', message: 'Gewicht außerhalb des plausiblen Bereichs' };
  return null;
}

/** Zeitzone der Halter:innen; „heute" wird als Kalenderdatum in dieser Zone bestimmt. */
export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

/** Kalenderdatum (Jahr/Monat/Tag) eines Zeitpunkts in der angegebenen IANA-Zeitzone, als UTC-Mitternacht in ms. */
function localCalendarDayUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day'): number => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'));
}

/** ISO-Datum (JJJJ-MM-TT), existiert wirklich und liegt (in der lokalen Zeitzone) nicht in der Zukunft. */
export function validateVaccinationDate(iso: string, today: Date, timeZone: string = DEFAULT_TIME_ZONE): Issue | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { field: 'vaccinationDate', message: 'Datum muss JJJJ-MM-TT sein' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { field: 'vaccinationDate', message: 'Datum existiert nicht' };
  }
  if (Number.isNaN(today.getTime())) return { field: 'vaccinationDate', message: 'Referenzdatum ist ungültig' };
  const t = localCalendarDayUtc(today, timeZone);
  if (dt.getTime() > t) return { field: 'vaccinationDate', message: 'Impfdatum liegt in der Zukunft' };
  return null;
}

/** Transponder (ISO 11784): genau 15 Ziffern. Leerzeichen/Bindestriche werden toleriert. */
export function validateMicrochip(raw: string | null | undefined): Issue | null {
  if (raw === null || raw === undefined || raw.trim() === '') return { field: 'microchip', message: 'Transpondernummer fehlt' };
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{15}$/.test(digits)) return { field: 'microchip', message: 'Transpondernummer muss 15 Ziffern haben' };
  return null;
}
