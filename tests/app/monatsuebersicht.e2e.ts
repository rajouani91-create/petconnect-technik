import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { FakeSupabase } from './fake-supabase';

/** Monatsübersicht (Auftrag 12): Zählungen pro Tier, Monatswechsel, Rechte, Druckansicht. */

const NOW = new Date('2026-10-16T08:30:00+02:00'); // Freitag, 16. Oktober, 08:30
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
  // Meloxicam ab 1. Oktober, zweimal täglich, mit Erinnerung
  const med = fake.seedMedication(luna, ahmed, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00', '19:30'], starts_on: '2026-10-01' });
  // Zwei Gaben erledigt: 1. und 2. Oktober, jeweils 08:00
  fake.seedDose(med, ahmed, '2026-10-01', '08:00', '2026-10-01T08:05:00+02:00');
  fake.seedDose(med, ahmed, '2026-10-02', '08:00', '2026-10-02T08:10:00+02:00');
  // Gewicht: Anfang und Mitte des Monats
  fake.db.weights!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, kg: 4.1, measured_on: '2026-10-05', created_at: NOW.toISOString() });
  fake.db.weights!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, kg: 4.3, measured_on: '2026-10-14', created_at: NOW.toISOString() });
  return { fake, ahmed, oma, luna };
}

const main = (p: Page) => p.locator('#main');

test('zeigt die Zählungen des laufenden Monats', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/monatsuebersicht');
  await expect(main(page).getByRole('heading', { name: 'Monatsübersicht', level: 1 })).toBeVisible();
  // 31 Tage × 2 Gaben = 62 geplant. Verpasst: 1.–15. Oktober (30 Gaben) minus 2 erledigte = 28.
  await expect(main(page).getByText('62 geplant · 2 erledigt · 28 verpasst', { exact: true })).toBeVisible();
  await expect(main(page).getByText('Veränderung: +0,2 kg')).toBeVisible();
});

test('Monat wechseln ändert die Zahlen', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/monatsuebersicht');
  await expect(main(page).getByText('62 geplant · 2 erledigt · 28 verpasst', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  // Im September war die Gabe noch nicht geplant
  await expect(main(page).getByText('Keine Medikamente mit Erinnerung in diesem Monat.')).toBeVisible();
  await expect(main(page).getByText('Keine Messung in diesem Monat.')).toBeVisible();
});

test('Nur ansehen sieht dieselben Zahlen', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'oma@test.invalid', '/mehr/monatsuebersicht');
  await expect(main(page).getByText('62 geplant · 2 erledigt · 28 verpasst', { exact: true })).toBeVisible();
});

test('Als PDF speichern ruft den Druckdialog auf und die Druckansicht zeigt nur den Inhalt', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/monatsuebersicht');
  await expect(main(page).getByText('62 geplant · 2 erledigt · 28 verpasst', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await page.getByRole('button', { name: 'Als PDF speichern' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  // Im Druckbereich stehen Tiername und Monat, aber keine Knöpfe
  const printArea = page.locator('.mo-print');
  await expect(printArea).toContainText('Luna');
  await expect(printArea.getByRole('button')).toHaveCount(0);
});
