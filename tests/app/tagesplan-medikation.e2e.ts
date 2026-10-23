import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { FakeSupabase, SB } from './fake-supabase';

/** Tagesplan und Medikation verknüpft (Auftrag 11): eine Quelle für Medikamente, Abhaken überall gleich, Umwandeln alter Einträge. */

const NOW = new Date('2026-10-16T08:30:00+02:00'); // Freitag, 08:30
const PW = 'Testpasswort-123';
const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.clock.setFixedTime(NOW);
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
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog', vet_name: 'Tierarztpraxis am Ostpark' });
  fake.addMember(luna.id, oma, 'viewer');
  fake.seedRoutine(luna, ahmed, { kind: 'walk', time_of_day: '07:00' });
  fake.seedRoutine(luna, ahmed, { kind: 'feed', time_of_day: '12:00' });
  return { fake, ahmed, oma, luna };
}

const main = (p: Page) => p.locator('#main');
const plan = (p: Page) => main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Tagesplan', level: 2 }) });
const planRows = (p: Page) => plan(p).locator('li.routine-row');
const planRow = (p: Page, text: string | RegExp) => planRows(p).filter({ hasText: text });
const medCard = (p: Page) => main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Medikation', level: 2, exact: true }) });
const todayMeds = (p: Page) => main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Heute: Medikamente' }) });
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });
const medForm = (p: Page) => p.getByRole('form', { name: /Medikament eintragen|Als Medikament eintragen/ });
const chooser = (p: Page) => p.getByRole('form', { name: 'Medikament für den Tagesplan' });

async function fillMed(f: Locator, o: { name?: string; amount?: string; unit?: string; freq?: string; times?: string[]; hint?: string }) {
  if (o.name !== undefined) await f.getByRole('textbox', { name: /^Präparat/ }).fill(o.name);
  if (o.amount !== undefined) await f.getByRole('textbox', { name: /^Menge pro Gabe/ }).fill(o.amount);
  if (o.unit) await f.getByRole('combobox', { name: 'Einheit' }).selectOption(o.unit);
  if (o.freq) await f.getByRole('group', { name: 'Wie oft?' }).getByRole('button', { name: o.freq, exact: true }).click();
  for (const [i, tm] of (o.times ?? []).entries()) await f.getByLabel(new RegExp(`^${i + 1}\\. Gabe`)).fill(tm);
  if (o.hint) await f.getByRole('radio', { name: o.hint }).check();
}

/** Über „Mehr“ (ohne Neuladen) zu Alltag oder Erinnerungen – zeigt, dass alle Ansichten denselben Stand haben */
async function viaMore(p: Page, name: 'Alltag' | 'Erinnerungen') {
  await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
  await main(p).getByRole('link', { name, exact: true }).click();
  await expect(p.getByRole('heading', { name, level: 1 })).toBeVisible();
}
const toPlan = (p: Page) => viaMore(p, 'Alltag');

