import { expect, test } from '@playwright/test';
import { goView, main, openAsOwner, switchRole } from './helpers';

/** Buchungsfenster über mehrere Wochen (Halter) – ergänzt die Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter“ (Termine). */

const days = (page: import('@playwright/test').Page) => page.locator('[data-day]');
const next = (page: import('@playwright/test').Page) => page.locator('[data-act="bkPage"][data-v="1"]');

test.describe('Termine buchen – mehrere Wochen im Voraus', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'termine');
  });

  test('Standard 8 Wochen: erste Seite zeigt 14 Tage, Blättern reicht bis in den Dezember, am Ende ist „Nächste“ gesperrt', async ({ page }) => {
    await expect(days(page)).toHaveCount(14);
    await expect(days(page).first()).toContainText('14.10.');
    for (let i = 0; i < 3; i++) await next(page).click();
    await expect(days(page).last()).toContainText('08.12.');
    await expect(next(page)).toBeDisabled();
    await page.locator('[data-act="bkPage"][data-v="-1"]').click();
    await expect(days(page).first()).toContainText('11.11.');
  });

  test('Termin auf der zweiten Seite buchen → erscheint mit Wochentag und Uhrzeit in „Meine Termine“', async ({ page }) => {
    await next(page).click();
    await expect(days(page).first()).toContainText('28.10.');
    await days(page).and(page.locator(':enabled')).first().click();
    const slot = (await page.locator('[data-slot]:enabled').first().getAttribute('data-slot')) ?? '';
    expect(slot).toMatch(/^\d\d:\d\d$/);
    await page.locator(`[data-slot="${slot}"]`).click();
    await page.locator('#rulechk').check();
    await page.locator('#bookbtn').click();
    await expect(main(page).locator('.brow').filter({ hasText: `Mi ${slot}` })).toBeVisible();
  });

  test('Sonntage bleiben auch auf späteren Seiten gesperrt', async ({ page }) => {
    await next(page).click();
    await expect(days(page).filter({ hasText: '01.11.' })).toBeDisabled(); // Sonntag
  });

  test('Praxis stellt 4 Wochen ein → Halter kann nur eine zweite Seite blättern', async ({ page }) => {
    await switchRole(page, 'vet');
    await goView(page, 'vkalender');
    await page.locator('[data-act="bkWeeks"][data-v="4"]').click();
    await expect(page.locator('[data-act="bkWeeks"][data-v="4"]')).toHaveAttribute('aria-pressed', 'true');
    await switchRole(page, 'owner');
    await goView(page, 'termine');
    await expect(days(page)).toHaveCount(14);
    await next(page).click();
    await expect(days(page)).toHaveCount(14);
    await expect(days(page).last()).toContainText('10.11.');
    await expect(next(page)).toBeDisabled();
  });
});

test.describe('Termine buchen – Feiertag auf späterer Seite', () => {
  test('25.12. ist auf der zweiten Seite gesperrt', async ({ page }) => {
    await openAsOwner(page, new Date('2026-12-01T10:00:00+01:00'));
    await goView(page, 'termine');
    await next(page).click();
    await expect(days(page).filter({ hasText: '25.12.' })).toBeDisabled();
  });
});
