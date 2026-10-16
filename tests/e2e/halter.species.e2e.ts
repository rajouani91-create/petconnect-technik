import { expect, test, type Page } from '@playwright/test';
import { goView, main, openAsOwner } from './helpers';

/** Tierarten mit Vorlagen (Etappe 19): bekannteste Tierarten zur Auswahl, „Andere Tierart“ mit freiem Feld,
 *  Vorlage für Tagesplan und Vorsorge je Art. */

const pick = (page: Page, sp: string) => page.locator(`[data-act="spPick"][data-v="${sp}"]`);

async function openNewPet(page: Page): Promise<void> {
  await goView(page, 'profil');
  await page.locator('[data-act="newPet"]').click();
}

test.describe('Tierarten mit Vorlagen', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await openNewPet(page);
  });

  test('Acht Tierarten zur Auswahl, Hund ist vorausgewählt und zeigt seine Vorlage', async ({ page }) => {
    await expect(page.locator('[data-act="spPick"]')).toHaveText(['Hund', 'Katze', 'Kaninchen', 'Meerschweinchen', 'Vogel', 'Reptil', 'Pferd', 'Anderes Tier']);
    await expect(pick(page, 'dog')).toHaveAttribute('aria-pressed', 'true');
    const tpl = page.locator('#tpl-card');
    await expect(tpl).toContainText('Gassirunde');
    await expect(tpl).toContainText('Impfung Tollwut');
    await expect(tpl).toContainText('noch nicht tierärztlich geprüft');
    await expect(page.locator('#f-species')).toHaveCount(0);
  });

  test('Kaninchen anlegen: Tagesplan aus der Vorlage und Vorsorge in der Tierakte', async ({ page }) => {
    await page.locator('#f-petName').fill('Hoppel');
    await pick(page, 'rabbit').click();
    await expect(pick(page, 'rabbit')).toBeFocused();
    await expect(page.locator('#tpl-card')).toContainText('Gehege reinigen');
    await expect(page.locator('#tpl-card')).toContainText('Impfung RHD');
    await page.locator('[data-act="addPet"]').click();
    await expect(main(page).locator('#care-card')).toContainText('Vorsorge für Hoppel');
    await expect(main(page).locator('#care-card')).toContainText('Impfung Myxomatose');
    await goView(page, 'erinnerung');
    await page.locator('#gp-card [data-act="gpPet"]').filter({ hasText: 'Hoppel' }).click();
    await expect(page.locator('#gp-card h2')).toHaveText('Tagesablauf');
    await expect(page.locator('#gp-card .gp-row')).toHaveCount(3);
    await expect(page.locator('#gp-card')).toContainText('Gehege reinigen');
  });

  test('Ohne Vorlage anlegen: Tagesplan bleibt leer und bietet die Vorlage später an', async ({ page }) => {
    await page.locator('#f-petName').fill('Pieps');
    await pick(page, 'bird').click();
    await page.locator('[data-act="tplUse"]').click();
    await expect(page.locator('[data-act="tplUse"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-act="addPet"]').click();
    await goView(page, 'erinnerung');
    await page.locator('#gp-card [data-act="gpPet"]').filter({ hasText: 'Pieps' }).click();
    await expect(page.locator('#gp-card .gp-row')).toHaveCount(0);
    await page.locator('[data-act="gpSuggest"]').click();
    await expect(page.locator('#gp-card .gp-row')).toHaveCount(2);
  });

  test('Katze als Freigänger: Vorsorge enthält Tollwut für Freigänger', async ({ page }) => {
    await page.locator('#f-petName').fill('Minka');
    await pick(page, 'cat').click();
    await expect(page.locator('#tpl-card')).not.toContainText('Freigänger');
    await page.locator('[data-act="spCat"][data-v="out"]').click();
    await expect(page.locator('#tpl-card')).toContainText('Impfung Tollwut für Freigänger');
  });

  test('Andere Tierart: Pflichtfeld, danach erscheint der eigene Name überall', async ({ page }) => {
    await page.locator('#f-petName').fill('Shelly');
    await pick(page, 'otherAnimal').click();
    await expect(page.locator('#tpl-card')).toContainText('keine Vorlage');
    await page.locator('[data-act="addPet"]').click();
    await expect(page.locator('#f-speciesOther')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-speciesOther')).toHaveText('Bitte geben Sie die Tierart an.');
    await page.locator('#f-speciesOther').fill('Schildkröte');
    await page.locator('[data-act="addPet"]').click();
    await expect(main(page)).toContainText('Schildkröte');
    await expect(main(page).locator('#care-card')).toContainText('Vorsorge mit Ihrer Praxis besprechen');
  });

  test('Pferd: Stall wird gespeichert, Tagesplan mit Box misten', async ({ page }) => {
    await page.locator('#f-petName').fill('Fuchsi');
    await pick(page, 'horse').click();
    await page.locator('#f-stallName').fill('Reiterhof am Wald');
    await page.locator('[data-act="addPet"]').click();
    await expect(main(page).locator('#care-card')).toContainText('Reiterhof am Wald');
    await expect(main(page).locator('#care-card')).toContainText('Hufschmied');
    await goView(page, 'erinnerung');
    await page.locator('#gp-card [data-act="gpPet"]').filter({ hasText: 'Fuchsi' }).click();
    await expect(page.locator('#gp-card')).toContainText('Box misten');
  });

  test('Bei 320 px kein seitliches Scrollen im Formular', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.locator('.sp-grid')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