test.afterEach(async () => {
  for (const [page, list] of errors) expect(list.filter((e) => !/Failed to load resource|simulierter Fehler/.test(e)), `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  errors.clear();
});

test.describe('Medikamente erscheinen im Tagesplan', () => {
  test('anlegen mit 08:00/20:00 → beide Zeiten mit „aus der Medikation“, ohne Löschen/Schalter; Tipp → Tierakte mit Fokus; Nur ansehen ohne Knöpfe', async ({ browser }) => {
    const { fake, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    await medCard(p).getByRole('button', { name: 'Medikament eintragen' }).click();
    await fillMed(medForm(p), { name: 'Meloxicam', amount: '0,5', unit: 'ml', freq: '2× täglich', times: ['08:00', '20:00'], hint: 'mit Futter' });
    await medForm(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Meloxicam eingetragen und steht im Tagesplan.')).toHaveCount(1);
    const med = fake.db.pet_medications!.find((m) => m.name === 'Meloxicam')!;

    await toPlan(p);
    // zusammen mit dem Tagesplan nach Uhrzeit sortiert
    await expect(planRows(p)).toHaveCount(4);
    await expect(planRows(p).locator('.time')).toHaveText(['07:00', '08:00', '12:00', '20:00']);
    for (const time of ['08:00', '20:00']) {
      const r = planRow(p, time);
      await expect(r).toContainText('Meloxicam · 0,5 ml · mit Futter');
      await expect(r.locator('.pill-med')).toHaveText('aus der Medikation');
      await expect(r.getByRole('button', { name: /löschen/ })).toHaveCount(0);
      await expect(r.getByRole('switch')).toHaveCount(0);
      await expect(r.getByRole('button', { name: /bearbeiten/ })).toHaveCount(0);
    }
    await expect(planRow(p, '08:00')).toContainText('jetzt fällig');
    await expect(planRow(p, '20:00')).toContainText('offen');
    // kein Tagesplan-Eintrag entstanden
    expect(fake.db.routine_items!.filter((r) => r.pet_id === luna.id)).toHaveLength(2);

    // Tipp auf den Text → Tierakte, Karte Medikation, dieses Medikament im Fokus
    await planRow(p, '08:00').getByRole('link', { name: 'Meloxicam · 0,5 ml · mit Futter' }).click();
    await expect(p).toHaveURL(new RegExp(`/tier#med-${String(med.id)}$`));
    await expect(medCard(p).locator(`#med-${String(med.id)}`)).toBeFocused();

    // Nur ansehen (Oma): sieht alles, keine Knöpfe
    const o = await openAs(browser, fake, 'oma@test.invalid', '/alltag');
    await expect(planRows(o)).toHaveCount(4);
    await expect(planRow(o, '08:00').locator('.pill-med')).toHaveText('aus der Medikation');
    await expect(plan(o).getByRole('button')).toHaveCount(0);
    await expect(plan(o).getByRole('switch')).toHaveCount(0);
  });

  test('„bei Bedarf“ und ohne Erinnerung nicht im Tagesplan; Beenden in der Tierakte → sofort weg aus Tagesplan und „Heute: Medikamente“', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    fake.seedMedication(luna, ahmed, { name: 'Novalgin', frequency: 'as_needed', times: [] });
    fake.seedMedication(luna, ahmed, { name: 'Leise', times: ['09:00'], remind: false });
    fake.seedMedication(luna, ahmed, { name: 'Apoquel', amount: 1, unit: 'tablet', times: ['10:00'], starts_on: '2026-10-01' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    await expect(planRows(p)).toHaveCount(3);
    await expect(plan(p)).toContainText('Apoquel · 1 Tablette');
    await expect(plan(p)).not.toContainText('Novalgin');
    await expect(plan(p)).not.toContainText('Leise');
    // Übersicht: auch dort sichtbar
    await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Heute' }).click();
    await expect(main(p).locator('.today-row').filter({ hasText: 'Apoquel' })).toHaveCount(1);
    await expect(todayMeds(p)).toContainText('Apoquel');
    // Beenden (ohne Neuladen weiter navigieren)
    await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Tier' }).click();
    await medCard(p).getByRole('button', { name: 'Apoquel beenden' }).click();
    await expect(status(p, 'Medikation beendet')).toHaveCount(1);
    await toPlan(p);
    await expect(planRows(p)).toHaveCount(2);
    await expect(plan(p)).not.toContainText('Apoquel');
    await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Heute' }).click();
    await expect(main(p).locator('.today-row')).toHaveCount(2);
    await expect(main(p)).not.toContainText('Heute: Medikamente');
  });
});

