import { expect, test, type Page } from '@playwright/test';
import { goView, main, openAsOwner, switchRole, toast } from './helpers';

/** Medikation durch Halter:innen (Etappe 21): Menge + Einheit, Uhrzeiten, Hinweis, Tagesplan, Notfallkarte, Gesundheitsakte.
 *  Fester Zeitpunkt aus helpers: Mittwoch, 14.10.2026, 10:00 Uhr. */

const card = (page: Page) => page.locator('#md-card');
const row = (page: Page, text: string | RegExp) => card(page).locator('.row').filter({ hasText: text });

async function addMed(page: Page, o: { name: string; amt: string; unit?: string; freq?: string; times?: string[]; hint?: string; by?: string }) {
  await card(page).getByRole('button', { name: /Medikament eintragen/ }).click();
  await page.locator('#f-omName').fill(o.name);
  await page.locator('#f-omAmt').fill(o.amt);
  if (o.unit) await page.locator('#f-omUnit').selectOption(o.unit);
  if (o.freq) await page.locator(`#om-form [data-act="omFreq"][data-v="${o.freq}"]`).click();
  for (const [i, tm] of (o.times ?? []).entries()) await page.locator(`#f-omT${i + 1}`).fill(tm);
  if (o.by) await page.locator('#f-omBy').fill(o.by);
  if (o.hint) await page.locator(`#om-form [data-act="omHint"][data-v="${o.hint}"]`).click();
  await page.locator('[data-act="omSave"]').click();
}

