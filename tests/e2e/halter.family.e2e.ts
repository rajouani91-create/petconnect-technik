import { expect, test, type Page } from '@playwright/test';
import { goView, main, openAsOwner, toast } from './helpers';

/** Familie & Mithalter:innen: ein Tierprofil mit mehreren Personen teilen (Partner:in, Familie mit 1–3 Tieren). */

const card = (page: Page) => page.locator('#hh-card');
const member = (page: Page, name: string) => card(page).locator('.row').filter({ hasText: name });

async function invite(page: Page, name: string, mail: string, opts: { view?: boolean; without?: string[] } = {}): Promise<void> {
  await page.locator('#f-hhName').fill(name);
  await page.locator('#f-hhMail').fill(mail);
  if (opts.view) await card(page).locator('[data-act="hhRoleSel"][data-v="view"]').click();
  for (const pid of opts.without ?? []) await card(page).locator(`[data-act="hhPetTog"][data-v="${pid}"]`).click();
  await card(page).locator('[data-act="hhInvite"]').click();
}

test.describe('Familie & Mithalter:innen', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'profil');
  });

  test('Partnerin für alle Tiere einladen → Eintrag „Eingeladen“, Tierakte zeigt „Geteilt mit“', async ({ page }) => {
    await expect(card(page)).toContainText('Haupthalter:in');
    await invite(page, 'Sara', 'sara@example.org');
    await expect(toast(page)).toContainText('sara@example.org');
    await expect(member(page, 'Sara')).toContainText('Eingeladen');
    await expect(member(page, 'Sara')).toContainText('Mithalter:in');
    await expect(member(page, 'Sara')).toContainText(/Luna, Mio/);
    await goView(page, 'akte');
    await expect(main(page).locator('[data-hh-shared]')).toContainText('Sara · Mithalter:in');
  });

  test('Familie teilt nur den Hund → Katze bleibt privat', async ({ page }) => {
    await invite(page, 'Familie Yilmaz', 'yilmaz@example.org', { without: ['mio'] });
    await expect(member(page, 'Familie Yilmaz')).toContainText('Luna');
    await expect(member(page, 'Familie Yilmaz')).not.toContainText('Mio');
    await goView(page, 'akte');
    await page.locator('[data-pet-akte="mio"]').click();
    await expect(main(page).locator('[data-hh-shared]')).toHaveCount(0);
    await page.locator('[data-pet-akte="luna"]').click();
    await expect(main(page).locator('[data-hh-shared]')).toContainText('Familie Yilmaz');
  });

  test('Pflichtfelder, ungültige E-Mail, doppelte Einladung und kein Tier werden abgefangen', async ({ page }) => {
    await card(page).locator('[data-act="hhInvite"]').click();
    await expect(card(page)).toContainText('Bitte einen Namen angeben.');
    await expect(card(page)).toContainText('Bitte eine gültige E-Mail-Adresse angeben.');
    await invite(page, 'Sara', 'sara@example.org');
    await invite(page, 'Sara 2', 'SARA@example.org');
    await expect(card(page)).toContainText('Diese Person ist schon eingeladen.');
    await page.locator('#f-hhMail').fill('tim@example.org');
    await card(page).locator('[data-act="hhPetTog"][data-v="luna"]').click();
    await card(page).locator('[data-act="hhPetTog"][data-v="mio"]').click();
    await card(page).locator('[data-act="hhInvite"]').click();
    await expect(card(page)).toContainText('Bitte mindestens ein Tier auswählen.');
    await expect(card(page).locator('.row').filter({ hasText: 'tim@example.org' })).toHaveCount(0);
  });

  test('„Nur ansehen“ und Annahme → Status „Aktiv“', async ({ page }) => {
    await invite(page, 'Oma Erika', 'erika@example.org', { view: true });
    await expect(member(page, 'Oma Erika')).toContainText('Nur ansehen');
    await member(page, 'Oma Erika').locator('[data-act="hhAccept"]').click();
    await expect(member(page, 'Oma Erika')).toContainText('Aktiv');
    await expect(member(page, 'Oma Erika').locator('[data-act="hhAccept"]')).toHaveCount(0);
  });

  test('Entfernen erst nach Bestätigung, Abbrechen behält die Person', async ({ page }) => {
    await invite(page, 'Sara', 'sara@example.org');
    await member(page, 'Sara').locator('[data-act="hhRemove"]').click();
    await expect(member(page, 'Sara')).toContainText('wirklich entfernen');
    await card(page).locator('[data-act="hhRemoveNo"]').click();
    await expect(member(page, 'Sara')).toHaveCount(1);
    await member(page, 'Sara').locator('[data-act="hhRemove"]').click();
    await card(page).locator('[data-act="hhRemoveYes"]').click();
    await expect(member(page, 'Sara')).toHaveCount(0);
    await goView(page, 'akte');
    await expect(main(page).locator('[data-hh-shared]')).toHaveCount(0);
  });

  test('Einladung bleibt nach dem Neuladen erhalten', async ({ page }) => {
    await invite(page, 'Sara', 'sara@example.org');
    await page.waitForTimeout(600); // Prototyp speichert verzögert (400 ms) im Browser
    await page.reload();
    await goView(page, 'profil');
    await expect(member(page, 'Sara')).toContainText('Eingeladen');
  });
});
