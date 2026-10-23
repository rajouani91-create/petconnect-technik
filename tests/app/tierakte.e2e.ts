import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeSupabase } from './fake-supabase';

/** Tierakte: Gewicht, Impfungen, Dokumente – mit simuliertem Supabase (Rechte wie in der Datenbank). */

const NOW = new Date('2026-10-16T10:00:00+02:00'); // Freitag
const PW = 'Testpasswort-123';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const JPG = path.join(HERE, 'luna.jpg');
const PDF = path.join(HERE, 'kein-bild.pdf');

const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url = '/tier'): Promise<Page> {
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
  const fake = new FakeSupabase();
  const ahmed = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  const kyra = fake.seedUser('kyra@test.invalid', PW, 'Kyra');
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog' });
  return { fake, ahmed, kyra, oma, luna };
}
const seedWeight = (fake: FakeSupabase, pet: { id?: unknown }, by: { id: string }, measured_on: string, kg: number) =>
  fake.db.weights!.push({ id: randomUUID(), pet_id: pet.id, owner_id: by.id, measured_on, kg, created_at: `${measured_on}T08:00:00.000Z` });
const seedVacc = (fake: FakeSupabase, pet: { id?: unknown }, by: { id: string }, name: string, given_on: string | null, valid_until: string | null, source = 'owner') =>
  fake.db.vaccinations!.push({ id: randomUUID(), pet_id: pet.id, owner_id: by.id, name, given_on, valid_until, source, created_at: NOW.toISOString() });
function seedDoc(fake: FakeSupabase, pet: { id?: unknown }, by: { id: string }, title: string, category: string, mime: string, doc_date: string | null = null) {
  const storage_path = `${String(pet.id)}/${randomUUID()}.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`;
  const bytes = mime === 'application/pdf' ? readFileSync(PDF) : readFileSync(JPG);
  fake.files.set(`pet-documents/${storage_path}`, { bytes, type: mime });
  const row = { id: randomUUID(), pet_id: pet.id, owner_id: by.id, title, category, doc_date, storage_path, mime_type: mime, size_bytes: bytes.length, created_at: NOW.toISOString() };
  fake.db.pet_documents!.push(row);
  return row;
}

const record = (p: Page) => p.locator('section').filter({ has: p.getByRole('heading', { name: 'Tierakte', level: 2 }) });
const tab = (p: Page, name: 'Gewicht' | 'Impfungen' | 'Dokumente') => record(p).getByRole('tab', { name });
const panel = (p: Page) => record(p).getByRole('tabpanel');
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });
const rows = (p: Page) => panel(p).locator('.record-row');

