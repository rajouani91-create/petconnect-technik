import { expect, test } from '@playwright/test';
import { APP_URL } from './helpers';

/** Sprachprüfung (13.10.2026): Vollständigkeit, Platzhalter, einheitliche Anrede und gleiche Absageregel in allen 11 Sprachen. */

type Dict = Record<string, Record<string, string>>;
/** Globales Sprachobjekt des Prototyps (index.html). */
declare const STR: Record<string, Record<string, unknown>>;

async function loadStrings(page: import('@playwright/test').Page): Promise<Dict> {
  await page.goto(APP_URL);
  return page.evaluate(() => {
    const out: Record<string, Record<string, string>> = {};
    const all = STR;
    for (const [l, src] of Object.entries(all)) {
      const d: Record<string, string> = {};
      for (const [k, v] of Object.entries(src)) if (typeof v === 'string') d[k] = v;
      out[l] = d;
    }
    return out;
  });
}

const LANGS = ['de', 'en', 'fr', 'ar', 'nl', 'es', 'ru', 'tr', 'sv', 'da', 'no'] as const;
type Lang = (typeof LANGS)[number];

/** Texte einer Sprache; fehlt die Sprache, schlägt der Test mit klarer Meldung fehl */
function dict(s: Dict, l: string): Record<string, string> {
  const d = s[l];
  expect(d, `Sprache ${l} fehlt`).toBeTruthy();
  return d ?? {};
}
const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();

test.describe('Sprachen – Vollständigkeit und Konsistenz', () => {
  test('alle 11 Sprachen haben jeden deutschen Text, mit denselben Platzhaltern', async ({ page }) => {
    const s = await loadStrings(page);
    const problems: string[] = [];
    const de = dict(s, 'de');
    for (const l of LANGS) {
      const d = dict(s, l);
      for (const [k, v] of Object.entries(de)) {
        const t = d[k];
        if (t === undefined || t.trim() === '') { problems.push(`${l}.${k} fehlt`); continue; }
        if (placeholders(t).join() !== placeholders(v).join()) problems.push(`${l}.${k} Platzhalter`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('keine englischen Reste aus neuen Funktionen in FR, AR, NL, ES, RU, TR', async ({ page }) => {
    const s = await loadStrings(page);
    const keys = ['hhSub', 'hhRoleCoX', 'hhRemoveAsk', 'bkHorizonX', 'cancelFree', 'docDelYes'];
    const en = dict(s, 'en');
    for (const l of ['fr', 'ar', 'nl', 'es', 'ru', 'tr']) for (const k of keys) expect(dict(s, l)[k], `${l}.${k}`).not.toBe(en[k]);
  });

  test('deutsche Texte siezen durchgehend', async ({ page }) => {
    const s = await loadStrings(page);
    const du = /\b(du|dein\w*|dir|dich|kannst|hast|musst|willst)\b|(^|[.!?:]\s+)(Wähle|Lege|Gib|Lade|Prüfe|Trage|Nimm|Fülle|Sprich|Teile|Ruf|Transportiere|Bitte (frage|wende|überweise))\b/;
    const chat = new Set(['c1', 'c2', 'c3', 'autoVet']);
    const hits = Object.entries(dict(s, 'de')).filter(([k, v]) => !chat.has(k) && du.test(v)).map(([k]) => k);
    expect(hits).toEqual([]);
  });

  test('spanische Texte siezen (usted)', async ({ page }) => {
    const s = await loadStrings(page);
    const tu = /\b(tu|tus|tienes|puedes|quieres)\b|(^|[.!?:¿¡]\s*)(Elige|Añade|Selecciona|Observa|Introduce|No esperes|Llama|Ve ya)\b/;
    const hits = Object.entries(dict(s, 'es')).filter(([, v]) => tu.test(v)).map(([k, v]) => `${k}: ${v}`);
    expect(hits).toEqual([]);
  });

  test('Absage unter 24 Stunden: in jeder Sprache Hinweis auf mögliche Kosten', async ({ page }) => {
    const s = await loadStrings(page);
    const cost: Record<Lang, RegExp> = {
      de: /Kosten/, en: /fee/, fr: /frais/, ar: /رسوم/, nl: /kosten/, es: /gastos/, ru: /сч[её]т|плат/, tr: /ücret/, sv: /avgift/, da: /gebyr/, no: /gebyr/,
    };
    for (const l of LANGS) {
      const d = dict(s, l);
      expect(d.ownCancelLate, `${l}.ownCancelLate`).toMatch(cost[l]);
      expect(d.cancelNote, `${l}.cancelNote`).toMatch(cost[l]);
      expect(d.cancelNote, `${l}.cancelNote`).toContain('24');
    }
  });

  test('Arabisch, Ergebnis GELB: Tier tierärztlich untersuchen lassen', async ({ page }) => {
    const s = await loadStrings(page);
    expect(dict(s, 'ar').rWarnT).toContain('الطبيب البيطري');
  });
});

test.describe('Sprachen – Spanisch in der Oberfläche', () => {
  test.use({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  test('Startseite, Rechnungen und Familie ohne deutsche Texte', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('[data-act="demo"]').click();
    for (const v of ['home', 'rechnungen', 'profil']) {
      await page.locator(`nav [data-view="${v}"]`).click();
      const text = await page.locator('#main').innerText();
      expect(text, v).not.toMatch(/\b(Notfall|Rechnungen deiner|Sofort Hilfe|Familie & Mithalter|Einladen)\b/);
    }
    await expect(page.locator('#hh-card')).toContainText('Familia y codueños');
  });
});
