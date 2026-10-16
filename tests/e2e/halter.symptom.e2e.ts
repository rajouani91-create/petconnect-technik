import { expect, test, type Page } from '@playwright/test';
import { goView, main, openAsOwner, switchRole, toast } from './helpers';

/** Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter“ – Symptomcheck (Browser-Tests gegen index.html). */

async function check(page: Page, symptoms: readonly string[], dauer = '<24h', ruhig = 'normal'): Promise<void> {
  for (const s of symptoms) await page.locator(`[data-sym="${s}"]`).click();
  await page.locator('#dauer').selectOption(dauer);
  await page.locator('#ruhig').selectOption(ruhig);
  await page.locator('#checkbtn').click();
  await expect(main(page).locator('.result')).toBeVisible();
}

async function openRequests(page: Page): Promise<void> {
  await switchRole(page, 'vet');
  await goView(page, 'vanfragen');
}

const symRequests = (page: Page) => main(page).locator('.brow, .row').filter({ hasText: 'Symptomcheck: ' }).filter({ hasText: 'Ahmed' });

test.describe('Symptomcheck', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'symptom');
  });

  test('H-068 (Zeile 69): Ergebnis an Praxis senden → „Gesendet“, Praxis sieht Tier, Symptome, Dauer, Befinden, Dringlichkeit; ROT oben', async ({ page }) => {
    await check(page, ['s_cough', 's_breath']);
    await page.locator('[data-act="symSend"]').click();
    await expect(toast(page)).toContainText('Gesendet');
    await openRequests(page);
    const first = main(page).locator('.brow, .row').filter({ hasText: /Termin anbieten/ }).first();
    await expect(first).toContainText('Notfall');
    await expect(first).toContainText('Ahmed · Luna');
    await expect(first).toContainText('Husten, Atemnot');
    await expect(first).toContainText('Dauer: Weniger als 24 Stunden');
    await expect(first).toContainText('Allgemeinbefinden: Munter, wie immer');
  });

  test('H-069 (Zeile 70): zweimal dasselbe senden → Button durch „Gesendet“ ersetzt, kein Duplikat', async ({ page }) => {
    await check(page, ['s_cough']);
    await page.locator('[data-act="symSend"]').click();
    await expect(page.locator('[data-act="symSend"]')).toHaveCount(0);
    await expect(main(page).locator('.result')).toContainText('Gesendet');
    await page.locator('#checkbtn').click(); // unverändert erneut prüfen
    await expect(page.locator('[data-act="symSend"]')).toHaveCount(0);
    await openRequests(page);
    await expect(symRequests(page)).toHaveCount(1);
  });

  test('H-070 (Zeile 71): geänderte Eingabe erneut senden → zweite Anfrage entsteht', async ({ page }) => {
    await check(page, ['s_cough']);
    await page.locator('[data-act="symSend"]').click();
    await page.locator('[data-sym="s_itch"]').click();
    await page.locator('#checkbtn').click();
    await page.locator('[data-act="symSend"]').click();
    await openRequests(page);
    await expect(symRequests(page)).toHaveCount(2);
  });

  test('H-071 (Zeile 72): Haftungshinweis „keine Diagnose“ ist sichtbar', async ({ page }) => {
    const note = main(page).getByText(/ersetzt keine tierärztliche Untersuchung oder Diagnose/);
    await expect(note).toBeVisible();
  });

  test('H-072 (Zeile 73): anderes Tier wählen → Ergebnis zurückgesetzt oder gehört zum gewählten Tier', async ({ page }) => {
    await check(page, ['s_cough']);
    await expect(main(page).locator('.result')).toContainText('Ergebnis für Luna');
    await page.locator('[data-pet-sym="mio"]').click();
    const result = main(page).locator('.result');
    if ((await result.count()) > 0) await expect(result).toContainText('Ergebnis für Mio');
  });
});