test.afterEach(async () => {
  for (const [page, list] of errors) {
    const real = list.filter((e) => !/Failed to load resource/.test(e));
    expect(real, `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  }
  errors.clear();
});

async function enterWeight(p: Page, kg: string, date?: string) {
  await panel(p).getByRole('button', { name: 'Gewicht eintragen' }).click();
  const form = panel(p).locator('form');
  if (date) await form.getByLabel('Datum').fill(date);
  await form.getByLabel('Gewicht (kg)').fill(kg);
  await form.getByRole('button', { name: 'Speichern' }).click();
  return form;
}

test.describe('Gewicht', () => {
  test('Leerer Zustand, eintragen → oben, ab 2 Werten Diagramm, Veränderung mit Vorzeichen', async ({ browser }) => {
    const { fake, ahmed } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await expect(tab(p, 'Gewicht')).toHaveAttribute('aria-selected', 'true');
    await expect(panel(p)).toContainText('Noch kein Gewicht eingetragen.');
    // Datum ist mit heute vorbelegt
    await panel(p).getByRole('button', { name: 'Gewicht eintragen' }).click();
    await expect(panel(p).getByLabel('Datum')).toHaveValue('2026-10-16');
    await expect(panel(p).getByLabel('Gewicht (kg)')).toBeFocused();
    await panel(p).getByLabel('Gewicht (kg)').fill('12,1');
    await panel(p).getByLabel('Datum').fill('2026-10-01');
    await panel(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Gewicht gespeichert: 12,1 kg am 01.10.2026.')).toHaveCount(1);
    expect(fake.db.weights).toHaveLength(1);
    expect(fake.db.weights![0]).toMatchObject({ kg: 12.1, measured_on: '2026-10-01', owner_id: ahmed.id });
    await expect(record(p).getByRole('img', { name: /Gewichtsverlauf/ })).toHaveCount(0);
    // Fokus zurück auf „Gewicht eintragen“
    await expect(panel(p).getByRole('button', { name: 'Gewicht eintragen' })).toBeFocused();
    // zweite Messung mit Punkt
    await enterWeight(p, '12.4');
    await expect(panel(p).locator('.weight-now-value')).toHaveText('12,4 kg');
    await expect(rows(p).first()).toContainText('16.10.2026');
    await expect(rows(p).first()).toContainText('+0,3 kg zur Messung davor');
    await expect(rows(p).nth(1)).not.toContainText('zur Messung davor');
    await expect(record(p).getByRole('img', { name: 'Gewichtsverlauf von 12,1 kg am 01.10.2026 bis 12,4 kg am 16.10.2026' })).toBeVisible();
    // dritte, ältere Messung: kommt nach unten, Abnahme mit echtem Minus
    await enterWeight(p, '12,6', '2026-09-01');
    await expect(rows(p)).toHaveCount(3);
    await expect(rows(p).nth(1)).toContainText('−0,5 kg zur Messung davor');
    expect(fake.db.weights).toHaveLength(3);
  });

  test('Ändern und Löschen (mit Dialog, Abbrechen behält)', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedWeight(fake, luna, ahmed, '2026-10-01', 12.1);
    seedWeight(fake, luna, ahmed, '2026-10-16', 12.4);
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await panel(p).getByRole('button', { name: 'Messung vom 16.10.2026 (12,4 kg) ändern' }).click();
    await expect(panel(p).getByLabel('Gewicht (kg)')).toHaveValue('12,4');
    await panel(p).getByLabel('Gewicht (kg)').fill('12,8');
    await panel(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Messung geändert: 12,8 kg am 16.10.2026.')).toHaveCount(1);
    expect(fake.db.weights!.find((w) => w.measured_on === '2026-10-16')!.kg).toBe(12.8);
    await expect(panel(p).getByRole('button', { name: 'Messung vom 16.10.2026 (12,8 kg) ändern' })).toBeFocused();
    // löschen: Abbrechen behält
    await panel(p).getByRole('button', { name: 'Messung vom 01.10.2026 (12,1 kg) löschen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Messung löschen?' });
    await expect(dlg).toContainText('Die Messung vom 01.10.2026 (12,1 kg) wirklich löschen?');
    await dlg.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dlg).toBeHidden();
    expect(fake.db.weights).toHaveLength(2);
    await panel(p).getByRole('button', { name: 'Messung vom 01.10.2026 (12,1 kg) löschen' }).click();
    await dlg.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect(status(p, 'Messung vom 01.10.2026 gelöscht.')).toHaveCount(1);
    await expect.poll(() => fake.db.weights!.length).toBe(1);
    await expect(rows(p)).toHaveCount(1);
    await expect(record(p).getByRole('img', { name: /Gewichtsverlauf/ })).toHaveCount(0);
  });

  test('Ungültige Eingaben: 0, 2000, Text, zu viele Stellen, Zukunftsdatum → Meldung am Feld, nichts gespeichert', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await panel(p).getByRole('button', { name: 'Gewicht eintragen' }).click();
    const kg = panel(p).getByLabel('Gewicht (kg)');
    const save = panel(p).getByRole('button', { name: 'Speichern' });
    const cases: [string, string][] = [
      ['', 'Bitte das Gewicht angeben.'],
      ['0', 'Das Gewicht muss größer als 0 und kleiner als 2000 kg sein.'],
      ['2000', 'Das Gewicht muss größer als 0 und kleiner als 2000 kg sein.'],
      ['-3', 'Bitte eine Zahl angeben, z. B. 12,4.'],
      ['zwölf', 'Bitte eine Zahl angeben, z. B. 12,4.'],
      ['12,345', 'Bitte höchstens 2 Nachkommastellen angeben.'],
    ];
    for (const [value, msg] of cases) {
      await kg.fill(value);
      await save.click();
      await expect(kg).toHaveAttribute('aria-invalid', 'true');
      const describedBy = (await kg.getAttribute('aria-describedby')) ?? '';
      await expect(p.locator(`[id="${describedBy.split(' ')[0]}"]`)).toHaveText(msg);
      await expect(kg).toBeFocused();
    }
    await kg.fill('12,4');
    await panel(p).getByLabel('Datum').fill('2026-10-17');
    await save.click();
    await expect(panel(p)).toContainText('Das Datum liegt in der Zukunft.');
    await expect(panel(p).getByLabel('Datum')).toHaveAttribute('aria-invalid', 'true');
    expect(fake.db.weights).toHaveLength(0);
    expect(fake.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/weights'))).toHaveLength(0);
  });
});

test.describe('Impfungen', () => {
  test('Eintragen mit und ohne Daten, Status-Texte, Sortierung nach Fälligkeit', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedVacc(fake, luna, ahmed, 'Leptospirose', '2025-11-01', '2026-11-15'); // genau 30 Tage → läuft bald ab
    seedVacc(fake, luna, ahmed, 'Zwingerhusten', '2025-09-01', '2026-09-01'); // abgelaufen
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Impfungen').click();
    await panel(p).getByRole('button', { name: 'Impfung eintragen' }).click();
    const form = panel(p).locator('form');
    await expect(form.getByRole('combobox', { name: 'Impfung', exact: true })).toBeFocused();
    // Vorschlagsliste
    const listId = await form.getByRole('combobox', { name: 'Impfung', exact: true }).getAttribute('list');
    await expect(p.locator(`datalist[id="${listId}"] option[value="Tollwut"]`)).toHaveCount(1);
    await expect(p.locator(`datalist[id="${listId}"] option`)).toHaveCount(9);
    await form.getByRole('combobox', { name: 'Impfung', exact: true }).fill('Tollwut');
    await form.getByLabel('Geimpft am').fill('2026-01-10');
    await form.getByLabel('Gültig bis').fill('2027-01-10');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Impfung gespeichert: Tollwut.')).toHaveCount(1);
    expect(fake.db.vaccinations!.find((v) => v.name === 'Tollwut')).toMatchObject({ given_on: '2026-01-10', valid_until: '2027-01-10', source: 'owner', owner_id: ahmed.id });
    // ohne Daten
    await panel(p).getByRole('button', { name: 'Impfung eintragen' }).click();
    await panel(p).getByRole('combobox', { name: 'Impfung', exact: true }).fill('Eigene Impfung XY');
    await panel(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Impfung gespeichert: Eigene Impfung XY.')).toHaveCount(1);
    expect(fake.db.vaccinations!.find((v) => v.name === 'Eigene Impfung XY')).toMatchObject({ given_on: null, valid_until: null });
    // Reihenfolge und Status (Text, nicht nur Farbe)
    await expect(rows(p)).toHaveCount(4);
    await expect(rows(p).nth(0)).toContainText('Zwingerhusten');
    await expect(rows(p).nth(0)).toContainText('abgelaufen');
    await expect(rows(p).nth(1)).toContainText('Leptospirose');
    await expect(rows(p).nth(1)).toContainText('läuft bald ab');
    await expect(rows(p).nth(2)).toContainText('Tollwut');
    await expect(rows(p).nth(2)).toContainText('gültig');
    await expect(rows(p).nth(2)).toContainText('geimpft am 10.01.2026 · gültig bis 10.01.2027');
    await expect(rows(p).nth(3)).toContainText('Eigene Impfung XY');
    await expect(rows(p).nth(3)).toContainText('ohne Datum');
    await expect(rows(p).nth(3).locator('.pill')).toHaveCount(0);
    await expect(panel(p)).toContainText('Die Angaben stammen von Ihnen und sind noch nicht tierärztlich geprüft.');
  });

  test('„Gültig bis“ vor „Geimpft am“, leerer Name und Zukunftsdatum → Fehler, nichts gespeichert; Ändern und Löschen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedVacc(fake, luna, ahmed, 'Staupe', '2026-03-01', '2027-03-01');
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Impfungen').click();
    await panel(p).getByRole('button', { name: 'Impfung eintragen' }).click();
    const form = panel(p).locator('form');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Bitte den Namen der Impfung angeben.');
    await form.getByRole('combobox', { name: 'Impfung', exact: true }).fill('Tollwut');
    await form.getByLabel('Geimpft am').fill('2026-05-10');
    await form.getByLabel('Gültig bis').fill('2026-05-09');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('„Gültig bis“ darf nicht vor „Geimpft am“ liegen.');
    await expect(form.getByLabel('Gültig bis')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Gültig bis')).toBeFocused();
    await form.getByLabel('Geimpft am').fill('2026-12-01');
    await form.getByLabel('Gültig bis').fill('');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Das Datum liegt in der Zukunft.');
    expect(fake.db.vaccinations).toHaveLength(1);
    await form.getByRole('button', { name: 'Abbrechen' }).click();
    // ändern
    await panel(p).getByRole('button', { name: 'Staupe ändern' }).click();
    await panel(p).getByLabel('Gültig bis').fill('2026-10-30');
    await panel(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Impfung geändert: Staupe.')).toHaveCount(1);
    await expect(rows(p).first()).toContainText('läuft bald ab');
    expect(fake.db.vaccinations![0]!.valid_until).toBe('2026-10-30');
    // löschen
    await panel(p).getByRole('button', { name: 'Staupe löschen' }).click();
    await p.getByRole('dialog', { name: 'Impfung löschen?' }).getByRole('button', { name: 'Ja, löschen' }).click();
    await expect.poll(() => fake.db.vaccinations!.length).toBe(0);
    await expect(panel(p)).toContainText('Noch keine Impfung eingetragen.');
  });

  test('Eintrag der Praxis: Hinweis, keine Knöpfe; die Datenbank lehnt Änderungen ab', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedVacc(fake, luna, ahmed, 'Tollwut', '2026-01-10', '2029-01-10', 'practice');
    seedVacc(fake, luna, ahmed, 'Staupe', null, null);
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Impfungen').click();
    const prac = rows(p).filter({ hasText: 'Tollwut' });
    await expect(prac).toContainText('von der Praxis eingetragen');
    await expect(prac.getByRole('button')).toHaveCount(0);
    await expect(rows(p).filter({ hasText: 'Staupe' }).getByRole('button')).toHaveCount(2);
    // auch direkt an der Datenbank vorbei bleibt der Praxis-Eintrag unverändert
    const id = fake.db.vaccinations!.find((v) => v.source === 'practice')!.id as string;
    const res = await p.evaluate(async (vid) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('sb-'))!;
      const token = (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
      const r = await fetch(`https://cpnbkegojxagbzkomzap.supabase.co/rest/v1/vaccinations?id=eq.${vid}`, {
        method: 'DELETE', headers: { apikey: 'x', authorization: `Bearer ${token}`, prefer: 'return=representation' },
      });
      return (await r.json()) as unknown[];
    }, id);
    expect(res).toEqual([]);
    expect(fake.db.vaccinations).toHaveLength(2);
  });
});