test.describe('Medikation durch Halter:innen', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'akte');
  });

  test('Sicherheitshinweis steht immer da; Praxis-Einträge sind nicht löschbar', async ({ page }) => {
    await expect(card(page).locator('.md-safe')).toContainText('PetConnect berechnet und empfiehlt keine Dosierungen');
    await expect(row(page, 'Wurmkur')).toContainText('Von der Praxis');
    await expect(card(page).getByRole('button', { name: /Löschen/ })).toHaveCount(0);
  });

  test('Pflichtfelder: Präparat und Menge als Zahl', async ({ page }) => {
    await card(page).getByRole('button', { name: /Medikament eintragen/ }).click();
    await expect(page.locator('#f-omName')).toBeFocused();
    await page.locator('[data-act="omSave"]').click();
    await expect(page.locator('#err-omName')).toHaveText('Bitte geben Sie das Präparat an.');
    await expect(page.locator('#f-omAmt')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#f-omName').fill('Meloxicam');
    await page.locator('#f-omAmt').fill('viel');
    await page.locator('[data-act="omSave"]').click();
    await expect(page.locator('#err-omAmt')).toContainText('als Zahl');
    await expect(page.locator('#err-omName')).toHaveCount(0);
  });

  test('2× täglich mit Futter → Dosierung, Tagesplan, Notfallkarte, Gesundheitsakte', async ({ page }) => {
    await addMed(page, { name: 'Meloxicam', amt: '0,5', unit: 'ml', freq: '2', times: ['08:00', '19:30'], hint: 'food', by: 'Tierarztpraxis am Ostpark' });
    await expect(toast(page)).toHaveText('Meloxicam eingetragen und in den Tagesplan übernommen.');
    const r = row(page, 'Meloxicam');
    await expect(r).toContainText('0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter');
    await expect(r).toContainText('von Ihnen');
    await expect(r).toContainText('verordnet von Tierarztpraxis am Ostpark');

    await goView(page, 'erinnerung');
    const gp = page.locator('#gp-card .gp-row').filter({ hasText: 'Meloxicam · 0,5 ml' });
    await expect(gp).toHaveCount(2);
    await expect(gp.first()).toContainText('aus der Medikation');
    await expect(gp.locator('[data-act="gpDel"]')).toHaveCount(0);

    await goView(page, 'notfall');
    await expect(main(page)).toContainText('Meloxicam – 0,5 ml · 2× täglich');

    await goView(page, 'akte');
    await page.locator('[data-act="subOpen"][data-v="vault"]').click();
    await expect(main(page)).toContainText('0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter');
  });

  test('Zwei gleiche Uhrzeiten werden abgelehnt; „bei Bedarf“ hat keine Uhrzeit', async ({ page }) => {
    await card(page).getByRole('button', { name: /Medikament eintragen/ }).click();
    await page.locator('#f-omName').fill('Gabapentin');
    await page.locator('#f-omAmt').fill('1');
    await page.locator('#om-form [data-act="omFreq"][data-v="2"]').click();
    await page.locator('#f-omT2').fill('08:00');
    await page.locator('[data-act="omSave"]').click();
    await expect(page.locator('#err-omT2')).toHaveText('Diese Uhrzeit ist schon eingetragen.');
    await page.locator('#om-form [data-act="omFreq"][data-v="prn"]').click();
    await expect(page.locator('#f-omT1')).toHaveCount(0);
    await page.locator('[data-act="omSave"]').click();
    await expect(toast(page)).toHaveText('Gabapentin eingetragen.');
    await expect(row(page, 'Gabapentin')).toContainText('1 Tablette · bei Bedarf');
    await goView(page, 'erinnerung');
    await expect(page.locator('#gp-card')).not.toContainText('Gabapentin');
  });

  test('Beenden entfernt die Erinnerungen, Löschen erst nach Rückfrage', async ({ page }) => {
    await addMed(page, { name: 'Prednisolon', amt: '1', freq: '1', times: ['09:00'] });
    await row(page, 'Prednisolon').getByRole('button', { name: 'Beenden' }).click();
    await expect(row(page, 'Prednisolon')).toContainText('beendet');
    await goView(page, 'erinnerung');
    await expect(page.locator('#gp-card')).not.toContainText('Prednisolon');
    await goView(page, 'akte');
    await row(page, 'Prednisolon').getByRole('button', { name: /Löschen/ }).click();
    await expect(row(page, 'Prednisolon')).toContainText('wirklich löschen');
    await expect(page.locator('[data-act="omDelYes"]')).toBeFocused();
    await page.locator('[data-act="omDelYes"]').click();
    await expect(card(page)).not.toContainText('Prednisolon');
  });

  test('Praxis-Medikament: Erinnerungszeit festlegen → steht im Tagesplan', async ({ page }) => {
    const r = row(page, 'Zeckenschutz');
    await r.getByRole('button', { name: 'Erinnerung festlegen' }).click();
    await page.locator('#f-omR1').fill('18:00');
    await page.locator('[data-act="omTmSave"]').click();
    await expect(toast(page)).toContainText('steht jetzt im Tagesplan');
    await expect(r).toContainText('Erinnerung im Tagesplan: 18:00 Uhr');
    await goView(page, 'erinnerung');
    await expect(page.locator('#gp-card .gp-row').filter({ hasText: 'Zeckenschutz' })).toContainText('18:00 Uhr');
  });

  test('Praxisansicht sieht den Eintrag der Halter:in, kann ihn aber nicht löschen', async ({ page }) => {
    await addMed(page, { name: 'Omega-3-Öl', amt: '2', unit: 'ml', freq: '1' });
    await switchRole(page, 'vet');
    await goView(page, 'vpatienten');
    await page.locator('[data-act="openPat"][data-pid="luna"]').click();
    const v = main(page).locator('.card').filter({ has: page.getByRole('heading', { name: 'Medikation', exact: true }) }).locator('.row').filter({ hasText: 'Omega-3-Öl' });
    await expect(v).toContainText('Von Halter:in eingetragen');
    await expect(v).toContainText('2 ml · 1× täglich');
    await expect(v.locator('[data-act="medDel"]')).toHaveCount(0);
  });

  test('Englisch: Dosierung wird in der Sprache zusammengesetzt', async ({ page }) => {
    await addMed(page, { name: 'Meloxicam', amt: '1', freq: '1', times: ['08:00'] });
    await page.locator('select[data-lang-select]').first().selectOption('en');
    await expect(row(page, 'Meloxicam')).toContainText('1 tablet · 1× daily (08:00)');
  });
});
