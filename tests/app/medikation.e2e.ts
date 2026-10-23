import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { FakeSupabase, SB } from './fake-supabase';

/** Medikation (Auftrag 09): Dosierung, Uhrzeiten, „Gabe abhaken“, Notfallkarte, Sitter-Seite, Gesundheitsakte. */

const NOW = new Date('2026-10-16T08:30:00+02:00'); // Freitag, 08:30
const PW = 'Testpasswort-123';
const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string, now = NOW): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.clock.setFixedTime(now);
  await page.goto('/login');
  // Einführung vor der Anmeldung überspringen (falls sichtbar)
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
  const kyra = fake.seedUser('kyra@test.invalid', PW, 'Kyra');
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog', vet_name: 'Tierarztpraxis am Ostpark', vet_phone: '06142 123', medications: 'Tabletten in Leberwurst verstecken' });
  fake.addMember(luna.id, kyra, 'carer');
  fake.addMember(luna.id, oma, 'viewer');
  return { fake, ahmed, kyra, oma, luna };
}

const main = (p: Page) => p.locator('#main');
const medCard = (p: Page) => main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Medikation', level: 2, exact: true }) });
const row = (scope: Locator, name: string) => scope.locator('li.record-row').filter({ hasText: name });
const today = (p: Page) => main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Heute: Medikamente' }) });
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });
const form = (p: Page) => p.getByRole('form', { name: /Medikament (eintragen|bearbeiten)/ });

async function fillMed(p: Page, o: { name?: string; amount?: string; unit?: string; freq?: string; times?: string[]; hint?: string; note?: string }) {
  const f = form(p);
  if (o.name !== undefined) await f.getByRole('textbox', { name: /^Präparat/ }).fill(o.name);
  if (o.amount !== undefined) await f.getByRole('textbox', { name: /^Menge pro Gabe/ }).fill(o.amount);
  if (o.unit) await f.getByRole('combobox', { name: 'Einheit' }).selectOption(o.unit);
  if (o.freq) await f.getByRole('group', { name: 'Wie oft?' }).getByRole('button', { name: o.freq, exact: true }).click();
  for (const [i, tm] of (o.times ?? []).entries()) await f.getByLabel(new RegExp(`^${i + 1}\\. Gabe`)).fill(tm);
  if (o.hint) await f.getByRole('radio', { name: o.hint }).check();
  if (o.note !== undefined) await f.getByRole('textbox', { name: /^Weitere Hinweise/ }).fill(o.note);
}