test.describe('Rechte', () => {
  test('Mithalterin trägt ein; Haupthalter sieht „eingetragen von Kyra“; Nur ansehen sieht alles ohne Knöpfe', async ({ browser }) => {
    const { fake, ahmed, kyra, oma, luna } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    fake.addMember(luna.id, oma, 'viewer');
    seedVacc(fake, luna, ahmed, 'Tollwut', '2026-01-10', '2027-01-10');
    seedDoc(fake, luna, ahmed, 'Impfpass Luna', 'vaccination', 'image/jpeg', '2026-01-10');
    const k = await openAs(browser, fake, 'kyra@test.invalid');
    await enterWeight(k, '13,2');
    await expect(status(k, 'Gewicht gespeichert: 13,2 kg am 16.10.2026.')).toHaveCount(1);
    expect(fake.db.weights![0]!.owner_id).toBe(kyra.id);
    await expect(rows(k).first()).not.toContainText('eingetragen von');

    const a = await openAs(browser, fake, 'ahmed@test.invalid');
    await expect(rows(a).first()).toContainText('eingetragen von Kyra');

    const o = await openAs(browser, fake, 'oma@test.invalid');
    await expect(record(o)).toContainText('Sie können die Tierakte ansehen, aber nicht ändern.');
    await expect(panel(o).locator('.weight-now-value')).toHaveText('13,2 kg');
    await expect(panel(o).getByRole('button')).toHaveCount(0);
    await tab(o, 'Impfungen').click();
    await expect(rows(o)).toContainText('Tollwut');
    await expect(panel(o).getByRole('button')).toHaveCount(0);
    await tab(o, 'Dokumente').click();
    await expect(rows(o)).toContainText('Impfpass Luna');
    await expect(panel(o).getByRole('button')).toHaveCount(1);
    await expect(panel(o).getByRole('button', { name: 'Impfpass Luna öffnen' })).toBeVisible();
    await expect(panel(o).locator('input[type="file"]')).toHaveCount(0);
    // Öffnen geht auch für Nur ansehen
    const [popup] = await Promise.all([o.waitForEvent('popup'), panel(o).getByRole('button', { name: 'Impfpass Luna öffnen' }).click()]);
    await popup.waitForURL(/\/storage\/v1\/object\/sign\/pet-documents\//);
    await popup.close();
  });
});

test.describe('Dokumente', () => {
  test('PDF und Bild hochladen, Liste, Filter, umbenennen, löschen, Öffnen mit signierter URL', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Dokumente').click();
    await expect(panel(p)).toContainText('Noch keine Dokumente abgelegt.');
    await expect(panel(p)).toContainText('Dokumente sind nur für Personen sichtbar, die dieses Tier mitbetreuen.');

    // PDF
    await panel(p).getByRole('button', { name: 'Dokument hinzufügen' }).click();
    const form = panel(p).locator('form');
    await expect(form.getByLabel('Datei')).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/webp');
    await form.getByLabel('Datei').setInputFiles(PDF);
    await expect(form.getByLabel('Bezeichnung')).toHaveValue('kein-bild');
    await form.getByLabel('Bezeichnung').fill('Befund Ohr');
    await form.getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Befund' });
    await form.getByLabel('Datum des Dokuments').fill('2026-10-02');
    await form.getByRole('button', { name: 'Hochladen' }).click();
    await expect(status(p, 'Dokument gespeichert: Befund Ohr.')).toHaveCount(1);
    expect(fake.db.pet_documents).toHaveLength(1);
    const pdf = fake.db.pet_documents![0]!;
    expect(pdf).toMatchObject({ title: 'Befund Ohr', category: 'finding', doc_date: '2026-10-02', mime_type: 'application/pdf', owner_id: ahmed.id });
    expect(String(pdf.storage_path)).toMatch(new RegExp(`^${String(luna.id)}/[0-9a-f-]{36}\\.pdf$`));
    expect(fake.files.get(`pet-documents/${pdf.storage_path}`)?.type).toBe('application/pdf');
    expect(pdf.size_bytes).toBe(readFileSync(PDF).length);
    // Datei zuerst, dann Zeile
    const upIdx = fake.calls.findIndex((c) => c.method === 'POST' && c.path.startsWith('/storage/v1/object/pet-documents/'));
    const rowIdx = fake.calls.findIndex((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/pet_documents'));
    expect(upIdx).toBeGreaterThan(-1);
    expect(rowIdx).toBeGreaterThan(upIdx);
    await expect(rows(p).first()).toContainText('Befund Ohr');
    await expect(rows(p).first()).toContainText('Befund · 02.10.2026 · PDF, 1 KB');

    // Bild
    await panel(p).getByRole('button', { name: 'Dokument hinzufügen' }).click();
    await panel(p).getByLabel('Datei').setInputFiles(JPG);
    await expect(panel(p).getByLabel('Bezeichnung')).toHaveValue('luna');
    await panel(p).getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Impfpass' });
    await panel(p).getByRole('button', { name: 'Hochladen' }).click();
    await expect(status(p, 'Dokument gespeichert: luna.')).toHaveCount(1);
    await expect(rows(p)).toHaveCount(2);
    // ohne Datum zählt das Hochladedatum (heute) → oben
    await expect(rows(p).first()).toContainText('luna');
    await expect(rows(p).first()).toContainText('Impfpass · JPEG, 72 KB');
    await expect(rows(p).first().locator('img.doc-thumb')).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/pet-documents\/.+token=/);

    // Filter
    await panel(p).getByLabel('Kategorie anzeigen').selectOption({ label: 'Befund' });
    await expect(rows(p)).toHaveCount(1);
    await expect(rows(p)).toContainText('Befund Ohr');
    await panel(p).getByLabel('Kategorie anzeigen').selectOption({ label: 'Rechnung' });
    await expect(panel(p)).toContainText('Keine Dokumente in dieser Kategorie.');
    await panel(p).getByLabel('Kategorie anzeigen').selectOption({ label: 'Alle' });
    await expect(rows(p)).toHaveCount(2);

    // Öffnen: signierte URL (60 s) in neuem Tab, nie öffentlich
    // PDFs lädt Chromium ohne Oberfläche herunter statt sie anzuzeigen; daher die Anfrage des neuen Tabs prüfen
    const [popup, req] = await Promise.all([
      p.waitForEvent('popup'),
      p.context().waitForEvent('request', (r) => /\/storage\/v1\/object\/sign\/pet-documents\/.+\.pdf\?token=/.test(r.url())),
      panel(p).getByRole('button', { name: 'Befund Ohr öffnen' }).click(),
    ]);
    expect(req.frame().page()).toBe(popup);
    await popup.close();
    expect(fake.calls.some((c) => c.method === 'POST' && c.path === `/storage/v1/object/sign/pet-documents/${String(pdf.storage_path)}`)).toBe(true);
    expect(fake.calls.some((c) => c.path.includes('/object/public/'))).toBe(false);

    // Umbenennen
    await panel(p).getByRole('button', { name: 'Befund Ohr umbenennen' }).click();
    await expect(panel(p).getByLabel('Bezeichnung')).toBeFocused();
    await panel(p).getByLabel('Bezeichnung').fill('Befund Ohr links');
    await panel(p).getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Rechnung' });
    await panel(p).getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Dokument geändert: Befund Ohr links.')).toHaveCount(1);
    expect(fake.db.pet_documents!.find((d) => d.id === pdf.id)).toMatchObject({ title: 'Befund Ohr links', category: 'invoice', storage_path: pdf.storage_path });
    await expect(panel(p).getByRole('button', { name: 'Befund Ohr links umbenennen' })).toBeFocused();

    // Löschen: Zeile und Datei weg
    await panel(p).getByRole('button', { name: 'Befund Ohr links löschen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Dokument löschen?' });
    await dlg.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect(status(p, 'Dokument gelöscht: Befund Ohr links.')).toHaveCount(1);
    await expect.poll(() => fake.db.pet_documents!.length).toBe(1);
    await expect.poll(() => fake.files.has(`pet-documents/${String(pdf.storage_path)}`)).toBe(false);
    await expect(rows(p)).toHaveCount(1);
  });

  test('Zu groß (> 10 MB), falscher Typ, ohne Datei, Zukunftsdatum → Meldung, nichts gespeichert', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Dokumente').click();
    await panel(p).getByRole('button', { name: 'Dokument hinzufügen' }).click();
    const file = panel(p).getByLabel('Datei');
    await file.setInputFiles({ name: 'riesig.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1) });
    await expect(panel(p)).toContainText('Die Datei ist größer als 10 MB. Bitte wählen Sie eine kleinere Datei.');
    await expect(file).toHaveAttribute('aria-invalid', 'true');
    await file.setInputFiles({ name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('Hallo') });
    await expect(panel(p)).toContainText('Diese Datei kann nicht abgelegt werden. Erlaubt sind PDF, JPEG, PNG und WebP.');
    await panel(p).getByLabel('Bezeichnung').fill('Test');
    await panel(p).getByRole('button', { name: 'Hochladen' }).click();
    await expect(file).toBeFocused();
    // gültige Datei, aber Zukunftsdatum
    await file.setInputFiles(PDF);
    await panel(p).getByLabel('Datum des Dokuments').fill('2026-12-24');
    await panel(p).getByRole('button', { name: 'Hochladen' }).click();
    await expect(panel(p)).toContainText('Das Datum liegt in der Zukunft.');
    expect(fake.db.pet_documents).toHaveLength(0);
    expect(fake.files.size).toBe(0);
    expect(fake.calls.filter((c) => c.path.startsWith('/storage/v1/object/pet-documents/'))).toHaveLength(0);
  });

  test('Scheitert die Zeile, wird die hochgeladene Datei wieder gelöscht', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Dokumente').click();
    await panel(p).getByRole('button', { name: 'Dokument hinzufügen' }).click();
    await panel(p).getByLabel('Datei').setInputFiles(PDF);
    fake.failNext.pet_documents = true;
    errors.get(p)!.length = 0;
    await panel(p).getByRole('button', { name: 'Hochladen' }).click();
    await expect(panel(p).getByRole('alert')).toHaveText('Das hat nicht geklappt. Bitte versuchen Sie es erneut.');
    expect(fake.db.pet_documents).toHaveLength(0);
    await expect.poll(() => fake.files.size).toBe(0);
    expect(fake.calls.some((c) => c.method === 'DELETE' && c.path.startsWith('/storage/v1/object/pet-documents'))).toBe(true);
    // erwarteter Fehler in der Konsole (ohne Pfad), danach keine weiteren
    const logged = errors.get(p)!.splice(0);
    expect(logged.join('\n')).not.toMatch(/[0-9a-f-]{36}\.pdf/);
  });
});

test.describe('Leere Zustände und Tastatur', () => {
  test('Alle drei Bereiche leer', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await expect(panel(p)).toContainText('Noch kein Gewicht eingetragen.');
    await tab(p, 'Impfungen').click();
    await expect(panel(p)).toContainText('Noch keine Impfung eingetragen.');
    await tab(p, 'Dokumente').click();
    await expect(panel(p)).toContainText('Noch keine Dokumente abgelegt.');
  });

  test('Nur mit der Tastatur: Reiter wechseln, Gewicht eintragen, Löschdialog bedienen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedWeight(fake, luna, ahmed, '2026-10-01', 9.5);
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await tab(p, 'Gewicht').focus();
    await p.keyboard.press('ArrowRight');
    await expect(tab(p, 'Impfungen')).toBeFocused();
    await expect(tab(p, 'Impfungen')).toHaveAttribute('aria-selected', 'true');
    await p.keyboard.press('End');
    await expect(tab(p, 'Dokumente')).toBeFocused();
    await p.keyboard.press('Home');
    await expect(tab(p, 'Gewicht')).toBeFocused();
    // Reiter lädt seine Daten neu: erst weiter, wenn die Messung da ist (sonst springt Tab am Ladekreis vorbei)
    await expect(rows(p)).toHaveCount(1);
    // Gewicht eintragen
    await p.keyboard.press('Tab');
    await expect(panel(p).getByRole('button', { name: 'Gewicht eintragen' })).toBeFocused();
    await p.keyboard.press('Enter');
    await expect(panel(p).getByLabel('Gewicht (kg)')).toBeFocused();
    await p.keyboard.type('9,8');
    await p.keyboard.press('Enter');
    await expect(status(p, 'Gewicht gespeichert: 9,8 kg am 16.10.2026.')).toHaveCount(1);
    expect(fake.db.weights).toHaveLength(2);
    // Löschdialog: Escape schließt, Enter auf „Ja, löschen“ löscht
    const del = panel(p).getByRole('button', { name: 'Messung vom 01.10.2026 (9,5 kg) löschen' });
    await del.focus();
    await p.keyboard.press('Enter');
    const dlg = p.getByRole('dialog', { name: 'Messung löschen?' });
    await expect(dlg).toBeVisible();
    await p.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(del).toBeFocused();
    expect(fake.db.weights).toHaveLength(2);
    await p.keyboard.press('Enter');
    await expect(dlg.getByRole('button', { name: 'Abbrechen' })).toBeFocused();
    await p.keyboard.press('Tab');
    await expect(dlg.getByRole('button', { name: 'Ja, löschen' })).toBeFocused();
    await p.keyboard.press('Enter');
    await expect.poll(() => fake.db.weights!.length).toBe(1);
  });
});

test.describe('Darstellung', () => {
  test('320 px ohne seitliches Scrollen, Bedienelemente der Tierakte mindestens 44 px', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedWeight(fake, luna, ahmed, '2026-10-01', 12.1);
    seedWeight(fake, luna, ahmed, '2026-10-16', 12.4);
    seedVacc(fake, luna, ahmed, 'Katzenschnupfen und ein sehr langer Name für die Impfung', '2026-01-10', '2026-10-20');
    seedDoc(fake, luna, ahmed, 'Rechnung der Tierklinik mit einem sehr langen Titel ohne Ende in Sicht', 'invoice', 'application/pdf', '2026-10-01');
    const p = await openAs(browser, fake, 'ahmed@test.invalid');
    await p.setViewportSize({ width: 320, height: 800 });
    const small = async (scope: Locator) =>
      scope.evaluate((root) =>
        [...root.querySelectorAll('button, a, input, select')]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 44 || r.w < 44),
      );
    for (const name of ['Gewicht', 'Impfungen', 'Dokumente'] as const) {
      await tab(p, name).click();
      await expect(rows(p).first()).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(320);
      expect(await small(record(p)), name).toEqual([]);
    }
  });
});
