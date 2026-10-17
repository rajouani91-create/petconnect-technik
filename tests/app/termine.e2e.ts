import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FakeSupabase } from './fake-supabase';

/** Termine und Erinnerungen – mit simuliertem Supabase (Rechte und complete_reminder wie in der Datenbank). */

const NOW = new Date('2026-10-16T10:00:00+02:00'); // Freitag
const PW = 'Testpasswort-123';

const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string, width = 412): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width, height: 915 }, isMobile: true, hasTouch: true });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.clock.setFixedTime(NOW);
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('#main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  return page;
}

function setup() {
  const fake = new FakeSupabase();
  const ahmed = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  const kyra = fake.seedUser('kyra@test.invalid', PW, 'Kyra');
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog' });
  const mio = fake.seedPet(ahmed, { name: 'Mio', species: 'cat' });
  return { fake, ahmed, kyra, oma, luna, mio };
}
type Pet = { id?: unknown };
const seedAppt = (fake: FakeSupabase, pet: Pet, by: { id: string }, title: string, starts_at: string, extra: Record<string, unknown> = {}) => {
  const row = { id: randomUUID(), pet_id: pet.id, owner_id: by.id, title, kind: 'vet', starts_at, ends_at: null, location: null, note: null, status: 'planned', created_at: NOW.toISOString(), ...extra };
  fake.db.appointments!.push(row);
  return row;
};
const seedRem = (fake: FakeSupabase, pet: Pet, by: { id: string }, title: string, due_on: string, repeat_days: number | null, extra: Record<string, unknown> = {}) => {
  const row = { id: randomUUID(), pet_id: pet.id, owner_id: by.id, title, kind: 'other', due_on, repeat_days, note: null, last_done_on: null, done_at: null, created_at: NOW.toISOString(), ...extra };
  fake.db.reminders!.push(row);
  return row;
};

const main = (p: Page) => p.locator('#main');
const section = (p: Page, heading: string | RegExp) => main(p).locator('section, details').filter({ has: p.getByRole('heading', { name: heading }).or(p.locator('summary', { hasText: heading })) });
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });
const nav = (p: Page, name: string) => p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name });

