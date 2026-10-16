/** Symptomcheck: reine Logik aus dem Prototyp (wirksame function triage in index.html, „Etappe 8"). */
export const RED_SIGNS = ['s_breath', 's_seizure', 's_poison', 's_bloat', 's_bleed', 's_urine'] as const;
export const YELLOW_SIGNS = ['s_vomit', 's_diarrhea', 's_noeat', 's_limp', 's_cough', 's_itch', 's_thirst', 's_eyes'] as const;

export type Symptom = (typeof RED_SIGNS)[number] | (typeof YELLOW_SIGNS)[number];
export type Duration = '<24h' | '1-3d' | '>3d';
export type General = 'normal' | 'matt' | 'apathisch';
export type Species = 'dog' | 'cat' | 'other';
export type Level = 'crit' | 'warn' | 'ok';
export type Action = 'emergency' | 'appointment' | 'telehealth';

export interface TriageInput {
  readonly symptoms: readonly string[];
  readonly duration: Duration;
  readonly general: General;
  readonly species: Species;
}

export interface TriageResult {
  readonly level: Level;
  readonly action: Action;
}

const RED: readonly string[] = RED_SIGNS;
const DURATIONS: readonly string[] = ['<24h', '1-3d', '>3d'];
const GENERALS: readonly string[] = ['normal', 'matt', 'apathisch'];

/** Punkte für die Dauer der Beschwerden. */
const DURATION_POINTS: Readonly<Record<Duration, number>> = {
  '<24h': 0,
  '1-3d': 1,
  '>3d': 2,
};

/** Punkte für „matt" (apathisch ist immer ROT und wird nicht gezählt). */
const MATT_POINTS = 1;

/** Ab diesem Punktwert ist das Ergebnis GELB. */
export const WARN_SCORE = 3;

/** Jede Stufe hat genau eine Handlungsempfehlung – action wird immer aus level abgeleitet. */
const ACTION_BY_LEVEL: Readonly<Record<Level, Action>> = {
  crit: 'emergency',
  warn: 'appointment',
  ok: 'telehealth',
};

function resultFor(level: Level): TriageResult {
  return { level, action: ACTION_BY_LEVEL[level] };
}

/** Punktwert = Anzahl verschiedener Symptome + Dauer (>3d: 2, 1-3d: 1) + matt (1). */
export function triageScore(symptoms: readonly string[], duration: Duration, general: General): number {
  return new Set(symptoms).size + DURATION_POINTS[duration] + (general === 'matt' ? MATT_POINTS : 0);
}

/**
 * Gibt null zurück, wenn nichts ausgewählt ist (und das Tier nicht apathisch ist).
 *
 * Reihenfolge der Regeln (wie index.html):
 * 1. Rote Warnzeichen oder „apathisch" → ROT (Notfall), unabhängig von allem anderen.
 * 2. Keine Symptome → null.
 * 3. GELB bei Punktwert ≥ 3, Dauer > 3 Tage, Katze frisst nicht länger als 24 h
 *    oder Erbrechen mit Durchfall; sonst GRÜN.
 * 4. action wird aus der Stufe abgeleitet.
 */
export function triage(input: TriageInput): TriageResult | null {
  if (!DURATIONS.includes(input.duration)) throw new RangeError('Ungültige Dauer: ' + String(input.duration));
  if (!GENERALS.includes(input.general)) throw new RangeError('Ungültiger Allgemeinzustand: ' + String(input.general));
  const chips = Array.from(new Set(input.symptoms));
  if (chips.some((c) => RED.includes(c)) || input.general === 'apathisch') {
    return resultFor('crit');
  }
  if (chips.length === 0) return null;
  const serious =
    triageScore(chips, input.duration, input.general) >= WARN_SCORE ||
    input.duration === '>3d' ||
    (chips.includes('s_noeat') && input.species === 'cat' && input.duration !== '<24h') ||
    (chips.includes('s_vomit') && chips.includes('s_diarrhea'));
  return resultFor(serious ? 'warn' : 'ok');
}
