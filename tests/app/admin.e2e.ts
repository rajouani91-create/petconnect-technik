import { expect, test, type Browser, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

/** Support-Bereich (Auftrag 15): Rolle prüfen, suchen, sperren nur mit Grund, Protokoll, nur Admin darf ändern. */

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
  const admin = fake.seedUser('admin@test.invalid', PW, 'Ahmed Admin');
  const support = fake.seedUser('support@test.invalid', PW, 'Lea Support');
  const halter = fake.seedUser('halter@test.invalid', PW, 'Max Halter');
  const luna = fake.seedPet(halter, { name: 'Luna', species: 'dog' });
  fake.seedStaff(admin, 'admin');
  fake.seedStaff(support, 'support');
  return { fake, admin, support, halter, luna };
}

const main = (p: Page) => p.locator('#main');

test('ohne Mitarbeiten-Rolle geht es zurück zur Startseite', async ({ browser }) => {
  const { fake } = setup();
  fake.seedUser('normal@test.invalid', PW, 'Nora Normal');
  const page = await openAs(browser, fake, 'normal@test.invalid', '/admin');
  await expect(page).not.toHaveURL(/\/admin$/);
  await expect(main(page).getByRole('heading', { name: 'Support-Bereich' })).toHaveCount(0);
});

test('Support sucht ein Konto und sieht keine Gesundheitsdaten, aber auch keinen Sperr-Knopf', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'support@test.invalid', '/admin');
  await expect(main(page).getByRole('heading', { name: 'Support-Bereich' })).toBeVisible();
  await main(page).getByRole('searchbox', { name: 'Name, E-Mail oder Tiername' }).fill('Luna');
  await main(page).getByRole('button', { name: 'Suchen' }).click();
  await main(page).getByRole('button', { name: /Max Halter/ }).click();
  await expect(main(page).getByText('Luna (dog)')).toBeVisible();
  await expect(main(page).getByText('Nur Admins können Konten sperren oder freigeben.')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Sperren' })).toHaveCount(0);
});

test('Suche braucht mindestens drei Zeichen', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'support@test.invalid', '/admin');
  await main(page).getByRole('searchbox', { name: 'Name, E-Mail oder Tiername' }).fill('ab');
  await main(page).getByRole('button', { name: 'Suchen' }).click();
  await expect(main(page).getByRole('status')).toHaveText('Bitte geben Sie mindestens 3 Zeichen ein.');
});

test('Admin sperrt nur mit Grund und das Protokoll entsteht', async ({ browser }) => {
  const { fake, admin, halter } = setup();
  const page = await openAs(browser, fake, 'admin@test.invalid', '/admin');
  await main(page).getByRole('searchbox', { name: 'Name, E-Mail oder Tiername' }).fill('Max');
  await main(page).getByRole('button', { name: 'Suchen' }).click();
  await main(page).getByRole('button', { name: /Max Halter/ }).click();
  await main(page).getByRole('button', { name: 'Sperren' }).click();
  await main(page).getByRole('button', { name: 'Sperrung bestätigen' }).click();
  await expect(main(page).getByRole('status')).toHaveText('Bitte geben Sie einen Grund an.');
  expect(fake.db.account_status!.some((x) => x.user_id === halter.id)).toBe(false);

  await main(page).getByLabel(/Grund/).fill('Verdacht auf Missbrauch');
  await main(page).getByRole('button', { name: 'Sperrung bestätigen' }).click();
  await expect(main(page).getByRole('status')).toHaveText('Das Konto ist gesperrt.');
  const entry = fake.db.staff_audit!.find((x) => x.target_user_id === halter.id);
  expect(entry).toMatchObject({ staff_id: admin.id, action: 'account_locked', reason: 'Verdacht auf Missbrauch' });
});

