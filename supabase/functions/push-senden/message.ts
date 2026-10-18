/* Text einer Benachrichtigung in der Sprache der Person. Keine Gesundheitsdetails über das Nötige hinaus. */
import { TEXTS } from './texts.ts';

export type Job = {
  kind: 'medication' | 'reminder' | 'appointment';
  ref_id: string; slot: string; pet: string; title: string; url: string; language: string;
  info: { amount?: number; unit?: string; hint?: string; time?: string; overdue?: boolean; location?: string | null };
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[];
};

const LOCALE: Record<string, string> = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', ar: 'ar-u-nu-latn', nl: 'nl-NL', es: 'es-ES', ru: 'ru-RU', tr: 'tr-TR', sv: 'sv-SE', da: 'da-DK', no: 'nb-NO' };

export function buildMessage(j: Job): { title: string; body: string; url: string; tag: string } {
  const lang = TEXTS[j.language] ? j.language : 'de';
  const T = TEXTS[lang];
  const tag = `${j.kind}-${j.ref_id}-${j.slot}`;
  if (j.kind === 'medication') {
    const a = Number(j.info.amount);
    const u = T.u[j.info.unit ?? ''] ?? [j.info.unit ?? '', j.info.unit ?? ''];
    const amount = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 }).format(a);
    const hint = j.info.hint === 'with_food' ? ` · ${T.food}` : j.info.hint === 'empty_stomach' ? ` · ${T.empty}` : '';
    return {
      title: `${j.pet}: ${j.title}`,
      body: `${T.med.replace('{t}', j.info.time ?? '')} · ${amount} ${a === 1 ? u[0] : u[1]}${hint}. ${T.ask}`,
      url: j.url, tag,
    };
  }
  if (j.kind === 'reminder') {
    return { title: `${j.pet}: ${j.title}`, body: j.info.overdue ? T.overdue : T.today, url: j.url, tag };
  }
  return {
    title: `${j.pet}: ${j.title}`,
    body: T.appt.replace('{t}', j.info.time ?? '') + (j.info.location ? ` · ${j.info.location}` : ''),
    url: j.url, tag,
  };
}
