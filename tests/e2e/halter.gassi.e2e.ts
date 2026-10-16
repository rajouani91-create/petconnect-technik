import { expect, test, type Page } from '@playwright/test';
import { goView, main, openAsOwner, toast } from './helpers';

/** Gassi- und Tagesplan (Etappe 18): eigener Plan, Erinnerungen pro Eintrag und alle zusammen an/aus.
 *  Fester Zeitpunkt aus helpers: Mittwoch, 14.10.2026, 10:00 Uhr. */

const card = (page: Page) => page.locator('#gp-card');
const row = (page: Page, text: string | RegExp) => card(page).locator('.gp-row').filter({ hasText: text });
const switches = (page: Page) => card(page).locator('.gp-row [role="switch"]');

test.describe('Gassi- und Tagesplan', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
  });

  test('Übersicht zeigt die nächste Gassirunde, „Plan öffnen“ führt zum Plan', async ({ page }) => {
    const home = page.locator('#gp-home');
    await expect(home).toContainText('Nächste Gassirunde');
    await expect(home).toContainText('12:30 Uhr');
    await expect(home).toContainText('in 2 Std. 30 Min.');
    await home.getByRole('button', { name: 'Plan öffnen' }).click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator('h2')).toHaveText('Gassi und Tagesablauf');
  });

  test('Beispielplan von Luna: sechs eigene Einträge, alle mit „von Ihnen“ markiert und eingeschaltet', async ({ page }) => {
    await goView(page, 'erinnerung');
    await expect(card(page).locator('.gp-row')).toHaveCount(6);
    await expect(card(page).locator('.gp-row .pill')).toHaveText(Array(6).fill('von Ihnen'));
    await expect(switches(page)).toHaveCount(6);
    for (const s of await switches(page).all()) await expect(s).toHaveAttribute('aria-checked', 'true');
    await expect(card(page).getByRole('switch', { name: 'Alle Erinnerungen' })).toHaveAttribute('aria-checked', 'true');
  });

  test('Eigene Erinnerung anlegen: Pflichtfeld, doppelte Uhrzeit, dann gespeichert', async ({ page }) => {
    await goView(page, 'erinnerung');
    await card(page).getByRole('button', { name: /Erinnerung hinzufügen/ }).click();
    const time = page.locator('#f-gpTime');
    await expect(time).toHaveValue('15:00');
    await expect(page.locator('#gp-form [data-act="gpType"][aria-pressed="true"]')).toBeFocused();

    await time.fill('');
    await page.locator('[data-act="gpSave"]').click();
    await expect(time).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-gpTime')).toHaveText('Bitte wählen Sie eine Uhrzeit.');

    await time.fill('18:00');
    await page.locator('[data-act="gpSave"]').click();
    await expect(page.locator('#err-gpTime')).toHaveText('Diese Erinnerung gibt es zu dieser Uhrzeit schon.');

    await page.locator('#gp-form [data-act="gpType"][data-v="own"]').click();
    await page.locator('#f-gpOwn').fill('Fell bürsten');
    await time.fill('19:15');
    await page.locator('#gp-form [data-act="gpRep"][data-v="we"]').click();
    await page.locator('[data-act="gpSave"]').click();
    await expect(toast(page)).toHaveText('Gespeichert: Fell bürsten, 19:15 Uhr.');
    await expect(row(page, 'Fell bürsten')).toContainText('19:15 Uhr · Sa und So · heute nicht');
    await expect(card(page).locator('.gp-row')).toHaveCount(7);
    await expect(page.locator('[data-act="gpOpen"]')).toBeFocused();
  });

  test('Einzelne Erinnerung aus- und wieder einschalten (Tastatur, Fokus bleibt)', async ({ page }) => {
    await goView(page, 'erinnerung');
    const sw = card(page).getByRole('switch', { name: 'Erinnerung für Gassirunde, 21:30 Uhr' });
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(sw).toBeFocused();
    await expect(toast(page)).toContainText('Erinnerung aus: Gassirunde, 21:30 Uhr.');
    await expect(card(page).getByRole('switch', { name: 'Alle Erinnerungen' })).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  test('„Alle Erinnerungen“ schaltet den ganzen Plan aus und wieder an, der Plan bleibt', async ({ page }) => {
    await goView(page, 'erinnerung');
    const all = card(page).getByRole('switch', { name: 'Alle Erinnerungen' });
    await all.click();
    await expect(all).toHaveAttribute('aria-checked', 'false');
    await expect(toast(page)).toContainText('Alle Erinnerungen für Luna sind aus. Ihr Plan bleibt gespeichert.');
    for (const s of await switches(page).all()) await expect(s).toHaveAttribute('aria-checked', 'false');
    await expect(card(page).locator('.gp-row')).toHaveCount(6);
    await all.click();
    for (const s of await switches(page).all()) await expect(s).toHaveAttribute('aria-checked', 'true');
  });

  test('„Wir waren draußen“ hakt die Runde ab, danach ist die nächste dran', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-14T12:40:00+02:00'));
    await goView(page, 'erinnerung');
    const next = card(page).locator('.gp-next');
    await expect(next).toContainText('12:30');
    await expect(next).toContainText('seit 10 Min. fällig');
    await next.getByRole('button', { name: 'Wir waren draußen' }).click();
    await expect(toast(page)).toHaveText('Gassirunde um 12:30 Uhr eingetragen.');
    await expect(row(page, '12:30 Uhr').getByRole('button', { name: 'Erledigt' })).toHaveAttribute('aria-pressed', 'true');
    await expect(next).toContainText('18:00');
  });

  test('Löschen nur nach Rückfrage; Abbrechen behält den Eintrag', async ({ page }) => {
    await goView(page, 'erinnerung');
    await card(page).getByRole('button', { name: 'Gassirunde, 12:30 Uhr löschen' }).click();
    await expect(row(page, '12:30 Uhr')).toContainText('wirklich aus dem Plan löschen?');
    await expect(card(page).getByRole('button', { name: 'Ja, löschen' })).toBeFocused();
    await card(page).getByRole('button', { name: 'Abbrechen' }).click();
    await expect(card(page).locator('.gp-row')).toHaveCount(6);
    await card(page).getByRole('button', { name: 'Gassirunde, 12:30 Uhr löschen' }).click();
    await card(page).getByRole('button', { name: 'Ja, löschen' }).click();
    await expect(card(page).locator('.gp-row')).toHaveCount(5);
    await expect(toast(page)).toHaveText('Gelöscht: Gassirunde, 12:30 Uhr.');
  });

  test('Katze Mio: „Tagesablauf“ ohne Gassi, eigener Plan je Tier', async ({ page }) => {
    await goView(page, 'erinnerung');
    await card(page).locator('[data-act="gpPet"][data-v="mio"]').click();
    await expect(card(page).locator('h2')).toHaveText('Tagesablauf');
    await expect(card(page).locator('.gp-row')).toHaveCount(3);
    await card(page).getByRole('button', { name: /Erinnerung hinzufügen/ }).click();
    const types = page.locator('#gp-form [data-act="gpType"]');
    await expect(types).toHaveText(['Füttern', 'Katzenklo', 'Medikament', 'Eigene']);
  });

  test('Kein Kanal aktiv → Hinweis, dass keine Erinnerungen ankommen', async ({ page }) => {
    await goView(page, 'erinnerung');
    await main(page).locator('[data-act="rsTog"][data-v="push"]').click();
    await main(page).locator('[data-act="rsTog"][data-v="mail"]').click();
    await expect(card(page)).toContainText('Push-Nachricht und E-Mail sind ausgeschaltet.');
  });

  test('Bei 320 px kein seitliches Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await goView(page, 'erinnerung');
    await expect(card(page)).toBeVisible();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(320);
  });
});
