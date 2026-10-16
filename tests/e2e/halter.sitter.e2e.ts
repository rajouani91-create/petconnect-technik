import { expect, test, type Browser, type Page } from '@playwright/test';
import { APP_URL, NOW, goView, main, openAsOwner, toast } from './helpers';

/** Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter“ – Betreuung, Teilen, Co-Halter (Browser-Tests gegen index.html). */

interface Sitter {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly feed?: string;
  readonly med?: string;
}

async function openSitter(page: Page): Promise<void> {
  await goView(page, 'akte');
  await page.locator('[data-act="subOpen"][data-v="sitter"]').click();
}

async function createSitter(page: Page, s: Sitter): Promise<void> {
  await page.locator('#f-sitName').fill(s.name);
  await page.locator('#f-sitFrom').fill(s.from);
  await page.locator('#f-sitTo').fill(s.to);
  await page.locator('#f-sitFeed').fill(s.feed ?? 'Morgens und abends Nassfutter');
  await page.locator('#f-sitMed').fill(s.med ?? 'Keine');
  await page.locator('[data-act="sitSave"]').click();
}

/** Liest den Betreuungslink aus dem WhatsApp-Link der Einladungskarte (Index = Reihenfolge der Karten). */
async function sitterHash(page: Page, index = 0): Promise<string> {
  const href = await main(page).locator('a[href^="https://wa.me/"]').nth(index).getAttribute('href');
  const m = /https:\/\/petconnect24\.com\/(#\/b\/\S+)/.exec(decodeURIComponent(href ?? ''));
  if (!m?.[1]) throw new Error('Kein Betreuungslink gefunden');
  return m[1];
}

/** Öffnet den Betreuungslink in einem frischen Browser („anderes Gerät“, ohne Anmeldung). */
async function openOnOtherDevice(browser: Browser, hash: string, now: Date = NOW): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const other = await ctx.newPage();
  await other.clock.setFixedTime(now);
  await other.goto(APP_URL + hash);
  return other;
}

const sitterPage = (p: Page) => p.locator('#main');

