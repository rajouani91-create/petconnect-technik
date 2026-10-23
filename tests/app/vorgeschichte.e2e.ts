import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { FakeSupabase } from './fake-supabase';

/** Vorgeschichte und Zeitleiste (Auftrag 13, Stufe 1): ausfüllen, Rechte, Zeitleiste, Filter. */

const NOW = new Date('2026-10-16T08:30:00+02:00');
const PW = 'Testpasswort-123';
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Jetzt anmelden' }).click({ timeout: 2000 }).catch(() => {});
  await page.getByLabel('E-Mail').fill(email);
  await page.getByRole('textbox', { name: 'Passwort', exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('#main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  return page;
}

function setup() {
  const fake = new FakeSupabase('2026-10-16');
  fake.now = NOW;
  const ahmed = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog' });
  fake.addMember(luna.id, oma, 'viewer');
  return { fake, ahmed, oma, luna };
}

const main = (p: Page) => p.locator('#main');

test('Halterin füllt die Vorgeschichte aus, speichert und sieht „Ausgefüllt am“', async ({ browser }) => {
  const { fake, luna } = setup();
  const page = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${luna.id}/vorgeschichte`);
  await expect(main(page).getByText('Erster Besuch?')).toBeVisible();
  await expect(main(page).getByText('Noch keine Vorgeschichte angegeben.')).toBeVisible();
  await main(page).getByLabel('Herkunft').selectOption({ label: 'Tierheim / Tierschutz' });
  await main(page).getByLabel('Frühere Erkrankungen').fill('Ohrenentzündung 2025');
  await main(page).getByRole('button', { name: 'Vorgeschichte speichern' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Vorgeschichte gespeichert.' })).toHaveCount(1);
  await expect(main(page).getByText('Ausgefüllt am 16. Oktober 2026')).toBeVisible();
  expect(fake.db.pet_history).toMatchObject([{ pet_id: luna.id, origin: 'shelter', past_illness: 'Ohrenentzündung 2025' }]);
});

test('Nur ansehen sieht die Angaben, aber keine Eingabefelder und keinen Speichern-Knopf', async ({ browser }) => {
  const { fake, ahmed, luna } = setup();
  fake.db.pet_history!.push({ pet_id: luna.id, origin: 'breeder', past_illness: null, updated_by: ahmed.id, updated_at: NOW.toISOString() });
  const page = await openAs(browser, fake, 'oma@test.invalid', `/tier/${luna.id}/vorgeschichte`);
  await expect(main(page).getByText('Züchter')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Vorgeschichte speichern' })).toHaveCount(0);
  await expect(main(page).getByLabel('Herkunft')).toHaveCount(0);
});

test('Zeitleiste zeigt Medikation, Gewicht und Impfung neueste zuerst, Filter wirkt', async ({ browser }) => {
  const { fake, ahmed, luna } = setup();
  fake.db.vaccinations!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, source: 'owner', name: 'Tollwut', given_on: '2026-03-10', valid_until: null, created_at: NOW.toISOString() });
  fake.db.weights!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, kg: 4.25, measured_on: '2026-09-15', created_at: NOW.toISOString() });
  const med = fake.seedMedication(luna, ahmed, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00'], starts_on: '2026-10-01' });
  fake.seedDose(med, ahmed, '2026-10-02', '08:00', '2026-10-02T08:05:00+02:00');
  const page = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${luna.id}/vorgeschichte`);
  const items = main(page).locator('ol li');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Meloxicam');
  await expect(items.nth(1)).toContainText('4,25 kg');
  await expect(items.nth(2)).toContainText('Tollwut');
  await main(page).getByLabel('Art').selectOption({ label: 'Gewicht' });
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText('4,25 kg');
});

test('Betreuung sieht weder Vorgeschichte noch Zeitleiste, nur Betreuungsdaten', async ({ browser }) => {
  const { fake, ahmed, luna } = setup();
  fake.db.pet_history!.push({ pet_id: luna.id, origin: 'breeder', past_illness: 'Geheime Vorerkrankung', updated_by: ahmed.id, updated_at: NOW.toISOString() });
  fake.db.sitter_access!.push({
    id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, sitter_name: 'Lea', valid_from: '2026-10-14', valid_to: '2026-10-20',
    feeding: '2× täglich 200 g Trockenfutter', care_notes: 'Apoquel morgens mit Futter',
    token: (randomUUID() + randomUUID()).replace(/-/g, ''), revoked_at: null, created_at: NOW.toISOString(),
  });
  const token = String(fake.db.sitter_access![fake.db.sitter_access!.length - 1]!.token);
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(`/betreuung/${token}`);
  await expect(page.getByRole('heading', { name: 'Betreuung von Luna', level: 1 })).toBeVisible();
  await expect(main(page).getByText('Apoquel morgens mit Futter')).toBeVisible();
  await expect(main(page).getByText('Vorgeschichte')).toHaveCount(0);
  await expect(main(page).getByText('Zeitleiste')).toHaveCount(0);
  await expect(main(page).getByText('Geheime Vorerkrankung')).toHaveCount(0);
});
