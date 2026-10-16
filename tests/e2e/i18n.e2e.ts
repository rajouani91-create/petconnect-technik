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
    for (const l of Object.keys(all)) {
      out[l] = {};
      for (const [k, v] of Object.entries(all[l])) if (typeof v === 'string') out[l][k] = v;
    }
    return out;
  });
}

const LANGS = ['de', 'en', 'fr', 'ar', 'nl', 'es', 'ru', 'tr', 'sv', 'da', 'no'];
const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();

test.describe('Sprachen – Vollständigkeit und Konsistenz', () => {
  test('alle 11 Sprachen haben jeden deutschen Text, mit denselben Platzhaltern', async ({ page }) => {
    const s = await loadStrings(page);
    const problems: string[] = [];
    for (const l of LANGS) {
      expect(s[l], `Sprache ${l} fehlt`).toBeTruthy();
      for (const [k, v] of Object.entries(s.de)) {
        const t = s[l][k];
        if (t === undefined || t.trim() === '') { problems.push(`${l}.${k} fehlt`); continue; }
        if (placeholders(t).join() !== placeholders(v).join()) problems.push(`${l}.${k} Platzhalter`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('keine englischen Reste aus neuen Funktionen in FR, AR, NL, ES, RU, TR', async ({ page }) => {
    const s = await loadStrings(page);
    const keys = ['hhSub', 'hhRoleCoX', 'hhRemoveAsk', 'bkHorizonX', 'cancelFree', 'docDelYes'];
    for (const l of ['fr', 'ar', 'nl', 'es', 'ru', 'tr']) for (const k of keys) expect(s[l][k], `${l}.${k}`).not.toBe(s.en[k]);
  });

  test('deutsche Texte siezen durchgehend', async ({ page }) => {
    const s = await loadStrings(page);
    const du = /\b(du|dein\w*|dir|dich|kannst|hast|musst|willst)\b|(^|[.!?:]\s+)(Wähle|Lege|Gib|Lade|Prüfe|Trage|Nimm|Fülle|Sprich|Teile|Ruf|Transportiere|Bitte (frage|wende|überweise))\b/;
    const chat = new Set(['c1', 'c2', 'c3', 'autoVet']);
    const hits = Object.entries(s.de).filter(([k, v]) => !chat.has(k) && du.test(v)).map(([k]) => k);
    expect(hits).toEqual([]);
  });

  test('spanische Texte siezen (usted)', async ({ page }) => {
    const s = await loadStrings(page);
    const tu = /\b(tu|tus|tienes|puedes|quieres)\b|(^|[.!?:¿¡]\s*)(Elige|Añade|Selecciona|Observa|Introduce|No esperes|Llama|Ve ya)\b/;
    const hits = Object.entries(s.es).filter(([, v]) => tu.test(v)).map(([k, v]) => `${k}: ${v}`);
    expect(hits).toEqual([]);
  });

  test('Absage unter 24 Stunden: in jeder Sprache Hinweis auf mögliche Kosten', async ({ page }) => {
    const s = await loadStrings(page);
    const cost: Record<string, RegExp> = {
      de: /Kosten/, en: /fee/, fr: /frais/, ar: /رسوم/, nl: /kosten/, es: /gastos/, ru: /сч[её]т|плат/, tr: /ücret/, sv: /avgift/, da: /gebyr/, no: /gebyr/,
    };
    for (const l of LANGS) {
      expect(s[l].ownCancelLate, `${l}.ownCancelLate`).toMatch(cost[l]);
      expect(s[l].cancelNote, `${l}.cancelNote`).toMatch(cost[l]);
      expect(s[l].cancelNote, `${l}.cancelNote`).toContain('24');
    }
  });

  test('Arabisch, Ergebnis GELB: Tier tierärztlich untersuchen lassen', async ({ page }) => {
    const s = await loadStrings(page);
    expect(s.ar.rWarnT).toContain('الطبيب البيطري');
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
