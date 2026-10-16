import { expect, test, type Page } from '@playwright/test';
import { goView, openAsOwner } from './helpers';

/** Praxissuche (Etappe 20): nach Tierart, Leistungen und Fachtierarzt-Bezeichnung filtern. */

const card = (page: Page) => page.locator('#ps-card');
const sp = (page: Page, v: string) => card(page).locator(`[data-act="psSp"][data-v="${v}"]`);
const svc = (page: Page, v: string) => card(page).locator(`[data-act="psSvc"][data-v="${v}"]`);
const title = (page: Page, v: string) => card(page).locator(`[data-act="psTitle"][data-v="${v}"]`);
const hits = (page: Page) => card(page).locator('.list').first().locator('.row');

test.describe('Praxissuche', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'profil');
  });

  test('Ohne Filter: alle Praxen wie bisher, Angebot je Praxis sichtbar, Hinweis auf Selbstangabe', async ({ page }) => {
    await expect(card(page).locator('.row')).toHaveCount(6);
    await expect(sp(page, '')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page).locator('[data-prac="p2"]')).toContainText('Fachtierarzt für Reptilien');
    await expect(card(page).locator('[data-prac="p2"]')).toContainText('Überwinterung (Winterstarre-Betreuung)');
    await expect(card(page)).toContainText('gibt jede Praxis selbst in ihrem Profil an');
    await expect(card(page)).toContainText('Beispieldaten');
  });

  test('Eigene Tiere stehen bei ihrer Tierart', async ({ page }) => {
    await expect(sp(page, 'dog')).toContainText('Luna');
    await expect(sp(page, 'cat')).toContainText('Mio');
  });

  test('Reptil + Überwinterung: nur die passende Praxis, Schwerpunkt-Abzeichen', async ({ page }) => {
    await sp(page, 'reptile').click();
    await expect(sp(page, 'reptile')).toHaveAttribute('aria-pressed', 'true');
    await expect(sp(page, 'reptile')).toBeFocused();
    await svc(page, 'svcHib').click();
    await expect(card(page).locator('#ps-count')).toHaveText('1 Praxis bei PetConnect passt');
    await expect(hits(page)).toHaveCount(1);
    await expect(hits(page).first()).toHaveAttribute('data-prac', 'p2');
    await expect(hits(page).first()).toContainText('Schwerpunkt: Reptil');
  });

  test('Pferd: Fahrpraxis-Praxis zuerst; Blutspende dazu ergibt keinen Treffer mit Hinweis', async ({ page }) => {
    await sp(page, 'horse').click();
    await expect(hits(page)).toHaveCount(1);
    await expect(hits(page).first()).toHaveAttribute('data-prac', 'p3');
    await svc(page, 'svcBlood').click();
    await expect(card(page).locator('#ps-none')).toContainText('Keine Praxis bei PetConnect passt');
  });

  test('Hund + Operationen: zwei Treffer, Fachtierarzt für Chirurgie grenzt auf eine ein', async ({ page }) => {
    await sp(page, 'dog').click();
    await svc(page, 'svcOp').click();
    await expect(card(page).locator('#ps-count')).toHaveText('2 Praxen bei PetConnect passen');
    await title(page, 'fSurg').click();
    await expect(hits(page)).toHaveCount(1);
    await expect(hits(page).first()).toHaveAttribute('data-prac', 'p2');
  });

  test('Praxen ohne Angaben erscheinen getrennt mit „bitte anrufen“, nicht unter den Treffern', async ({ page }) => {
    await svc(page, 'svcEr').click();
    await expect(card(page).locator('#ps-none')).toBeVisible();
    const unknown = card(page).locator('#ps-unknown .row');
    await expect(unknown).toHaveCount(3);
    await expect(unknown.first()).toContainText('Angebot unbekannt, bitte anrufen');
  });

  test('Nochmal klicken hebt die Tierart auf, Zurücksetzen leert alles', async ({ page }) => {
    await sp(page, 'cat').click();
    await sp(page, 'cat').click();
    await expect(sp(page, '')).toHaveAttribute('aria-pressed', 'true');
    await sp(page, 'bird').click();
    await svc(page, 'svcDent').click();
    await card(page).locator('[data-act="psReset"]').click();
    await expect(card(page).locator('.row')).toHaveCount(6);
    await expect(svc(page, 'svcDent')).toHaveAttribute('aria-pressed', 'false');
    await expect(sp(page, '')).toBeFocused();
  });

  test('Favorit steht bei Treffern oben, Stammpraxis bleibt wählbar', async ({ page }) => {
    await card(page).locator('[data-act="favTog"][data-v="p2"]').click();
    await sp(page, 'dog').click();
    await expect(hits(page).first()).toHaveAttribute('data-prac', 'p2');
    await card(page).locator('[data-act="stammSet"][data-v="p1"]').click();
    await expect(card(page).locator('[data-act="stammSet"][data-v="p1"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Trefferzahl wird für Screenreader angesagt', async ({ page }) => {
    await sp(page, 'reptile').click();
    await expect(page.locator('#ps-live')).toHaveText('1 Praxis bei PetConnect passt');
  });

  test('Bei 320 px kein seitliches Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await sp(page, 'dog').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