test.describe('Abhaken: dieselbe Gabe überall', () => {
  test('im Tagesplan abhaken → unter Erinnerungen „gegeben von Ihnen“, und umgekehrt; Übersicht: Liste und Karte zeigen sofort denselben Stand', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const med = fake.seedMedication(luna, ahmed, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00', '20:00'], intake_hint: 'with_food' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    await planRow(p, '08:00').getByRole('button', { name: 'Meloxicam für Luna um 08:00 als gegeben abhaken' }).click();
    await expect(status(p, 'Meloxicam um 08:00 als gegeben abgehakt.')).toHaveCount(1);
    await expect(planRow(p, '08:00')).toContainText('gegeben von Ihnen um 08:30');
    const undo = planRow(p, '08:00').getByRole('button', { name: 'Gabe Meloxicam für Luna um 08:00 zurücknehmen' });
    await expect(undo).toBeFocused();
    expect(fake.db.medication_doses).toMatchObject([{ medication_id: med.id, scheduled_on: '2026-10-16', scheduled_time: '08:00:00', given_by: ahmed.id }]);
    // Erinnerungen (ohne Neuladen): gleicher Stand
    await viaMore(p, 'Erinnerungen');
    const list = todayMeds(p);
    await expect(list.locator('li').filter({ hasText: '08:00' })).toContainText('gegeben von Ihnen um 08:30');
    // umgekehrt: 20:00 unter Erinnerungen abhaken → im Tagesplan gegeben
    await list.getByRole('button', { name: 'Meloxicam für Luna um 20:00 als gegeben abhaken' }).click();
    await expect(list.locator('li').filter({ hasText: '20:00' })).toContainText('gegeben von Ihnen um 08:30');
    await toPlan(p);
    await expect(planRow(p, '20:00')).toContainText('gegeben von Ihnen um 08:30');
    // Rückgängig im Tagesplan
    await planRow(p, '20:00').getByRole('button', { name: 'Gabe Meloxicam für Luna um 20:00 zurücknehmen' }).click();
    await expect(planRow(p, '20:00')).toContainText('offen');
    expect(fake.db.medication_doses).toHaveLength(1);

    // Übersicht: „Als Nächstes“ berücksichtigt Medikamente; Abhaken in der Liste ändert sofort die Karte „Heute: Medikamente“
    fake.db.medication_doses!.splice(0);
    const o = await openAs(browser, fake, 'ahmed@test.invalid', '/');
    await expect(main(o).locator('.next-card')).toContainText('Meloxicam · 0,5 ml');
    await expect(main(o).locator('.today-row').locator('.time')).toHaveText(['07:00', '08:00', '12:00', '20:00']);
    await expect(todayMeds(o)).toContainText('08:00 · Luna · Meloxicam 0,5 ml');
    await main(o).getByRole('button', { name: 'Meloxicam · 0,5 ml um 08:00 als erledigt markieren' }).click();
    await expect(main(o).locator('.today-row').filter({ hasText: '08:00' })).toContainText('gegeben von Ihnen um 08:30');
    await expect(todayMeds(o)).toContainText('20:00 · Luna · Meloxicam 0,5 ml');
    await expect(main(o).locator('.next-card')).toContainText('Füttern');
    expect(fake.db.medication_doses).toHaveLength(1);
  });
});