test.describe('Betreuung (Sitter)', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
  });

  test('H-117 (Zeile 118): Betreuung anlegen → Eintrag in Liste, Einladungskarte mit QR-Code und Link', async ({ page }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    await expect(main(page)).toContainText(/Oma Erika\s*14\.10\.2026 – 20\.10\.2026/);
    await expect(main(page)).toContainText('Einladung & QR-Code');
    await expect(main(page).locator('svg[aria-label="QR"]')).toBeVisible();
    await expect(main(page)).toContainText('https://petconnect24.com/#/b/');
  });

  test.describe('mit Zwischenablage', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('H-119 (Zeile 120): „Link kopieren“ → Meldung „Link kopiert“, Zwischenablage enthält den Link', async ({ page }) => {
      await openSitter(page);
      await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
      await page.locator('[data-act="sitCopy"]').click();
      await expect(toast(page)).toContainText(/Link kopiert/i);
      const clip = String(await page.evaluate('navigator.clipboard.readText()'));
      expect(clip).toContain('https://petconnect24.com/' + (await sitterHash(page)));
    });
  });

  test('H-120 (Zeile 121): Teilen / WhatsApp / E-Mail → fertiger Text mit Link', async ({ page }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    const link = 'https://petconnect24.com/' + (await sitterHash(page));
    const wa = decodeURIComponent((await main(page).locator('a[href^="https://wa.me/"]').getAttribute('href')) ?? '');
    expect(wa).toContain('Luna');
    expect(wa).toContain(link);
    const mail = decodeURIComponent((await main(page).locator('a[href^="mailto:"]').getAttribute('href')) ?? '');
    expect(mail).toMatch(/subject=Betreuung von Luna/);
    expect(mail).toContain(link);
    await page.evaluate('window.__shared = null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };');
    await page.locator('[data-act="sitShare"]').click();
    const shared = (await page.evaluate('window.__shared')) as { url?: string; text?: string } | null;
    expect(shared?.url).toBe(link);
  });

  test('H-121 (Zeile 122): Link auf anderem Gerät → „Betreuung von Luna“ mit Futter, Medikation, Notfallkarte, Stammpraxis-Anruf, Besitzername', async ({ page, browser }) => {
    await goView(page, 'profil');
    await page.locator('[data-act="stammSet"][data-v="p1"]').click();
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20', feed: 'Morgens 200 g Nassfutter', med: 'Ohrentropfen abends' });
    const other = await openOnOtherDevice(browser, await sitterHash(page));
    const view = sitterPage(other);
    await expect(view).toContainText('Betreuung von Luna');
    for (const text of ['Morgens 200 g Nassfutter', 'Ohrentropfen abends', 'Notfallkarte', '276 098 106 452 731', 'Tierarztpraxis am Ostpark', 'Ahmed']) {
      await expect(view, text).toContainText(text);
    }
    await expect(view.locator('a[href^="tel:"], [data-act*="all"]').first(), 'Anruf-Button Stammpraxis').toBeVisible();
  });

  test('H-122 (Zeile 123): Betreuungsseite zeigt keine privaten Daten (keine Rechnungen, keine Akte, keine App-Navigation)', async ({ page, browser }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    const other = await openOnOtherDevice(browser, await sitterHash(page));
    await expect(sitterPage(other)).toContainText('Betreuung von Luna');
    await expect(other.locator('nav')).toBeHidden();
    // Der Hinweistext „keine Gesundheitsakte, keine Rechnungen“ ist erlaubt – geprüft werden echte Akten- und Rechnungsdaten
    for (const text of ['Befunde', 'Impfungen', 'Transponder', 'Hühnereiweiß', '€', 'Versicherung']) {
      await expect(sitterPage(other), text).not.toContainText(text);
    }
  });

  test('H-123 (Zeile 124): Link vor Beginn des Zeitraums → Hinweis „Gilt ab <Datum>“, Infos sichtbar', async ({ page, browser }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Tim', from: '2026-10-20', to: '2026-10-25', feed: 'Trockenfutter' });
    const other = await openOnOtherDevice(browser, await sitterHash(page));
    await expect(sitterPage(other)).toContainText(/Gilt ab 20\.10\.2026/);
    await expect(sitterPage(other)).toContainText('Trockenfutter');
  });

  test('H-124 (Zeile 125): Link nach Ablauf → Meldung „nicht mehr gültig“, keine Infos', async ({ page, browser }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Tim', from: '2026-10-14', to: '2026-10-16', feed: 'Trockenfutter' });
    const other = await openOnOtherDevice(browser, await sitterHash(page), new Date('2026-11-01T10:00:00+01:00'));
    await expect(sitterPage(other)).toContainText(/nicht mehr gültig/i);
    await expect(sitterPage(other)).not.toContainText('Trockenfutter');
  });

  test('H-125 (Zeile 126): ungültiger (gekürzter/veränderter) Link → App startet normal, kein Absturz', async ({ page, browser }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Tim', from: '2026-10-14', to: '2026-10-20' });
    const hash = await sitterHash(page);
    const other = await openOnOtherDevice(browser, hash.slice(0, hash.length - 25) + 'XYZ');
    const errors: string[] = [];
    other.on('pageerror', (e) => errors.push(String(e)));
    await other.reload();
    expect(errors).toEqual([]);
    // Normaler Start auf einem fremden Gerät = Anmeldeseite (keine Daten der Halter:in ohne Login)
    await expect(other.locator('[data-act="demo"]')).toBeVisible();
  });

  test('H-126 (Zeile 127): Sonderzeichen, Umlaute und Emoji → auf Betreuungsseite korrekt dargestellt', async ({ page, browser }) => {
    const feed = 'Nur Hühnchen & Möhren – Größe „M“, ÄÖÜß 🐶🦴';
    await openSitter(page);
    await createSitter(page, { name: 'Jürgen Öztürk', from: '2026-10-14', to: '2026-10-20', feed });
    const other = await openOnOtherDevice(browser, await sitterHash(page));
    await expect(sitterPage(other)).toContainText(feed);
    await expect(sitterPage(other)).toContainText('Jürgen Öztürk');
  });

  test('H-127 (Zeile 128): Texte über 250 Zeichen → werden auf 250 gekürzt, QR bleibt vorhanden', async ({ page, browser }) => {
    const long = 'Futter '.repeat(60); // 420 Zeichen
    await openSitter(page);
    await createSitter(page, { name: 'Tim', from: '2026-10-14', to: '2026-10-20', feed: long, med: long });
    await expect(main(page).locator('svg[aria-label="QR"]')).toBeVisible();
    const other = await openOnOtherDevice(browser, await sitterHash(page));
    const shown = await sitterPage(other).getByText(/^(Futter )+/).first().innerText();
    expect(shown.length).toBeLessThanOrEqual(250);
    expect(shown.length).toBeGreaterThan(200);
  });

  test('H-128 (Zeile 129): „Karte drucken“ → Druckseite mit Tiername, Zeitraum, großem QR', async ({ page }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-act="sitPrintQr"]').click();
    const popup = await popupPromise;
    await expect(popup.locator('h1')).toHaveText('Luna');
    await expect(popup.locator('body')).toContainText('14.10.2026 – 20.10.2026');
    const box = await popup.locator('svg').first().boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
  });

  test('H-129 (Zeile 130): Widerrufen → Eintrag und Einladungskarte verschwinden, Hinweis zur Gültigkeit verschickter Links', async ({ page }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    await expect(main(page)).toContainText('Widerrufen wirkt erst in der echten App');
    await page.locator('[data-act="sitRevoke"]').click();
    await expect(main(page)).not.toContainText('Einladung & QR-Code');
    await expect(main(page)).not.toContainText('Oma Erika');
  });

  test('H-130 (Zeile 131): zwei Betreuer:innen → je eine Einladungskarte mit eigenem QR', async ({ page }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    await createSitter(page, { name: 'Nachbar Tim', from: '2026-10-21', to: '2026-10-25' });
    await expect(main(page).locator('svg[aria-label="QR"]')).toHaveCount(2);
    expect(await sitterHash(page, 0)).not.toBe(await sitterHash(page, 1));
  });

  test('H-131 (Zeile 132): Sprache der Betreuungsseite wechseln → Texte in gewählter Sprache, Arabisch von rechts nach links', async ({ page, browser }) => {
    await openSitter(page);
    await createSitter(page, { name: 'Oma Erika', from: '2026-10-14', to: '2026-10-20' });
    const other = await openOnOtherDevice(browser, await sitterHash(page));
    await expect(sitterPage(other)).toContainText('Betreuung von Luna');
    const lang = other.locator('select[data-lang-select]:visible').first();
    await lang.selectOption('en');
    await expect(sitterPage(other)).not.toContainText('Betreuung von Luna');
    await expect(sitterPage(other)).toContainText(/Luna/);
    await expect(sitterPage(other)).toContainText(/Feeding|care/i);
    await lang.selectOption('ar');
    await expect(other.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});

test.describe('Teilen & Co-Halter', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'akte');
  });

  test('H-132 (Zeile 133): Freigabe-Link erzeugen → QR-Code, Prototyp-Hinweis zum Link-Ziel', async ({ page }) => {
    await page.locator('[data-act="subOpen"][data-v="share"]').click();
    await page.locator('[data-act="shCreate"]').click();
    await expect(main(page)).not.toContainText('Noch keine Links.');
    await expect(main(page).locator('svg[aria-label="QR"]').first()).toBeVisible();
    await expect(main(page)).toContainText(/Prototyp/);
  });

  test('H-133 (Zeile 134): Co-Halter einladen → Eintrag „Einladung offen“', async ({ page }) => {
    await page.locator('[data-act="subOpen"][data-v="sitter"]').click();
    await page.locator('#f-coMail').fill('partnerin@example.com');
    await page.locator('[data-act="coInvite"]').click();
    await expect(main(page)).toContainText('partnerin@example.com');
    await expect(main(page)).toContainText(/Einladung offen|Eingeladen/i);
  });
});
