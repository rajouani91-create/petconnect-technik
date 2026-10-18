import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeSupabase } from './fake-supabase';

/**
 * Einmalig: PNG-Icons und Store-Screenshots für App/public erzeugen (Auftrag 10).
 * Aufruf: npx playwright test -c tests/app/assets.config.ts
 * Screenshots zeigen ein Beispieltier mit erfundenen Daten – keine echten Daten.
 */

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../App');
const PUB = path.join(APP, 'public');
const NOW = new Date('2026-10-16T08:40:00+02:00');
const PW = 'Beispiel-Passwort-1';

// Einfarbige Pfote (weiß auf transparent) für das kleine Statusleisten-Symbol (badge)
const BADGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#ffffff"><ellipse cx="16" cy="20" rx="6" ry="5.1"/><circle cx="8.6" cy="13.4" r="2.7"/><circle cx="13.1" cy="8.3" r="2.7"/><circle cx="18.9" cy="8.3" r="2.7"/><circle cx="23.4" cy="13.4" r="2.7"/></g></svg>';

async function renderSvg(page: Page, svg: string, size: number, file: string) {
  await page.setViewportSize({ width: size, height: size });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

test('Icons als PNG (192/512, any + maskable, apple-touch-icon 180, badge 96)', async ({ browser }) => {
  // ohne Handy-Emulation aus der Konfiguration (sonst wird die Seite verkleinert dargestellt)
  const ctx = await browser.newContext({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const page = await ctx.newPage();
  const icon = readFileSync(path.join(PUB, 'icon.svg'), 'utf8');
  const maskable = readFileSync(path.join(PUB, 'icon-maskable.svg'), 'utf8');
  const dir = path.join(PUB, 'icons');
  mkdirSync(dir, { recursive: true });
  for (const size of [192, 512]) {
    await renderSvg(page, icon, size, path.join(dir, `icon-${size}.png`));
    await renderSvg(page, maskable, size, path.join(dir, `icon-maskable-${size}.png`));
  }
  // iOS mag keine Transparenz: vollflächige Variante
  await renderSvg(page, maskable, 180, path.join(dir, 'apple-touch-icon.png'));
  await renderSvg(page, BADGE_SVG, 96, path.join(dir, 'badge-96.png'));
  await ctx.close();
});

test('Screenshots im Handy-Format (1080×2400) mit Beispieltier', async ({ browser }) => {
  test.setTimeout(90_000);
  const fake = new FakeSupabase('2026-10-16');
  fake.now = NOW;
  const user = fake.seedUser('beispiel@petconnect.invalid', PW, 'Alex');
  const luna = fake.seedPet(user, { name: 'Luna', species: 'dog', breed: 'Labrador-Mix', birth_date: '2021-04-12', allergies: 'Huhn', vet_name: 'Tierarztpraxis Beispiel', vet_phone: '0000 123456', owner_phone: '0000 654321', emergency_contact: 'Sam (Nachbarin), 0000 111222' });
  const routine = (kind: string, time: string, label: string | null = null) =>
    fake.db.routine_items!.push({ id: randomUUID(), pet_id: luna.id, owner_id: user.id, kind, time_of_day: time, repeat: 'daily', label, reminder_on: true, created_at: NOW.toISOString() });
  routine('walk', '07:00:00');
  routine('feed', '07:30:00');
  routine('walk', '12:30:00');
  routine('feed', '18:00:00');
  routine('walk', '20:30:00');
  const melox = fake.seedMedication(luna, user, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00', '19:30'], intake_hint: 'with_food', starts_on: '2026-10-10', ends_on: '2026-10-30', prescribed_by: 'Tierarztpraxis Beispiel', reason: 'Gelenkschmerzen' });
  fake.seedMedication(luna, user, { name: 'Omega-3-Öl', amount: 2, unit: 'pipette', times: ['18:00'], starts_on: '2026-09-01' });
  fake.seedDose(melox, user, '2026-10-16', '08:00', '2026-10-16T06:05:00Z');
  fake.db.reminders!.push({ id: randomUUID(), pet_id: luna.id, owner_id: user.id, title: 'Wurmkur', kind: 'deworming', due_on: '2026-10-16', repeat_days: 90, note: null, last_done_on: null, done_at: null, created_at: NOW.toISOString() });
  fake.db.appointments!.push({ id: randomUUID(), pet_id: luna.id, owner_id: user.id, title: 'Impfung Tollwut', kind: 'vaccination', starts_at: '2026-10-21T09:30:00+02:00', ends_at: null, location: 'Tierarztpraxis Beispiel', note: null, status: 'planned', created_at: NOW.toISOString() });
  fake.db.vaccinations!.push({ id: randomUUID(), pet_id: luna.id, owner_id: user.id, source: 'owner', name: 'Tollwut', given_on: '2025-10-20', valid_until: '2026-10-20', created_at: NOW.toISOString() });

  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill('beispiel@petconnect.invalid');
  await page.getByLabel('Passwort').fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('#main')).toBeVisible();
  const dir = path.join(PUB, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const shot = async (url: string, file: string, scrollTo?: string) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    if (scrollTo) await page.locator('#main').getByRole('heading', { name: scrollTo, exact: true }).first().evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -80); // unter der Kopfzeile sichtbar
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, file) });
  };
  await shot('/', 'heute.png');
  await shot('/erinnerungen', 'erinnerungen.png');
  await shot('/tier', 'tierakte.png', 'Medikation');
  await shot(`/tier/${String(luna.id)}/notfallkarte`, 'notfallkarte.png');
  await ctx.close();
});