test.describe('„Eintrag hinzufügen“ → Medikament', () => {
  test('vorhandenes Medikament wählen, Uhrzeit ändern → pet_medications.times geändert, kein neuer Tagesplan-Eintrag; doppelte Uhrzeit abgelehnt', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const med = fake.seedMedication(luna, ahmed, { name: 'Meloxicam', amount: 0.5, unit: 'ml', times: ['08:00', '20:00'] });
    fake.seedMedication(luna, ahmed, { name: 'Novalgin', frequency: 'as_needed', times: [] });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    await plan(p).getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await p.getByLabel('Woran sollen wir Sie erinnern?').selectOption('med');
    const c = chooser(p);
    await expect(c.getByRole('group', { name: 'Welches Medikament?' }).getByRole('radio')).toHaveCount(2);
    await expect(c.getByRole('textbox', { name: /Präparat/ })).toHaveCount(0); // kein Freitext
    await c.getByRole('radio', { name: /^Meloxicam – 0,5 ml · 2× täglich/ }).check();
    await expect(c.getByRole('textbox', { name: /^1\. Uhrzeit/ })).toHaveValue('08:00');
    await expect(c.getByRole('textbox', { name: /^2\. Uhrzeit/ })).toHaveValue('20:00');
    await c.getByRole('textbox', { name: /^2\. Uhrzeit/ }).fill('08:00');
    await c.getByRole('button', { name: 'Speichern' }).click();
    await expect(c).toContainText('Diese Uhrzeit ist schon eingetragen.');
    await expect(c.getByRole('textbox', { name: /^2\. Uhrzeit/ })).toBeFocused();
    await c.getByRole('textbox', { name: /^2\. Uhrzeit/ }).fill('19:00');
    await c.getByRole('button', { name: 'Weitere Uhrzeit' }).click();
    await c.getByRole('textbox', { name: /^3\. Uhrzeit/ }).fill('13:00');
    await c.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Uhrzeit für Meloxicam gespeichert. Sie steht jetzt im Tagesplan.')).toHaveCount(1);
    expect(fake.db.pet_medications!.find((m) => m.id === med.id)).toMatchObject({ times: ['08:00:00', '13:00:00', '19:00:00'], frequency: 'daily', remind: true });
    expect(fake.db.routine_items!.filter((r) => r.pet_id === luna.id)).toHaveLength(2);
    await expect(planRows(p).locator('.time')).toHaveText(['07:00', '08:00', '12:00', '13:00', '19:00']);
    await expect(plan(p).getByRole('button', { name: 'Eintrag hinzufügen' })).toBeFocused();

    // „bei Bedarf“ bekommt Uhrzeiten → täglich, mit Erinnerung, im Plan
    await plan(p).getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await p.getByLabel('Woran sollen wir Sie erinnern?').selectOption('med');
    await chooser(p).getByRole('radio', { name: /^Novalgin/ }).check();
    await expect(chooser(p).getByRole('textbox', { name: /^1\. Uhrzeit/ })).toHaveValue('08:00');
    await chooser(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Uhrzeit für Novalgin gespeichert.')).toHaveCount(1);
    expect(fake.db.pet_medications!.find((m) => m.name === 'Novalgin')).toMatchObject({ times: ['08:00:00'], frequency: 'daily', remind: true });
    await expect(planRow(p, 'Novalgin')).toHaveCount(1);
  });

  test('Praxis-Medikament: Hinweis statt Uhrzeiten; ohne Medikamente: Hinweis und nur „Neues Medikament eintragen“', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    await plan(p).getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await p.getByLabel('Woran sollen wir Sie erinnern?').selectOption('med');
    await expect(plan(p)).toContainText('Noch kein Medikament eingetragen.');
    await expect(plan(p).getByRole('button', { name: 'Neues Medikament eintragen' })).toBeVisible();
    await expect(plan(p).getByRole('button', { name: 'Speichern' })).toHaveCount(0);
    await expect(plan(p).getByRole('button', { name: 'Hinzufügen' })).toHaveCount(0);

    fake.seedMedication(luna, ahmed, { name: 'Wurmkur', source: 'practice', times: ['09:00'] });
    await p.reload(); await p.waitForLoadState('networkidle');
    await plan(p).getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await p.getByLabel('Woran sollen wir Sie erinnern?').selectOption('med');
    await chooser(p).getByRole('radio', { name: /^Wurmkur/ }).check();
    await expect(chooser(p)).toContainText('Uhrzeiten von Praxis-Medikamenten legt die Praxis fest.');
    await expect(chooser(p).getByLabel(/Uhrzeit/)).toHaveCount(0);
    await expect(chooser(p).getByRole('button', { name: 'Speichern' })).toHaveCount(0);
    await expect(chooser(p).getByRole('alert')).toHaveCount(0); // Hinweis, kein Fehler
  });

  test('„Neues Medikament eintragen“ aus dem Tagesplan → Formular → zurück im Plan, Eintrag sichtbar', async ({ browser }) => {
    const { fake, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    await plan(p).getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await p.getByLabel('Woran sollen wir Sie erinnern?').selectOption('med');
    await plan(p).getByRole('button', { name: 'Neues Medikament eintragen' }).click();
    const f = medForm(p);
    await expect(f.getByRole('textbox', { name: /^Präparat/ })).toBeFocused();
    await expect(f.getByRole('textbox', { name: /^Verordnet von/ })).toHaveValue('Tierarztpraxis am Ostpark');
    await fillMed(f, { name: 'Apoquel', amount: '1', times: ['18:00'] });
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Apoquel eingetragen und steht im Tagesplan.')).toHaveCount(1);
    await expect(p).toHaveURL(/\/alltag$/);
    await expect(planRow(p, '18:00')).toContainText('Apoquel · 1 Tablette');
    expect(fake.db.pet_medications).toMatchObject([{ pet_id: luna.id, name: 'Apoquel', times: ['18:00:00'], frequency: 'daily', remind: true }]);
    expect(fake.db.routine_items!.filter((r) => r.pet_id === luna.id)).toHaveLength(2);
  });
});