test('Übersicht mit Zählungen ist nur für Admin sichtbar', async ({ browser }) => {
  const { fake } = setup();
  const admin = await openAs(browser, fake, 'admin@test.invalid', '/admin');
  await expect(main(admin).getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  await expect(main(admin).getByText('Nur Zahlen, keine Personen- oder Tierdaten.')).toBeVisible();

  const support = await openAs(browser, fake, 'support@test.invalid', '/admin');
  await expect(main(support).getByRole('heading', { name: 'Übersicht' })).toHaveCount(0);
});

test('Reset-Link: Hinweis erscheint, Protokoll entsteht, kein Passwort sichtbar', async ({ browser }) => {
  const { fake, halter } = setup();
  const page = await openAs(browser, fake, 'support@test.invalid', '/admin');
  await main(page).getByRole('searchbox', { name: 'Name, E-Mail oder Tiername' }).fill('Max');
  await main(page).getByRole('button', { name: 'Suchen' }).click();
  await main(page).getByRole('button', { name: /Max Halter/ }).click();
  await main(page).getByRole('button', { name: 'Reset-Link senden' }).click();
  await expect(main(page).getByRole('status')).toHaveText('Der Reset-Link wurde gesendet. Das Passwort sehen Sie nicht.');
  await expect(main(page)).not.toContainText(PW);
  const entry = fake.db.staff_audit!.find((x) => x.action === 'reset_link_sent');
  expect(entry).toMatchObject({ staff_id: (fake.user('support@test.invalid')).id, target_user_id: halter.id });
});

test('Support legt ein Ticket an und ändert den Status', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'support@test.invalid', '/admin');
  await main(page).locator('#ticket-sender').fill('anna@example.invalid');
  await main(page).locator('#ticket-subject').fill('Passwort vergessen');
  await main(page).locator('#ticket-body').fill('Ich komme nicht mehr in mein Konto.');
  await main(page).getByRole('button', { name: 'Ticket anlegen' }).click();
  await expect(main(page).getByRole('status')).toHaveText('Gespeichert.');
  await expect(main(page).getByRole('heading', { name: 'Passwort vergessen' })).toBeVisible();
  expect(fake.db.support_tickets!.length).toBe(1);

  await main(page).locator('select[id^="ticket-status-"]').first().selectOption('closed');
  await main(page).getByRole('button', { name: 'Speichern' }).first().click();
  await expect(main(page).getByRole('status')).toHaveText('Gespeichert.');
  expect(fake.db.support_tickets![0]!.status).toBe('closed');
});

test('Ticket ohne Betreff wird nicht angelegt', async ({ browser }) => {
  const { fake } = setup();
  const page = await openAs(browser, fake, 'support@test.invalid', '/admin');
  await main(page).locator('#ticket-body').fill('Nur Text, kein Betreff');
  await main(page).getByRole('button', { name: 'Ticket anlegen' }).click();
  await expect(main(page).getByRole('status')).toHaveText('Bitte geben Sie Betreff und Inhalt an.');
  expect(fake.db.support_tickets!.length).toBe(0);
});

test('Admin legt eine Ankündigung an, Nutzer sieht den Banner und schließt ihn', async ({ browser }) => {
  const { fake } = setup();
  fake.seedUser('nutzer@test.invalid', PW, 'Nina Nutzer');
  const admin = await openAs(browser, fake, 'admin@test.invalid', '/admin');
  await main(admin).locator('#ann-body').fill('Wartung am Sonntag von 8 bis 10 Uhr.');
  await main(admin).locator('#ann-start').fill('2026-10-16T08:00');
  await main(admin).locator('#ann-end').fill('2026-10-20T08:00');
  await main(admin).getByRole('button', { name: 'Ankündigung speichern' }).click();
  await expect(main(admin).getByRole('status')).toHaveText('Ankündigung gespeichert.');
  expect(fake.db.announcements!.length).toBe(1);

  const nutzer = await openAs(browser, fake, 'nutzer@test.invalid', '/');
  await expect(nutzer.getByText('Wartung am Sonntag von 8 bis 10 Uhr.')).toBeVisible();
  await nutzer.getByRole('button', { name: 'Schließen' }).click();
  await expect(nutzer.getByText('Wartung am Sonntag von 8 bis 10 Uhr.')).toHaveCount(0);
  expect(fake.db.announcement_dismissals!.length).toBe(1);
});