test.afterEach(async () => {
  for (const [page, list] of errors) expect(list.filter((e) => !/Failed to load resource/.test(e)), `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  errors.clear();
});

test.describe('Tierakte: Medikation', () => {
  test('Sicherheitshinweis; 2× täglich mit Futter anlegen → Dosierungstext, Herkunft, verordnet von (vorbelegt)', async ({ browser }) => {
    const { fake, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    const card = medCard(p);
    await expect(card.getByRole('note')).toHaveText('Geben Sie Medikamente nur so, wie Ihre Tierarztpraxis sie verordnet hat. Ändern Sie die Dosierung nicht ohne Rücksprache. PetConnect berechnet und empfiehlt keine Dosierungen.');
    await expect(card).toContainText('Keine Medikation eingetragen.');
    await card.getByRole('button', { name: 'Medikament eintragen' }).click();
    await expect(form(p).getByRole('textbox', { name: /^Präparat/ })).toBeFocused();
    await expect(form(p).getByRole('textbox', { name: /^Verordnet von/ })).toHaveValue('Tierarztpraxis am Ostpark');
    await expect(form(p).getByRole('textbox', { name: /^Menge pro Gabe/ })).toHaveAttribute('inputmode', 'decimal');
    await fillMed(p, { name: 'Meloxicam', amount: '0,5', unit: 'ml', freq: '2× täglich', times: ['08:00', '19:30'], hint: 'mit Futter' });
    await expect(form(p).getByRole('group', { name: 'Wie oft?' }).getByRole('button', { name: '2× täglich' })).toHaveAttribute('aria-pressed', 'true');
    await form(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Meloxicam eingetragen und steht im Tagesplan.')).toHaveCount(1);
    const r = row(card, 'Meloxicam');
    await expect(r).toContainText('0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter');
    await expect(r).toContainText('von Ihnen');
    await expect(r).toContainText('verordnet von Tierarztpraxis am Ostpark');
    await expect(r).toContainText('seit 16.10.2026');
    await expect(r.locator('.pill')).toHaveText('Dauermedikation');
    await expect(card.getByRole('button', { name: 'Medikament eintragen' })).toBeFocused();
    expect(fake.db.pet_medications).toMatchObject([{ pet_id: luna.id, source: 'owner', name: 'Meloxicam', amount: 0.5, unit: 'ml', frequency: 'daily', times: ['08:00:00', '19:30:00'], intake_hint: 'with_food', remind: true, starts_on: '2026-10-16', ends_on: null }]);
    // Einzahl/Mehrzahl
    await card.getByRole('button', { name: 'Medikament eintragen' }).click();
    await fillMed(p, { name: 'Apoquel', amount: '1', hint: 'nüchtern (vor dem Füttern)' });
    await form(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(row(card, 'Apoquel')).toContainText('1 Tablette · 1× täglich (08:00 Uhr) · nüchtern (vor dem Füttern)');
    // „Weitere Hinweise zur Medikation“ (bisheriges Freitextfeld)
    await expect(card).toContainText('Weitere Hinweise zur Medikation');
    await expect(card).toContainText('Tabletten in Leberwurst verstecken');
    await card.getByRole('button', { name: 'Hinweise ändern' }).click();
    await card.getByRole('textbox', { name: /^Weitere Hinweise zur Medikation/ }).fill('Nur mit Leberwurst');
    await card.getByRole('button', { name: 'Speichern' }).click();
    await expect(card).toContainText('Nur mit Leberwurst');
    expect(fake.db.pets!.find((x) => x.id === luna.id)!.medications).toBe('Nur mit Leberwurst');
  });

  test('Pflichtfelder und Fehlertexte am Feld; doppelte und fehlende Uhrzeit; Ende vor Beginn; „bei Bedarf“ ohne Uhrzeit', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    await medCard(p).getByRole('button', { name: 'Medikament eintragen' }).click();
    const f = form(p);
    const name = f.getByRole('textbox', { name: /^Präparat/ });
    const amount = f.getByRole('textbox', { name: /^Menge pro Gabe/ });
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toContainText('Bitte geben Sie das Präparat an.');
    await expect(f).toContainText('Bitte geben Sie die Menge als Zahl an, z. B. 1 oder 0,5.');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(/Bitte geben Sie das Präparat an\./);
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await fillMed(p, { name: 'Meloxicam', amount: '1,234' });
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(amount).toBeFocused();
    await expect(f).not.toContainText('Bitte geben Sie das Präparat an.');
    for (const bad of ['0', '-1', 'abc']) {
      await amount.fill(bad);
      await f.getByRole('button', { name: 'Speichern' }).click();
      await expect(amount, bad).toHaveAttribute('aria-invalid', 'true');
    }
    await fillMed(p, { amount: '0.25', freq: '2× täglich', times: ['08:00', '08:00'] });
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toContainText('Diese Uhrzeit ist schon eingetragen.');
    await expect(f.getByLabel(/^2\. Gabe/)).toBeFocused();
    await f.getByLabel(/^1\. Gabe/).fill('');
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toContainText('Bitte geben Sie eine Uhrzeit an.');
    await fillMed(p, { times: ['08:00', '20:00'] });
    await f.getByLabel(/^Ende/).fill('2026-10-01');
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toContainText('Das Ende liegt vor dem Beginn.');
    await f.getByLabel(/^Ende/).fill('');
    // bei Bedarf: keine Uhrzeiten, Hinweis
    await f.getByRole('group', { name: 'Wie oft?' }).getByRole('button', { name: 'bei Bedarf' }).click();
    await expect(f.getByLabel(/^1\. Gabe/)).toHaveCount(0);
    await expect(f).toContainText('Bei Bedarf gibt es keine feste Uhrzeit und keine Erinnerung.');
    await expect(f.getByRole('checkbox', { name: 'Uhrzeiten als Erinnerung anzeigen' })).toHaveCount(0);
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(row(medCard(p), 'Meloxicam')).toContainText('0,25 Tabletten · bei Bedarf');
    expect(fake.db.pet_medications).toMatchObject([{ frequency: 'as_needed', times: [] }]);
  });

  test('Bearbeiten, Beenden (verschwindet aus „Heute“), Löschen mit Bestätigung (auch die Gaben)', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const med = fake.seedMedication(luna, ahmed, { name: 'Apoquel', amount: 1, unit: 'tablet', times: ['08:00'], starts_on: '2026-10-01' });
    fake.seedDose(med, ahmed, '2026-10-15', '08:00', '2026-10-15T06:02:00Z');
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen');
    await expect(row(today(p), 'Apoquel')).toContainText('08:00 · Luna · Apoquel 1 Tablette');
    await p.goto('/tier'); await p.waitForLoadState('networkidle');
    const card = medCard(p);
    await card.getByRole('button', { name: 'Apoquel bearbeiten' }).click();
    await expect(form(p).getByRole('textbox', { name: /^Präparat/ })).toHaveValue('Apoquel');
    await fillMed(p, { amount: '2', freq: '2× täglich' });
    await expect(form(p).getByLabel(/^1\. Gabe/)).toHaveValue('08:00');
    await expect(form(p).getByLabel(/^2\. Gabe/)).toHaveValue('20:00');
    await form(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Apoquel gespeichert und steht im Tagesplan.')).toHaveCount(1);
    await expect(row(card, 'Apoquel')).toContainText('2 Tabletten · 2× täglich (08:00, 20:00 Uhr)');
    await expect(card.getByRole('button', { name: 'Apoquel bearbeiten' })).toBeFocused();
    // Beenden: ohne Rückfrage, Hinweis, unter „Beendet“
    await card.getByRole('button', { name: 'Apoquel beenden' }).click();
    await expect(status(p, 'Medikation beendet')).toHaveCount(1);
    expect(fake.db.pet_medications![0]).toMatchObject({ stopped_on: '2026-10-16' });
    await expect(card.locator('details summary')).toHaveText('Beendet (1)');
    await expect(card).toContainText('Keine Medikation eingetragen.');
    await card.locator('details summary').click();
    await expect(row(card, 'Apoquel').locator('.pill')).toHaveText('beendet');
    await expect(row(card, 'Apoquel')).toContainText('seit 01.10.2026 · bis 16.10.2026');
    await p.goto('/erinnerungen'); await p.waitForLoadState('networkidle');
    await expect(main(p)).not.toContainText('Heute: Medikamente');
    // Löschen
    await p.goto('/tier'); await p.waitForLoadState('networkidle');
    await medCard(p).locator('details summary').click();
    await medCard(p).getByRole('button', { name: 'Apoquel löschen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Medikament löschen' });
    await expect(dlg).toContainText('Apoquel wirklich löschen? Auch die abgehakten Gaben werden gelöscht.');
    await dlg.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect(status(p, 'Eintrag gelöscht')).toHaveCount(1);
    expect(fake.db.pet_medications).toHaveLength(0);
    expect(fake.db.medication_doses).toHaveLength(0);
  });

  test('Eintrag der Praxis: keine Aktionen, Hinweis; die Datenbank lehnt Ändern ab', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    fake.seedMedication(luna, ahmed, { name: 'Wurmkur', source: 'practice', amount: 1, unit: 'tablet', frequency: 'as_needed', times: [] });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    const r = row(medCard(p), 'Wurmkur');
    await expect(r).toContainText('Von der Praxis');
    await expect(r).toContainText('Einträge der Praxis kann nur die Praxis ändern.');
    await expect(r.getByRole('button')).toHaveCount(0);
    // auch direkt über die Schnittstelle nicht änderbar (RLS: keine Zeile geändert)
    const res = await p.evaluate(async (sb) => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!;
      const token = (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
      const r = await fetch(`${sb}/rest/v1/pet_medications?name=eq.Wurmkur`, { method: 'PATCH', headers: { apikey: 'sb_publishable_test', authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ amount: 5 }) });
      return { status: r.status, body: (await r.json()) as unknown };
    }, SB);
    expect(res).toEqual({ status: 200, body: [] });
    expect(fake.db.pet_medications![0]!.amount).toBe(1);
  });
});

test.describe('Heute: Medikamente', () => {
  function withMeloxicam() {
    const s = setup();
    const med = s.fake.seedMedication(s.luna, s.ahmed, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00', '19:30'], intake_hint: 'with_food', starts_on: '2026-10-10' });
    return { ...s, med };
  }

  test('Gegeben → „gegeben von Ihnen um …“, Rückgängig; Mithalterin sieht „gegeben von Ahmed“; gleichzeitiges Abhaken → Hinweis', async ({ browser }) => {
    const { fake, ahmed, med } = withMeloxicam();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen');
    const list = today(p);
    await expect(list.getByRole('heading', { level: 2 })).toHaveText('Heute: Medikamente');
    await expect(list.locator('li')).toHaveText([/^08:00 · Luna · Meloxicam 0,5 ml · mit Futter\s*jetzt fällig/, /^19:30 · Luna · Meloxicam 0,5 ml · mit Futter\s*offen/]);
    await list.getByRole('button', { name: 'Meloxicam für Luna um 08:00 als gegeben abhaken' }).click();
    await expect(status(p, 'Meloxicam um 08:00 als gegeben abgehakt.')).toHaveCount(1);
    await expect(row(list, '08:00')).toContainText('gegeben von Ihnen um 08:30');
    const undo = list.getByRole('button', { name: 'Gabe Meloxicam für Luna um 08:00 zurücknehmen' });
    await expect(undo).toBeFocused();
    expect(fake.db.medication_doses).toMatchObject([{ medication_id: med.id, scheduled_on: '2026-10-16', scheduled_time: '08:00:00', given_by: ahmed.id }]);
    await undo.click();
    await expect(status(p, 'Gabe Meloxicam um 08:00 zurückgenommen.')).toHaveCount(1);
    await expect(row(list, '08:00')).toContainText('jetzt fällig');
    expect(fake.db.medication_doses).toHaveLength(0);
    await list.getByRole('button', { name: 'Meloxicam für Luna um 08:00 als gegeben abhaken' }).click();
    await expect(row(list, '08:00')).toContainText('gegeben von Ihnen um 08:30');

    // Mithalterin Kyra
    const k = await openAs(browser, fake, 'kyra@test.invalid', '/erinnerungen');
    await expect(row(today(k), '08:00')).toContainText('gegeben von Ahmed um 08:30');
    // Ahmed hakt 19:30 ab, während Kyras Seite noch den alten Stand zeigt
    fake.seedDose(med, ahmed, '2026-10-16', '19:30', '2026-10-16T06:31:00Z');
    await today(k).getByRole('button', { name: 'Meloxicam für Luna um 19:30 als gegeben abhaken' }).click();
    await expect(status(k, 'Ahmed hat diese Gabe schon um 08:31 abgehakt.')).toHaveCount(1);
    await expect(row(today(k), '19:30')).toContainText('gegeben von Ahmed um 08:31');
    expect(fake.db.medication_doses).toHaveLength(2);
  });

  test('überfällig mit Uhr; Übersicht zeigt die nächste offene Gabe und „Alle Gaben heute“', async ({ browser }) => {
    const { fake } = withMeloxicam();
    const late = new Date('2026-10-16T09:15:00+02:00');
    fake.now = late;
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/', late);
    const card = main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Heute: Medikamente' }) });
    await expect(card).toContainText('Nächste Gabe');
    await expect(card.locator('li')).toHaveText(/^08:00 · Luna · Meloxicam 0,5 ml · mit Futter\s*überfällig seit 75 Min\./);
    await card.getByRole('button', { name: 'Meloxicam für Luna um 08:00 als gegeben abhaken' }).click();
    await expect(card.locator('li')).toHaveText(/^19:30 · Luna · Meloxicam 0,5 ml · mit Futter\s*offen/);
    await expect(card.getByRole('link', { name: 'Alle Gaben heute' })).toBeFocused();
    await card.getByRole('link', { name: 'Alle Gaben heute' }).click();
    await expect(p).toHaveURL(/\/erinnerungen$/);
    await expect(row(today(p), '08:00')).toContainText('gegeben von Ihnen um 09:15');
    await expect(row(today(p), '19:30')).toContainText('offen');
    // Mitternacht: am nächsten Tag ist alles wieder offen (Kalendertag Europe/Berlin)
    await p.clock.setFixedTime(new Date('2026-10-17T00:10:00+02:00'));
    fake.today = '2026-10-17';
    await p.reload(); await p.waitForLoadState('networkidle');
    await expect(row(today(p), '08:00')).toContainText('offen');
  });

  test('Nur ansehen: Liste ohne Knöpfe, Tierakte ohne Bearbeiten', async ({ browser }) => {
    const { fake } = withMeloxicam();
    const p = await openAs(browser, fake, 'oma@test.invalid', '/erinnerungen');
    await expect(row(today(p), '08:00')).toContainText('jetzt fällig');
    await expect(today(p).getByRole('button')).toHaveCount(0);
    await p.goto('/tier'); await p.waitForLoadState('networkidle');
    const card = medCard(p);
    await expect(row(card, 'Meloxicam')).toContainText('0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter');
    await expect(row(card, 'Meloxicam')).toContainText('von Ahmed');
    await expect(card.getByRole('note')).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
  });
});

test.describe('Anzeige an anderen Stellen', () => {
  test('Notfallkarte, öffentliche Sitter-Seite und Gesundheitsakte: laufende ja, beendete nicht (Akte: unter „beendet“)', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    fake.seedMedication(luna, ahmed, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00', '19:30'], intake_hint: 'with_food', starts_on: '2026-10-10', ends_on: '2026-10-30' });
    fake.seedMedication(luna, ahmed, { name: 'Altmittel', amount: 1, unit: 'capsule', times: ['09:00'], starts_on: '2026-09-01', stopped_on: '2026-10-10' });
    fake.seedMedication(luna, ahmed, { name: 'Sehr alt', amount: 1, unit: 'capsule', times: ['09:00'], starts_on: '2024-01-01', ends_on: '2024-02-01' });
    const token = (randomUUID() + randomUUID()).replace(/-/g, '');
    fake.db.sitter_access!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, sitter_name: 'Lea', valid_from: '2026-10-16', valid_to: '2026-10-20', feeding: 'morgens', care_notes: 'Apoquel morgens', token, revoked_at: null, created_at: NOW.toISOString() });

    const p = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${String(luna.id)}/notfallkarte`);
    const ec = main(p).locator('.print-card');
    await expect(ec).toContainText('Meloxicam – 0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter');
    await expect(ec).not.toContainText('Altmittel');
    await expect(ec).toContainText('Weitere Hinweise zur Medikation');
    await expect(ec).toContainText('Tabletten in Leberwurst verstecken');

    await p.goto(`/tier/${String(luna.id)}/gesundheitsakte`); await p.waitForLoadState('networkidle');
    const plan = main(p).locator('.vault-section').filter({ has: p.getByRole('heading', { name: 'Medikationsplan' }) });
    const tables = plan.locator('table');
    await expect(tables).toHaveCount(2);
    await expect(tables.nth(0).locator('tbody tr')).toHaveCount(1);
    await expect(tables.nth(0).locator('tbody tr').first().locator('td')).toHaveText(['Meloxicam', '0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter', 'seit 10.10.2026 · bis 30.10.2026', 'laufend', 'eigene Angabe']);
    await expect(plan).toContainText('Beendet (letzte 12 Monate)');
    await expect(tables.nth(1).locator('tbody tr')).toHaveText([/Altmittel.*1 Kapsel · 1× täglich \(09:00 Uhr\).*seit 01\.09\.2026 · bis 10\.10\.2026.*beendet/]);
    await expect(plan).not.toContainText('Sehr alt');
    await expect(plan).not.toContainText('gegeben');

    // öffentliche Sitter-Seite (ohne Anmeldung)
    const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    await fake.installContext(ctx);
    const s = await ctx.newPage();
    const sErr: string[] = [];
    errors.set(s, sErr);
    s.on('console', (m) => { if (m.type() === 'error') sErr.push(m.text()); });
    await s.clock.setFixedTime(NOW);
    await s.goto(`/betreuung/${token}`); await s.waitForLoadState('networkidle');
    const sec = s.locator('section').filter({ has: s.getByRole('heading', { name: 'Medikamente', exact: true }) });
    await expect(sec.getByRole('note')).toHaveText('Bitte geben Sie Medikamente genau wie angegeben. Bei Fragen rufen Sie die Halter:in oder die Praxis an.');
    await expect(sec.locator('li')).toHaveText(['Meloxicam – 0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter · bis 30.10.2026']);
    await expect(s.locator('#main')).not.toContainText('Altmittel');
    await expect(s.getByRole('button', { name: /Gegeben/ })).toHaveCount(0);
    await expect(s.locator('#main')).toContainText('Apoquel morgens');
    await expect(s.locator('#main')).toContainText('Tabletten in Leberwurst verstecken');
  });
});