test.describe('Alte Medikamenten-Einträge im Tagesplan', () => {
  test('Hinweis + „Umwandeln“ → Formular vorausgefüllt (Menge Pflicht) → Medikament angelegt, alter Eintrag weg', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const old = fake.seedRoutine(luna, ahmed, { kind: 'med', time_of_day: '11:00', label: 'Apoquel' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    const r = planRow(p, '11:00');
    await expect(r).toContainText('Medikament geben');
    await expect(r).toContainText('Bitte als Medikament eintragen – dann erscheint es auch auf Notfallkarte und in der Gesundheitsakte.');
    // weiter änderbar und löschbar
    await expect(r.getByRole('switch', { name: 'Erinnerung für Medikament geben, 11:00' })).toBeVisible();
    await expect(r.getByRole('button', { name: 'Medikament geben, 11:00 löschen' })).toBeVisible();
    // kein automatisches Umwandeln
    expect(fake.db.pet_medications).toHaveLength(0);
    await r.getByRole('button', { name: 'Medikament geben, 11:00 in ein Medikament umwandeln' }).click();
    const f = medForm(p);
    await expect(f.getByRole('heading', { name: 'Als Medikament eintragen' })).toBeVisible();
    await expect(f.getByRole('textbox', { name: /^Präparat/ })).toHaveValue('Apoquel');
    await expect(f.getByLabel(/^1\. Gabe/)).toHaveValue('11:00');
    await expect(f.getByRole('textbox', { name: /^Menge pro Gabe/ })).toHaveValue('');
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toContainText('Bitte geben Sie die Menge als Zahl an, z. B. 1 oder 0,5.');
    expect(fake.db.routine_items!.some((x) => x.id === old.id)).toBe(true); // nicht gespeichert → nicht gelöscht
    await fillMed(f, { amount: '1' });
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Apoquel ist jetzt in der Medikation.')).toHaveCount(1);
    expect(fake.db.routine_items!.some((x) => x.id === old.id)).toBe(false);
    expect(fake.db.pet_medications).toMatchObject([{ pet_id: luna.id, name: 'Apoquel', amount: 1, times: ['11:00:00'], frequency: 'daily', source: 'owner' }]);
    await expect(planRow(p, '11:00')).toHaveCount(1);
    await expect(planRow(p, '11:00')).toContainText('Apoquel · 1 Tablette');
    await expect(planRow(p, '11:00').locator('.pill-med')).toHaveText('aus der Medikation');
    await expect(plan(p)).not.toContainText('Bitte als Medikament eintragen');
  });

  test('Speichern scheitert → alter Eintrag bleibt; die Datenbank lehnt neue „med“-Einträge ab (routine_use_medication)', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const old = fake.seedRoutine(luna, ahmed, { kind: 'med', time_of_day: '11:00', label: null });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/alltag');
    await planRow(p, '11:00').getByRole('button', { name: /umwandeln/ }).click();
    const f = medForm(p);
    await expect(f.getByRole('textbox', { name: /^Präparat/ })).toHaveValue('');
    await fillMed(f, { name: 'Apoquel', amount: '1' });
    fake.failNext.pet_medications = true;
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f.getByRole('alert')).toContainText('Das hat nicht geklappt.');
    expect(fake.db.routine_items!.some((x) => x.id === old.id)).toBe(true);
    expect(fake.db.pet_medications).toHaveLength(0);
    // direkt über die Schnittstelle: neu anlegen und umstellen abgelehnt, alter Eintrag bleibt änderbar
    const res = await p.evaluate(async ({ sb, pet, walk, med }) => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!;
      const token = (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
      const h = { apikey: 'sb_publishable_test', authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' };
      const ins = await fetch(`${sb}/rest/v1/routine_items`, { method: 'POST', headers: h, body: JSON.stringify({ pet_id: pet, kind: 'med', time_of_day: '15:00', repeat: 'daily' }) });
      const upd = await fetch(`${sb}/rest/v1/routine_items?id=eq.${walk}`, { method: 'PATCH', headers: h, body: JSON.stringify({ kind: 'med' }) });
      const keep = await fetch(`${sb}/rest/v1/routine_items?id=eq.${med}`, { method: 'PATCH', headers: h, body: JSON.stringify({ time_of_day: '11:30' }) });
      return { ins: { s: ins.status, b: (await ins.json()) as { code: string; message: string } }, upd: { s: upd.status, b: (await upd.json()) as { code: string; message: string } }, keep: keep.status };
    }, { sb: SB, pet: String(luna.id), walk: String(fake.db.routine_items!.find((x) => x.kind === 'walk')!.id), med: String(old.id) });
    expect(res.ins).toMatchObject({ s: 400, b: { code: '23514', message: 'routine_use_medication' } });
    expect(res.upd).toMatchObject({ s: 400, b: { code: '23514', message: 'routine_use_medication' } });
    expect(res.keep).toBe(200);
    expect(fake.db.routine_items!.find((x) => x.id === old.id)!.time_of_day).toBe('11:30:00');
    expect(fake.db.routine_items!.filter((x) => x.kind === 'med')).toHaveLength(1);
  });
});

