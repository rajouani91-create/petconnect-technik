import { expect, test } from '@playwright/test';
import { goView, main, openAsOwner } from './helpers';

/** Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter“ – Notfall & SOS (Browser-Tests gegen index.html). */

test.describe('Notfall & SOS', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
  });

  test('H-158 (Zeile 159): „Stammpraxis anrufen“ → Telefon-Link (tel:) mit richtiger Nummer', async ({ page }) => {
    await goView(page, 'profil');
    await page.locator('[data-act="stammSet"][data-v="p1"]').click();
    await goView(page, 'notfall');
    const call = main(page).getByRole('link', { name: /Stammpraxis anrufen/ });
    await expect(call, 'Anruf muss ein tel:-Link sein').toHaveCount(1);
    const href = (await call.getAttribute('href')) ?? '';
    expect(href).toMatch(/^tel:\+?[\d ]{6,}$/);
  });

  test('H-159 (Zeile 160): keine Stammpraxis → Hinweis „Keine Stammpraxis hinterlegt“', async ({ page }) => {
    await goView(page, 'notfall');
    await expect(main(page)).toContainText('Keine Stammpraxis hinterlegt');
    await expect(main(page).locator('[data-act="sosCall"]')).toHaveCount(0);
  });
});