test.afterEach(async () => {
  for (const [page, list] of errors) {
    const real = list.filter((e) => !/Failed to load resource/.test(e));
    expect(real, `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  }
  errors.clear();
});

test.describe('Termine', () => {
  test('Anlegen → „Nächste Termine“ und Übersicht; ändern; erledigt; wieder planen; absagen; löschen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/');
    await nav(p, 'Termine').click();
    await expect(main(p)).toContainText('Keine Termine geplant.');
    await p.getByRole('button', { name: 'Termin eintragen' }).click();
    const form = p.getByRole('form', { name: 'Termin eintragen' });
    await expect(form.getByRole('combobox', { name: 'Tier', exact: true })).toBeFocused();
    await form.getByRole('combobox', { name: 'Tier', exact: true }).selectOption({ label: 'Luna' });
    await form.getByLabel('Titel').fill('Kontrolle Ohr');
    await form.getByLabel('Art').selectOption({ label: 'Tierarzt' });
    await form.getByLabel('Datum').fill('2026-11-03');
    await form.getByLabel('Uhrzeit von').fill('10:00');
    await form.getByLabel(/^bis/).fill('10:30');
    await form.getByLabel('Ort').fill('Praxis am Park, Raum 2');
    await form.getByLabel('Notiz').fill('Bitte nüchtern kommen.');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Termin gespeichert: Kontrolle Ohr.')).toHaveCount(1);
    expect(fake.db.appointments).toHaveLength(1);
    expect(fake.db.appointments![0]).toMatchObject({ pet_id: luna.id, owner_id: ahmed.id, title: 'Kontrolle Ohr', kind: 'vet', starts_at: '2026-11-03T09:00:00.000Z', ends_at: '2026-11-03T09:30:00.000Z', location: 'Praxis am Park, Raum 2', note: 'Bitte nüchtern kommen.', status: 'planned' });
    const next = section(p, 'Nächste Termine');
    const row = next.locator('.record-row').filter({ hasText: 'Kontrolle Ohr' });
    await expect(row).toContainText('Di., 03.11.2026, 10:00 – 10:30');
    await expect(row).toContainText('Tierarzt · Luna · Praxis am Park, Raum 2');
    await expect(row).toContainText('Bitte nüchtern kommen.');
    await expect(p.getByRole('button', { name: 'Termin eintragen' })).toBeFocused();

    // Übersicht
    await nav(p, 'Heute').click();
    await expect(p.locator('.upcoming-card')).toContainText('Kontrolle Ohr');
    await expect(p.locator('.upcoming-card')).toContainText('Di., 03.11.2026, 10:00');
    await p.locator('.upcoming-card').getByRole('link', { name: 'Alle Termine' }).click();

    // ändern
    await p.getByRole('button', { name: 'Kontrolle Ohr ändern' }).click();
    const edit = p.getByRole('form', { name: 'Termin ändern' });
    await expect(edit.getByRole('combobox', { name: 'Tier', exact: true })).toBeDisabled();
    await expect(edit.getByLabel('Uhrzeit von')).toHaveValue('10:00');
    await edit.getByLabel('Titel').fill('Kontrolle Ohr links');
    await edit.getByLabel('Uhrzeit von').fill('11:15');
    await edit.getByLabel(/^bis/).fill('');
    await edit.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Termin geändert: Kontrolle Ohr links.')).toHaveCount(1);
    expect(fake.db.appointments![0]).toMatchObject({ title: 'Kontrolle Ohr links', starts_at: '2026-11-03T10:15:00.000Z', ends_at: null });
    await expect(p.getByRole('button', { name: 'Kontrolle Ohr links ändern' })).toBeFocused();

    // erledigt → unter „Vergangene und abgesagte“
    await p.getByRole('button', { name: 'Kontrolle Ohr links als erledigt markieren' }).click();
    await expect(status(p, 'Erledigt: Kontrolle Ohr links.')).toHaveCount(1);
    expect(fake.db.appointments![0]!.status).toBe('done');
    await expect(main(p)).toContainText('Keine Termine geplant.');
    const past = main(p).locator('details');
    await past.locator('summary').click();
    await expect(past.locator('summary')).toHaveText('Vergangene und abgesagte (1)');
    await expect(past.locator('.record-row')).toContainText('erledigt');
    // wieder planen, dann absagen
    await past.getByRole('button', { name: 'Kontrolle Ohr links wieder planen' }).click();
    await expect.poll(() => fake.db.appointments![0]!.status).toBe('planned');
    await p.getByRole('button', { name: 'Kontrolle Ohr links absagen' }).click();
    await expect.poll(() => fake.db.appointments![0]!.status).toBe('cancelled');
    await main(p).locator('details summary').click();
    await expect(main(p).locator('details .record-row')).toContainText('abgesagt');

    // löschen mit Dialog
    await p.getByRole('button', { name: 'Kontrolle Ohr links löschen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Termin löschen?' });
    await expect(dlg).toContainText('„Kontrolle Ohr links“ am Di., 03.11.2026, 11:15 wirklich löschen?');
    await dlg.getByRole('button', { name: 'Abbrechen' }).click();
    expect(fake.db.appointments).toHaveLength(1);
    await p.getByRole('button', { name: 'Kontrolle Ohr links löschen' }).click();
    await dlg.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect.poll(() => fake.db.appointments!.length).toBe(0);
    await expect(status(p, 'Termin gelöscht: Kontrolle Ohr links.')).toHaveCount(1);
  });

  test('Ungültig: leerer Titel, Ende vor Beginn, ohne Uhrzeit → Meldung am Feld, nichts gespeichert', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/termine');
    await p.getByRole('button', { name: 'Termin eintragen' }).click();
    const form = p.getByRole('form', { name: 'Termin eintragen' });
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Bitte ein Tier wählen.');
    await expect(form.getByRole('combobox', { name: 'Tier', exact: true })).toBeFocused();
    await form.getByRole('combobox', { name: 'Tier', exact: true }).selectOption({ label: 'Mio' });
    await form.getByRole('button', { name: 'Speichern' }).click();
    const title = form.getByLabel('Titel');
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(p.locator(`[id="${((await title.getAttribute('aria-describedby')) ?? '').split(' ')[0]}"]`)).toHaveText('Bitte einen Titel angeben.');
    await expect(title).toBeFocused();
    await title.fill('Krallen schneiden');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Bitte eine Uhrzeit angeben.');
    await form.getByLabel('Uhrzeit von').fill('15:00');
    await form.getByLabel(/^bis/).fill('14:30');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Das Ende muss nach dem Beginn liegen.');
    await expect(form.getByLabel(/^bis/)).toBeFocused();
    expect(fake.db.appointments).toHaveLength(0);
    expect(fake.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/appointments'))).toHaveLength(0);
  });

  test('„In meinen Kalender eintragen“ lädt eine .ics mit Titel, Tiername, Startzeit und Alarmen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const a = seedAppt(fake, luna, ahmed, 'Impfung, Auffrischung', '2026-11-03T09:00:00.000Z', { kind: 'vaccination', location: 'Praxis am Park' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/termine');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Impfung, Auffrischung in meinen Kalender eintragen' }).click()]);
    expect(dl.suggestedFilename()).toBe('impfung-auffrischung-luna.ics');
    const ics = readFileSync((await dl.path())!, 'utf8');
    const flat = ics.replace(/\r\n /g, '');
    expect(ics).toContain('\r\n');
    expect(flat).toContain('SUMMARY:Impfung\\, Auffrischung (Luna)');
    expect(flat).toContain('DTSTART:20261103T090000Z');
    expect(flat).toContain(`UID:${a.id}@petconnect24.com`);
    expect(flat).toContain('LOCATION:Praxis am Park');
    expect(flat.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(flat).toContain('TRIGGER:-P1D');
    expect(flat).toContain('TRIGGER:-PT1H');
    expect(flat).not.toContain('ahmed@');
    await expect(status(p, /Kalender-Datei heruntergeladen/)).toHaveCount(1);
  });
});

test.describe('Erinnerungen', () => {
  test('Gruppen Überfällig/Heute/Nächste 30 Tage/Später mit Status in Worten; Impf-Erinnerung aus der Tierakte ohne Abhaken', async ({ browser }) => {
    const { fake, ahmed, luna, mio } = setup();
    seedRem(fake, luna, ahmed, 'Wurmkur', '2026-10-13', 90, { kind: 'deworming' });
    seedRem(fake, luna, ahmed, 'Zeckenschutz', '2026-10-15', 30, { kind: 'flea_tick' });
    seedRem(fake, mio, ahmed, 'Krallen schneiden', '2026-10-16', null, { kind: 'grooming' });
    seedRem(fake, luna, ahmed, 'Medikament abholen', '2026-10-21', null, { kind: 'medication' });
    seedRem(fake, luna, ahmed, 'Grenze 30', '2026-11-15', null);
    seedRem(fake, luna, ahmed, 'Grenze 31', '2026-11-16', null);
    fake.db.vaccinations!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, name: 'Tollwut', given_on: '2025-11-01', valid_until: '2026-11-01', source: 'owner', created_at: NOW.toISOString() });
    fake.db.vaccinations!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, name: 'Staupe', given_on: '2026-01-01', valid_until: '2029-01-01', source: 'owner', created_at: NOW.toISOString() });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/');
    await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await p.locator('#main').getByRole('link', { name: 'Erinnerungen', exact: true }).click(); // seit Auftrag 08 unter „Mehr“
    const over = section(p, /^Überfällig/);
    await expect(over.locator('.record-row')).toHaveCount(2);
    await expect(over.locator('.record-row').nth(0)).toContainText('Wurmkur');
    await expect(over.locator('.record-row').nth(0)).toContainText('überfällig seit 3 Tagen');
    await expect(over.locator('.record-row').nth(0)).toContainText('Entwurmung · Luna');
    await expect(over.locator('.record-row').nth(0)).toContainText('fällig am 13.10.2026 · alle 90 Tage');
    await expect(over.locator('.record-row').nth(1)).toContainText('überfällig seit 1 Tag');
    const today = section(p, /^Heute/);
    await expect(today.locator('.record-row')).toHaveCount(1);
    await expect(today).toContainText('Krallen schneiden');
    await expect(today).toContainText('heute');
    await expect(today).toContainText('einmalig');
    const soon = section(p, /^Nächste 30 Tage/);
    await expect(soon.locator('.record-row')).toHaveCount(3);
    await expect(soon).toContainText('in 5 Tagen');
    await expect(soon).toContainText('Grenze 30');
    const vacc = soon.locator('.record-row').filter({ hasText: 'Impfung Tollwut läuft ab am 01.11.2026' });
    await expect(vacc).toContainText('aus der Tierakte');
    await expect(vacc.getByRole('button')).toHaveCount(0);
    await expect(vacc.getByRole('link', { name: 'Zur Tierakte' })).toHaveAttribute('href', '/tier');
    const later = section(p, /^Später/);
    await expect(later.locator('.record-row')).toHaveCount(1);
    await expect(later).toContainText('Grenze 31');
    await expect(main(p)).not.toContainText('Staupe');
  });

  test('Wiederkehrend abhaken → neue Fälligkeit und Meldung; einmalig → unter „Erledigt“; „Erledigt am …“ mit Datum', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const worm = seedRem(fake, luna, ahmed, 'Wurmkur', '2026-10-13', 90, { kind: 'deworming' });
    const claws = seedRem(fake, luna, ahmed, 'Krallen schneiden', '2026-10-16', null);
    const flea = seedRem(fake, luna, ahmed, 'Zeckenschutz', '2026-10-10', 30);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen');
    await p.getByRole('button', { name: 'Wurmkur für Luna als erledigt markieren' }).click();
    await expect(status(p, 'Erledigt. Nächste Erinnerung am 14.01.2027.')).toHaveCount(1);
    expect(fake.db.reminders!.find((r) => r.id === worm.id)).toMatchObject({ due_on: '2027-01-14', last_done_on: '2026-10-16', done_at: null });
    expect(fake.calls.some((c) => c.path === '/rest/v1/rpc/complete_reminder')).toBe(true);
    await expect(section(p, /^Später/)).toContainText('Wurmkur');
    await expect(section(p, /^Später/)).toContainText('zuletzt erledigt am 16.10.2026');
    // einmalig
    await p.getByRole('button', { name: 'Krallen schneiden für Luna als erledigt markieren' }).click();
    await expect(status(p, /^Erledigt\.$/)).toHaveCount(1);
    expect(fake.db.reminders!.find((r) => r.id === claws.id)!.done_at).not.toBeNull();
    const done = main(p).locator('details');
    await expect(done.locator('summary')).toHaveText('Erledigt (1)');
    await done.locator('summary').click();
    await expect(done.locator('.record-row')).toContainText('Krallen schneiden');
    await expect(done.locator('.record-row')).toContainText('erledigt am 16.10.2026');
    await expect(done.getByRole('button', { name: /als erledigt markieren/ })).toHaveCount(0);
    // anderes Datum, Zukunft wird abgelehnt
    await p.getByRole('button', { name: 'Zeckenschutz: an einem anderen Tag erledigt' }).click();
    const dlg = p.getByRole('dialog', { name: 'Zeckenschutz: erledigt am' });
    await expect(dlg.getByLabel('Erledigt am')).toBeFocused().catch(() => undefined);
    await dlg.getByLabel('Erledigt am').fill('2026-10-20');
    await dlg.getByRole('button', { name: 'Erledigt' }).click();
    await expect(dlg).toContainText('Das Datum liegt in der Zukunft.');
    expect(fake.db.reminders!.find((r) => r.id === flea.id)!.last_done_on).toBeNull();
    await dlg.getByLabel('Erledigt am').fill('2026-10-12');
    await dlg.getByRole('button', { name: 'Erledigt' }).click();
    await expect(status(p, 'Erledigt. Nächste Erinnerung am 11.11.2026.')).toHaveCount(1);
    expect(fake.db.reminders!.find((r) => r.id === flea.id)).toMatchObject({ due_on: '2026-11-11', last_done_on: '2026-10-12' });
  });

  test('Anlegen mit eigener Wiederholung, Hinweis zu Abständen; ändern; löschen; leerer Zustand', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen');
    await expect(main(p)).toContainText('Alles erledigt.');
    await p.getByRole('button', { name: 'Erinnerung anlegen' }).click();
    const form = p.getByRole('form', { name: 'Erinnerung anlegen' });
    await expect(form).toContainText('Die Abstände legen Sie selbst fest. Fragen Sie im Zweifel Ihre Tierarztpraxis.');
    await form.getByRole('combobox', { name: 'Tier', exact: true }).selectOption({ label: 'Luna' });
    await form.getByLabel('Titel').fill('Augen reinigen');
    await form.getByLabel('Art').selectOption({ label: 'Pflege' });
    // Wiederholung ist frei wählbar, keine Voreinstellung je Art
    await expect(form.getByLabel('Wiederholung')).toHaveValue('once');
    await form.getByLabel('Art').selectOption({ label: 'Entwurmung' });
    await expect(form.getByLabel('Wiederholung')).toHaveValue('once');
    await form.getByLabel('Art').selectOption({ label: 'Pflege' });
    await form.getByLabel('Wiederholung').selectOption({ label: 'eigene Anzahl Tage' });
    await form.getByLabel('Alle wie viele Tage?').fill('0');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Bitte eine ganze Zahl von 1 bis 3650 angeben.');
    await expect(form.getByLabel('Alle wie viele Tage?')).toBeFocused();
    expect(fake.db.reminders).toHaveLength(0);
    await form.getByLabel('Alle wie viele Tage?').fill('14');
    await form.getByLabel('Fällig am').fill('2026-10-20');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Erinnerung gespeichert: Augen reinigen.')).toHaveCount(1);
    expect(fake.db.reminders![0]).toMatchObject({ pet_id: luna.id, owner_id: ahmed.id, title: 'Augen reinigen', kind: 'grooming', due_on: '2026-10-20', repeat_days: 14 });
    await expect(section(p, /^Nächste 30 Tage/)).toContainText('alle 14 Tage');
    // ändern auf jährlich
    await p.getByRole('button', { name: 'Augen reinigen ändern' }).click();
    const edit = p.getByRole('form', { name: 'Erinnerung ändern' });
    await expect(edit.getByLabel('Alle wie viele Tage?')).toHaveValue('14');
    await edit.getByLabel('Wiederholung').selectOption({ label: 'jährlich (365 Tage)' });
    await edit.getByRole('button', { name: 'Speichern' }).click();
    await expect.poll(() => fake.db.reminders![0]!.repeat_days).toBe(365);
    // löschen
    await p.getByRole('button', { name: 'Augen reinigen löschen' }).click();
    await p.getByRole('dialog', { name: 'Erinnerung löschen?' }).getByRole('button', { name: 'Ja, löschen' }).click();
    await expect.poll(() => fake.db.reminders!.length).toBe(0);
    await expect(main(p)).toContainText('Alles erledigt.');
  });

  test('Kalender-Export einer wiederkehrenden Erinnerung: ganztägig, RRULE, Alarm 9:00', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedRem(fake, luna, ahmed, 'Wurmkur', '2026-12-01', 90);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Wurmkur in meinen Kalender eintragen' }).click()]);
    const flat = readFileSync((await dl.path())!, 'utf8').replace(/\r\n /g, '');
    expect(flat).toContain('DTSTART;VALUE=DATE:20261201');
    expect(flat).toContain('RRULE:FREQ=DAILY;INTERVAL=90');
    expect(flat).toContain('TRIGGER:PT9H');
    expect(flat).toContain('SUMMARY:Wurmkur (Luna)');
  });
});

test.describe('Filter, Übersicht, Rechte', () => {
  test('Filter nach Tier auf beiden Seiten', async ({ browser }) => {
    const { fake, ahmed, luna, mio } = setup();
    seedAppt(fake, luna, ahmed, 'Termin Luna', '2026-10-20T08:00:00.000Z');
    seedAppt(fake, mio, ahmed, 'Termin Mio', '2026-10-21T08:00:00.000Z');
    seedRem(fake, luna, ahmed, 'Erinnerung Luna', '2026-10-20', null);
    seedRem(fake, mio, ahmed, 'Erinnerung Mio', '2026-10-20', null);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/termine');
    const filter = p.getByLabel('Tier anzeigen');
    await expect(filter).toHaveValue('all');
    await expect(main(p)).toContainText('Termin Luna');
    await expect(main(p)).toContainText('Termin Mio');
    await filter.selectOption({ label: 'Mio' });
    await expect(main(p)).not.toContainText('Termin Luna');
    await expect(main(p)).toContainText('Termin Mio');
    await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await p.locator('#main').getByRole('link', { name: 'Erinnerungen', exact: true }).click(); // seit Auftrag 08 unter „Mehr“
    // erst wenn die neue Seite da ist (sonst trifft die Auswahl noch den Filter der Termin-Seite)
    await expect(p.getByRole('heading', { name: 'Erinnerungen', level: 1 })).toBeVisible();
    await expect(main(p)).toContainText('Erinnerung Mio');
    await p.getByLabel('Tier anzeigen').selectOption({ label: 'Luna' });
    await expect(main(p)).toContainText('Erinnerung Luna');
    await expect(main(p)).not.toContainText('Erinnerung Mio');
  });

  test('Übersicht: nächste 3 Termine und fällige Erinnerungen, Abhaken direkt auf der Karte', async ({ browser }) => {
    const { fake, ahmed, luna, mio } = setup();
    for (const [t, d] of [['T1', '2026-10-17'], ['T2', '2026-10-18'], ['T3', '2026-10-19'], ['T4', '2026-10-20']] as const) seedAppt(fake, luna, ahmed, t, `${d}T08:00:00.000Z`);
    seedAppt(fake, luna, ahmed, 'Vorbei', '2026-10-10T08:00:00.000Z');
    const over = seedRem(fake, mio, ahmed, 'Wurmkur Mio', '2026-10-14', 30);
    seedRem(fake, luna, ahmed, 'Bald fällig', '2026-10-25', null);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/');
    const card = p.locator('.upcoming-card');
    await expect(card.getByRole('heading', { name: 'Als Nächstes: Termine und Erinnerungen' })).toBeVisible();
    for (const t of ['T1', 'T2', 'T3']) await expect(card).toContainText(t);
    await expect(card).not.toContainText('T4');
    await expect(card).not.toContainText('Vorbei');
    await expect(card).toContainText('Wurmkur Mio');
    await expect(card).toContainText('überfällig seit 2 Tagen');
    await expect(card).not.toContainText('Bald fällig');
    await card.getByRole('button', { name: 'Wurmkur Mio für Mio als erledigt markieren' }).click();
    await expect(status(p, 'Erledigt. Nächste Erinnerung am 15.11.2026.')).toHaveCount(1);
    expect(fake.db.reminders!.find((r) => r.id === over.id)!.due_on).toBe('2026-11-15');
    await expect(card).toContainText('Heute ist nichts fällig.');
    await expect(card.getByRole('link', { name: 'Alle Erinnerungen' })).toBeFocused();
  });

  test('Mithalterin darf alles; Nur ansehen sieht alles und hat nur den Kalender-Export', async ({ browser }) => {
    const { fake, ahmed, kyra, oma, luna } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    fake.addMember(luna.id, oma, 'viewer');
    seedAppt(fake, luna, ahmed, 'Kontrolle', '2026-10-20T08:00:00.000Z');
    seedRem(fake, luna, ahmed, 'Wurmkur', '2026-10-14', 90);
    const k = await openAs(browser, fake, 'kyra@test.invalid', '/termine');
    // Kyra sieht nur Luna (Mio betreut sie nicht) und darf eintragen
    await k.getByRole('button', { name: 'Termin eintragen' }).click();
    const form = k.getByRole('form', { name: 'Termin eintragen' });
    await expect(form.getByRole('combobox', { name: 'Tier', exact: true }).locator('option')).toHaveText(['Luna']);
    await form.getByLabel('Titel').fill('Training');
    await form.getByLabel('Art').selectOption({ label: 'Training' });
    await form.getByLabel('Uhrzeit von').fill('17:00');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect.poll(() => fake.db.appointments!.filter((a) => a.owner_id === kyra.id).length).toBe(1);
    await k.getByRole('button', { name: 'Kontrolle als erledigt markieren' }).click();
    await expect.poll(() => fake.db.appointments!.find((a) => a.title === 'Kontrolle')!.status).toBe('done');
    await k.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await k.locator('#main').getByRole('link', { name: 'Erinnerungen', exact: true }).click(); // seit Auftrag 08 unter „Mehr“
    await k.getByRole('button', { name: 'Wurmkur für Luna als erledigt markieren' }).click();
    await expect.poll(() => fake.db.reminders![0]!.due_on).toBe('2027-01-14');

    const o = await openAs(browser, fake, 'oma@test.invalid', '/termine');
    await expect(main(o)).toContainText('Sie können die Termine ansehen, aber nicht ändern.');
    await expect(main(o)).toContainText('Training');
    await expect(o.getByRole('button', { name: 'Termin eintragen' })).toHaveCount(0);
    await expect(main(o).getByRole('button', { name: /ändern|löschen|erledigt|absagen/ })).toHaveCount(0);
    const [dl] = await Promise.all([o.waitForEvent('download'), o.getByRole('button', { name: 'Training in meinen Kalender eintragen' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.ics$/);
    await o.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await o.locator('#main').getByRole('link', { name: 'Erinnerungen', exact: true }).click(); // seit Auftrag 08 unter „Mehr“
    await expect(main(o)).toContainText('Sie können die Erinnerungen ansehen, aber nicht ändern.');
    await expect(main(o)).toContainText('Wurmkur');
    await expect(o.getByRole('button', { name: 'Erinnerung anlegen' })).toHaveCount(0);
    await expect(main(o).getByRole('button', { name: /ändern|löschen|als erledigt|anderen Tag/ })).toHaveCount(0);
    await expect(main(o).getByRole('button', { name: 'Wurmkur in meinen Kalender eintragen' })).toBeVisible();
    // auch direkt an der Datenbank vorbei: complete_reminder wird abgelehnt
    const res = await o.evaluate(async (id) => {
      const key = Object.keys(localStorage).find((x) => x.startsWith('sb-'))!;
      const token = (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
      const r = await fetch('https://cpnbkegojxagbzkomzap.supabase.co/rest/v1/rpc/complete_reminder', { method: 'POST', headers: { apikey: 'x', authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_id: id }) });
      return { status: r.status, body: (await r.json()) as { message?: string } };
    }, fake.db.reminders![0]!.id as string);
    expect(res.body.message).toBe('reminder_not_allowed');
    // Übersicht: kein Abhaken für Nur ansehen
    await o.goto('/'); await o.waitForLoadState('networkidle');
    await expect(o.locator('.upcoming-card')).toContainText('Training');
    await expect(o.locator('.upcoming-card').getByRole('button')).toHaveCount(0);
  });
});

test.describe('Tastatur und Darstellung', () => {
  test('Termin nur mit der Tastatur anlegen und per Dialog löschen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedAppt(fake, luna, ahmed, 'Alter Termin', '2026-10-30T08:00:00.000Z');
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/termine');
    const add = p.getByRole('button', { name: 'Termin eintragen' });
    await add.focus();
    await p.keyboard.press('Enter');
    const form = p.getByRole('form', { name: 'Termin eintragen' });
    await expect(form.getByRole('combobox', { name: 'Tier', exact: true })).toBeFocused();
    await p.keyboard.press('ArrowDown'); // Luna
    await p.keyboard.press('Tab');
    await expect(form.getByLabel('Titel')).toBeFocused();
    await p.keyboard.type('Physio');
    // Native Uhrzeit-Auswahl nimmt in der Handy-Emulation keine getippten Ziffern an: Wert ohne Maus setzen
    await form.getByLabel('Uhrzeit von').focus();
    await form.getByLabel('Uhrzeit von').fill('09:30');
    await form.getByLabel('Titel').focus();
    await p.keyboard.press('Enter');
    await expect(status(p, 'Termin gespeichert: Physio.')).toHaveCount(1);
    expect(fake.db.appointments!.find((a) => a.title === 'Physio')).toMatchObject({ starts_at: '2026-10-16T07:30:00.000Z' });
    await expect(add).toBeFocused();
    // Löschdialog: Escape schließt, Tab + Enter löscht
    const del = p.getByRole('button', { name: 'Alter Termin löschen' });
    await del.focus();
    await p.keyboard.press('Enter');
    const dlg = p.getByRole('dialog', { name: 'Termin löschen?' });
    await expect(dlg).toBeVisible();
    await p.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(del).toBeFocused();
    await p.keyboard.press('Enter');
    await expect(dlg.getByRole('button', { name: 'Abbrechen' })).toBeFocused();
    await p.keyboard.press('Tab');
    await expect(dlg.getByRole('button', { name: 'Ja, löschen' })).toBeFocused();
    await p.keyboard.press('Enter');
    await expect.poll(() => fake.db.appointments!.some((a) => a.title === 'Alter Termin')).toBe(false);
  });

  test('Erinnerung abhaken und „Erledigt am …“ mit der Tastatur', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedRem(fake, luna, ahmed, 'Wurmkur', '2026-10-14', 90);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen');
    await p.getByRole('button', { name: 'Wurmkur: an einem anderen Tag erledigt' }).focus();
    await p.keyboard.press('Enter');
    const dlg = p.getByRole('dialog', { name: 'Wurmkur: erledigt am' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Erledigt am').fill('2026-10-15');
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    await expect(dlg.getByRole('button', { name: 'Erledigt' })).toBeFocused();
    await p.keyboard.press('Enter');
    await expect(status(p, 'Erledigt. Nächste Erinnerung am 13.01.2027.')).toHaveCount(1);
  });

  test('320 px: Termine, Erinnerungen und Übersicht ohne seitliches Scrollen; Navigation mit 5 Punkten (Rest unter „Mehr“)', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedAppt(fake, luna, ahmed, 'Kontrolle mit einem ziemlich langen Titel für den Termin', '2026-10-20T08:00:00.000Z', { location: 'Tierklinik am anderen Ende der Stadt, Haupteingang Süd', note: 'Lange Notiz '.repeat(20) });
    seedRem(fake, luna, ahmed, 'Floh- und Zeckenschutz monatlich auftragen nicht vergessen', '2026-10-14', 30, { kind: 'flea_tick' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/', 320);
    await expect(p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link')).toHaveText(['Heute', 'Termine', 'Tier', 'Praxen', 'Mehr']);
    for (const url of ['/', '/termine', '/erinnerungen']) {
      await p.goto(url); await p.waitForLoadState('networkidle');
      expect(await p.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(320);
      const small = await p.evaluate(() =>
        [...document.querySelectorAll('#main button, #main a, #main select, #main input, #main summary, nav a')]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 24 || r.w < 24),
      );
      expect(small, url).toEqual([]);
    }
  });
});