test.describe('Benachrichtigungen', () => {
  test('Schalter „Tagesplan (Gassi, Füttern …)“ in der Reihenfolge Medikamente · Tagesplan · Erinnerungen · Termine; speichert routine', async ({ browser }) => {
    const { fake, ahmed } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen');
    const what = main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Was soll PetConnect melden?' }) });
    const names = ['Medikamente', 'Tagesplan (Gassi, Füttern …)', 'Erinnerungen', 'Termine (1 Stunde vorher)'];
    await expect(what.getByRole('switch')).toHaveCount(names.length);
    for (const [i, n] of names.entries()) await expect(what.getByRole('switch').nth(i)).toHaveAccessibleName(n);
    const sw = what.getByRole('switch', { name: 'Tagesplan (Gassi, Füttern …)' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(what.getByText('Gespeichert.')).toBeVisible();
    expect(fake.db.notification_prefs).toMatchObject([{ user_id: ahmed.id, medication: true, routine: false, reminders: true, appointments: true }]);
    await sw.click();
    await expect.poll(() => fake.db.notification_prefs![0]!.routine).toBe(true);
    await sw.click();
    await p.reload(); await p.waitForLoadState('networkidle');
    await expect(main(p).getByRole('switch', { name: 'Tagesplan (Gassi, Füttern …)' })).toHaveAttribute('aria-checked', 'false');
  });
});