test.describe('Tastatur', () => {
  test('Formular und Knopfgruppe ohne Maus; Abbrechen setzt den Fokus zurück', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    const add = medCard(p).getByRole('button', { name: 'Medikament eintragen' });
    await add.focus();
    await p.keyboard.press('Enter');
    const f = form(p);
    await expect(f.getByRole('textbox', { name: /^Präparat/ })).toBeFocused();
    await p.keyboard.type('Prednisolon');
    await p.keyboard.press('Tab');
    await expect(f.getByRole('textbox', { name: /^Menge pro Gabe/ })).toBeFocused();
    await p.keyboard.type('0,5');
    await p.keyboard.press('Tab');
    await expect(f.getByRole('combobox', { name: 'Einheit' })).toBeFocused();
    await p.keyboard.press('Tab');
    const g = f.getByRole('group', { name: 'Wie oft?' });
    await expect(g.getByRole('button', { name: '1× täglich' })).toBeFocused();
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    await expect(g.getByRole('button', { name: '3× täglich' })).toBeFocused();
    await p.keyboard.press('Enter');
    await expect(g.getByRole('button', { name: '3× täglich' })).toHaveAttribute('aria-pressed', 'true');
    await expect(f.getByLabel(/^3\. Gabe/)).toHaveValue('20:00');
    await p.keyboard.press('Space');
    await expect(g.getByRole('button', { name: '3× täglich' })).toHaveAttribute('aria-pressed', 'true');
    // Hinweis zur Gabe mit Pfeiltasten (Radiogruppe)
    await f.getByRole('radio', { name: 'kein Hinweis' }).focus();
    await p.keyboard.press('ArrowRight');
    await expect(f.getByRole('radio', { name: 'mit Futter' })).toBeChecked();
    await f.getByRole('button', { name: 'Speichern' }).focus();
    await p.keyboard.press('Enter');
    await expect(row(medCard(p), 'Prednisolon')).toContainText('0,5 Tabletten · 3× täglich (08:00, 14:00, 20:00 Uhr) · mit Futter');
    // Abbrechen per Tastatur
    await add.focus();
    await p.keyboard.press('Enter');
    await f.getByRole('button', { name: 'Abbrechen' }).focus();
    await p.keyboard.press('Enter');
    await expect(add).toBeFocused();
    // Löschdialog: Escape schließt
    await medCard(p).getByRole('button', { name: 'Prednisolon löschen' }).focus();
    await p.keyboard.press('Enter');
    await expect(p.getByRole('dialog', { name: 'Medikament löschen' })).toBeVisible();
    await p.keyboard.press('Escape');
    await expect(p.getByRole('dialog', { name: 'Medikament löschen' })).toBeHidden();
    expect(fake.db.pet_medications).toHaveLength(1);
  });
});

test('320 px: Tierakte mit Formular und „Heute: Medikamente“ ohne seitliches Scrollen', async ({ browser }) => {
  const { fake, ahmed, luna } = setup();
  fake.seedMedication(luna, ahmed, { name: 'Meloxicam mit sehr langem Präparatnamen', amount: 0.5, unit: 'ml', times: ['08:00', '19:30'], intake_hint: 'empty_stomach', starts_on: '2026-10-10' });
  const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
  await p.setViewportSize({ width: 320, height: 800 });
  await medCard(p).getByRole('button', { name: 'Medikament eintragen' }).click();
  await form(p).getByRole('group', { name: 'Wie oft?' }).getByRole('button', { name: '4× täglich' }).click();
  expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const url of ['/erinnerungen', '/', `/tier/${String(luna.id)}/notfallkarte`]) {
    await p.goto(url); await p.waitForLoadState('networkidle');
    expect(await p.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(320);
  }
});
