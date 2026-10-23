import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeSupabase } from './fake-supabase';

/** „Mehr zu {Tier}“: Notfallkarte, Versicherung, Betreuung (Sitter-Link ohne Anmeldung), Gesundheitsakte. */

const NOW = new Date('2026-10-16T10:00:00+02:00'); // Freitag
const PW = 'Testpasswort-123';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.join(HERE, 'kein-bild.pdf');

const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function newPage(browser: Browser, fake: FakeSupabase, width = 412): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width, height: 915 }, isMobile: true, hasTouch: true });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.clock.setFixedTime(NOW);
  return page;
}
async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string, width = 412): Promise<Page> {
  const page = await newPage(browser, fake, width);
  await page.goto('/login');
  // Einführung vor der Anmeldung überspringen (falls sichtbar)
  await page.getByRole('button', { name: 'Jetzt anmelden' }).click({ timeout: 2000 }).catch(() => {});
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
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog', breed: 'Labrador', chip_no: '276098106015337', allergies: 'Huhn', medications: 'Apoquel 16 mg morgens' });
  return { fake, ahmed, kyra, oma, luna };
}
type Pet = { id?: unknown };
const id = (p: Pet) => String(p.id);
const main = (p: Page) => p.locator('#main');
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });

function seedInsurance(fake: FakeSupabase, pet: Pet, by: { id: string }, extra: Record<string, unknown> = {}) {
  const row = { id: randomUUID(), pet_id: pet.id, owner_id: by.id, insurer: 'Tierkasse Muster', policy_no: 'TK-123', holder_name: 'Ahmed', deductible: 150, reimbursement_pct: 80, submission: 'portal', note: null, created_at: NOW.toISOString(), ...extra };
  fake.db.pet_insurances!.push(row);
  return row;
}
function seedSitter(fake: FakeSupabase, pet: Pet, by: { id: string }, valid_from: string, valid_to: string, extra: Record<string, unknown> = {}) {
  const row = { id: randomUUID(), pet_id: pet.id, owner_id: by.id, sitter_name: 'Lea', valid_from, valid_to, feeding: '2× täglich 200 g Trockenfutter', care_notes: 'Apoquel morgens mit Futter', token: (randomUUID() + randomUUID()).replace(/-/g, ''), revoked_at: null, created_at: NOW.toISOString(), ...extra };
  fake.db.sitter_access!.push(row);
  return row;
}
function seedDoc(fake: FakeSupabase, pet: Pet, by: { id: string }, title: string, category = 'invoice') {
  const storage_path = `${id(pet)}/${randomUUID()}.pdf`;
  fake.files.set(`pet-documents/${storage_path}`, { bytes: readFileSync(PDF), type: 'application/pdf' });
  const row = { id: randomUUID(), pet_id: pet.id, owner_id: by.id, title, category, doc_date: '2026-10-02', storage_path, mime_type: 'application/pdf', size_bytes: 13, created_at: NOW.toISOString() };
  fake.db.pet_documents!.push(row);
  return row;
}

test.afterEach(async () => {
  for (const [page, list] of errors) {
    const real = list.filter((e) => !/Failed to load resource/.test(e));
    expect(real, `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  }
  errors.clear();
});

test.describe('Mehr zu … und Notfallkarte', () => {
  test('Karte „Mehr zu Luna“ mit fünf Knöpfen; Notfallkarte anzeigen, bearbeiten, tel:-Links, Druckansicht ohne Navigation', async ({ browser }) => {
    const { fake, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    const more = main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Mehr zu Luna' }) });
    await expect(more.getByRole('link')).toHaveText(['Notfallkarte', 'Versicherung', 'Betreuung', 'Gesundheitsakte (PDF)', 'Gewicht & Verlauf']);
    await expect(main(p)).not.toContainText('Gesundheitsbereiche');
    await expect(main(p)).not.toContainText('Teilen & Freigaben');
    // Gewicht & Verlauf springt zum Reiter
    await main(p).getByRole('tab', { name: 'Dokumente' }).click();
    await more.getByRole('link', { name: 'Gewicht & Verlauf' }).click();
    await expect(main(p).getByRole('tab', { name: 'Gewicht' })).toHaveAttribute('aria-selected', 'true');
    await expect(main(p).getByRole('tab', { name: 'Gewicht' })).toBeFocused();

    await more.getByRole('link', { name: 'Notfallkarte' }).click();
    await expect(p).toHaveURL(new RegExp(`/tier/${id(luna)}/notfallkarte$`));
    await expect(p.getByRole('heading', { name: 'Notfallkarte für Luna', level: 1 })).toBeVisible();
    await expect(main(p)).toContainText('Das Wichtigste für den Notfall, auf einen Blick');
    await expect(main(p)).toContainText('Labrador');
    await expect(main(p)).toContainText('276098106015337');
    await expect(main(p)).toContainText('Huhn');
    await expect(main(p)).toContainText('Apoquel 16 mg morgens');
    await expect(main(p)).toContainText('Nichts eingetragen');
    await expect(main(p)).toContainText('Noch keine Stammpraxis eingetragen.');
    await expect(main(p)).toContainText('Rufen Sie vorher in der Klinik an, damit sie sich vorbereiten kann.');
    await expect(main(p)).toContainText('Allgemeine Hinweise, sie ersetzen keine tierärztliche Beratung.');
    await expect(main(p).getByRole('link', { name: 'Zurück zur Tierakte' })).toHaveAttribute('href', '/tier');

    await main(p).getByRole('button', { name: 'Bearbeiten' }).click();
    const form = p.getByRole('form', { name: 'Notfallkarte bearbeiten' });
    await expect(form.getByLabel('Telefon Halter:in')).toBeFocused();
    await form.getByLabel('Telefon Halter:in').fill('0170 1234567');
    await form.getByLabel(/^Stammpraxis/).fill('Tierarztpraxis am Park');
    await form.getByLabel('Telefon Stammpraxis').fill('06142 / 12 34-56');
    await form.getByLabel('Transponder').fill('276 098 1');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Die Transpondernummer hat 15 Ziffern.');
    await expect(form.getByLabel('Transponder')).toBeFocused();
    await form.getByLabel('Transponder').fill('276 098 106 015 337');
    await form.getByLabel(/^Notfallkontakt/).fill('Nachbarin Frau Kaya, 0171 7654321');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Gespeichert.')).toHaveCount(1);
    expect(fake.db.pets!.find((x) => x.id === luna.id)).toMatchObject({ owner_phone: '0170 1234567', vet_name: 'Tierarztpraxis am Park', vet_phone: '06142 / 12 34-56', chip_no: '276098106015337', emergency_contact: 'Nachbarin Frau Kaya, 0171 7654321' });
    await expect(main(p).getByRole('link', { name: 'Stammpraxis anrufen' })).toHaveAttribute('href', 'tel:06142123456');
    await expect(main(p).getByRole('link', { name: '0170 1234567' })).toHaveAttribute('href', 'tel:01701234567');
    await expect(main(p).getByRole('button', { name: 'Bearbeiten' })).toBeFocused();

    // Druckansicht: keine Navigation, keine Knöpfe, schwarz auf weiß
    await p.emulateMedia({ media: 'print' });
    await expect(p.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();
    await expect(p.locator('.topbar')).toBeHidden();
    await expect(main(p).getByRole('button', { name: 'Karte drucken' })).toBeHidden();
    await expect(main(p).getByRole('heading', { name: 'Notfallkarte für Luna' })).toBeVisible();
    expect(await p.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
    await p.emulateMedia({ media: 'screen' });
  });

  test('Notfall-Knopf auf der Übersicht: ein Tier direkt, mehrere Tiere erst wählen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/');
    await main(p).getByRole('button', { name: 'Notfall', exact: true }).click();
    await expect(p).toHaveURL(new RegExp(`/tier/${id(luna)}/notfallkarte$`));
    const mio = fake.seedPet(ahmed, { name: 'Mio', species: 'cat' });
    await p.goto('/'); await p.waitForLoadState('networkidle');
    await main(p).getByRole('button', { name: 'Notfall', exact: true }).click();
    const dlg = p.getByRole('dialog', { name: 'Für welches Tier?' });
    await dlg.getByRole('link', { name: 'Notfallkarte für Mio' }).click();
    await expect(p).toHaveURL(new RegExp(`/tier/${id(mio)}/notfallkarte$`));
    await expect(p.getByRole('heading', { name: 'Notfallkarte für Mio' })).toBeVisible();
  });
});

test.describe('Versicherung', () => {
  test('Anlegen (Pflichtfelder), ändern; Einreichung mit Status, Schätzung, Summen; Dokument verknüpfen und öffnen; löschen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const doc = seedDoc(fake, luna, ahmed, 'Rechnung Ohr');
    seedDoc(fake, luna, ahmed, 'Impfpass', 'vaccination');
    const p = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${id(luna)}/versicherung`);
    await expect(main(p)).toContainText('Noch keine Versicherung eingetragen.');
    await p.getByRole('button', { name: 'Versicherung hinzufügen' }).click();
    const form = p.getByRole('form', { name: 'Versicherung hinzufügen' });
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Bitte die Versicherung angeben.');
    await expect(form).toContainText('Bitte die Versicherungsnummer angeben.');
    await form.getByRole('textbox', { name: 'Versicherung', exact: true }).fill('Tierkasse Muster');
    await form.getByLabel('Versicherungsnummer').fill('TK-4711');
    await form.getByLabel('Selbstbeteiligung (€)').fill('150');
    await form.getByLabel('Erstattungsquote (%)').fill('120');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form).toContainText('Bitte eine ganze Zahl von 0 bis 100 angeben.');
    expect(fake.db.pet_insurances).toHaveLength(0);
    await form.getByLabel('Erstattungsquote (%)').fill('80');
    await form.getByLabel('Einreichungsweg').selectOption({ label: 'Online-Portal' });
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Versicherung gespeichert: Tierkasse Muster.')).toHaveCount(1);
    expect(fake.db.pet_insurances![0]).toMatchObject({ insurer: 'Tierkasse Muster', policy_no: 'TK-4711', deductible: 150, reimbursement_pct: 80, submission: 'portal' });
    const card = main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Tierkasse Muster' }) });
    await expect(card).toContainText('150,00 €');
    await expect(card).toContainText('80 %');
    await expect(card).toContainText('Online-Portal');

    // Einreichung
    await card.getByRole('button', { name: 'Einreichung hinzufügen' }).click();
    const cf = p.getByRole('form', { name: 'Einreichung hinzufügen' });
    await cf.getByLabel('Bezeichnung').fill('Ohrentzündung');
    await cf.getByLabel('Rechnungsbetrag (€)').fill('1.234,50');
    await expect(cf).toContainText('Unverbindliche Schätzung: ca. 987,60 € Erstattung (ohne Selbstbeteiligung gerechnet). Die Versicherung entscheidet verbindlich.');
    await cf.getByLabel('Erstatteter Betrag (€)').fill('2000');
    await cf.getByRole('button', { name: 'Speichern' }).click();
    await expect(cf).toContainText('Der erstattete Betrag darf nicht höher sein als der Rechnungsbetrag.');
    await cf.getByLabel('Erstatteter Betrag (€)').fill('');
    await cf.getByLabel('Status').selectOption({ label: 'eingereicht' });
    const docSel = cf.getByLabel('Verknüpftes Dokument');
    await expect(docSel.locator('option').nth(1)).toHaveText('Rechnung Ohr (02.10.2026)');
    await docSel.selectOption({ label: 'Rechnung Ohr (02.10.2026)' });
    await expect(cf).toContainText('Den Status tragen Sie selbst ein. Er ist nicht von der Versicherung bestätigt.');
    await cf.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Einreichung gespeichert: Ohrentzündung.')).toHaveCount(1);
    expect(fake.db.insurance_claims![0]).toMatchObject({ title: 'Ohrentzündung', amount: 1234.5, status: 'submitted', document_id: doc.id, claim_date: '2026-10-16' });
    const row = card.locator('.record-row').filter({ hasText: 'Ohrentzündung' });
    await expect(row).toContainText('eingereicht');
    await expect(row).toContainText('16.10.2026 · Rechnung 1.234,50 €');
    await expect(row).toContainText('ca. 987,60 €');
    await expect(card.locator('.claim-sums')).toContainText('Eingereicht gesamt1.234,50 €');
    await expect(card.locator('.claim-sums')).toContainText('Erstattet gesamt0,00 €');
    await expect(card.locator('.claim-sums')).toContainText('Offen (noch nicht entschieden)1.234,50 €');

    // Dokument öffnen über signierte URL
    const [popup, req] = await Promise.all([
      p.waitForEvent('popup'),
      p.context().waitForEvent('request', (r) => /\/storage\/v1\/object\/sign\/pet-documents\/.+\.pdf\?token=/.test(r.url())),
      row.getByRole('button', { name: 'Rechnung Ohr öffnen' }).click(),
    ]);
    expect(req.frame().page()).toBe(popup);
    await popup.close();

    // ändern: teilweise erstattet
    await row.getByRole('button', { name: 'Ohrentzündung ändern' }).click();
    const ef = p.getByRole('form', { name: 'Einreichung ändern' });
    await expect(ef.getByLabel('Rechnungsbetrag (€)')).toHaveValue('1234,50');
    await ef.getByLabel('Status').selectOption({ label: 'teilweise erstattet' });
    await ef.getByLabel('Erstatteter Betrag (€)').fill('800');
    await ef.getByRole('button', { name: 'Speichern' }).click();
    await expect(status(p, 'Einreichung geändert: Ohrentzündung.')).toHaveCount(1);
    await expect(card.locator('.claim-sums')).toContainText('Erstattet gesamt800,00 €');
    await expect(card.locator('.claim-sums')).toContainText('Offen (noch nicht entschieden)0,00 €');

    // Versicherung ändern
    await card.getByRole('button', { name: 'Tierkasse Muster ändern' }).click();
    await p.getByRole('form', { name: 'Versicherung ändern' }).getByLabel('Versicherungsnummer').fill('TK-4712');
    await p.getByRole('form', { name: 'Versicherung ändern' }).getByRole('button', { name: 'Speichern' }).click();
    await expect.poll(() => fake.db.pet_insurances![0]!.policy_no).toBe('TK-4712');

    // Einreichung löschen, dann Versicherung entfernen
    await row.getByRole('button', { name: 'Ohrentzündung löschen' }).click();
    await p.getByRole('dialog', { name: 'Einreichung löschen?' }).getByRole('button', { name: 'Ja, löschen' }).click();
    await expect.poll(() => fake.db.insurance_claims!.length).toBe(0);
    await card.getByRole('button', { name: 'Tierkasse Muster entfernen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Versicherung entfernen?' });
    await expect(dlg).toContainText('„Tierkasse Muster“ mit allen Einreichungen wirklich entfernen?');
    await dlg.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect.poll(() => fake.db.pet_insurances!.length).toBe(0);
    await expect(main(p)).toContainText('Noch keine Versicherung eingetragen.');
  });

  test('Tastatur: Versicherung anlegen und Löschdialog bedienen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedInsurance(fake, luna, ahmed, { insurer: 'Alte Versicherung' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${id(luna)}/versicherung`);
    await p.getByRole('button', { name: 'Versicherung hinzufügen' }).focus();
    await p.keyboard.press('Enter');
    const form = p.getByRole('form', { name: 'Versicherung hinzufügen' });
    await expect(form.getByRole('textbox', { name: 'Versicherung', exact: true })).toBeFocused();
    await p.keyboard.type('Neue Versicherung');
    await p.keyboard.press('Tab');
    await expect(form.getByLabel('Versicherungsnummer')).toBeFocused();
    await p.keyboard.type('NV-1');
    await p.keyboard.press('Enter');
    await expect(status(p, 'Versicherung gespeichert: Neue Versicherung.')).toHaveCount(1);
    await expect(p.getByRole('button', { name: 'Versicherung hinzufügen' })).toBeFocused();
    const del = p.getByRole('button', { name: 'Alte Versicherung entfernen' });
    await del.focus();
    await p.keyboard.press('Enter');
    const dlg = p.getByRole('dialog', { name: 'Versicherung entfernen?' });
    await expect(dlg.getByRole('button', { name: 'Abbrechen' })).toBeFocused();
    await p.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(del).toBeFocused();
    await p.keyboard.press('Enter');
    await p.keyboard.press('Tab');
    await expect(dlg.getByRole('button', { name: 'Ja, löschen' })).toBeFocused();
    await p.keyboard.press('Enter');
    await expect.poll(() => fake.db.pet_insurances!.map((i) => i.insurer)).toEqual(['Neue Versicherung']);
  });
});

test.describe('Betreuung', () => {
  test('Sitter-Zugang: Fehlerfälle, anlegen, Link und QR-Code, widerrufen, löschen; Verweis auf Familie', async ({ browser }) => {
    const { fake, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${id(luna)}/betreuung`);
    await expect(p.getByRole('heading', { name: 'Betreuung durch Sitter und Familie' })).toBeVisible();
    await expect(main(p)).toContainText('Geben Sie Sitter oder Vertretung zeitlich begrenzten Zugriff auf das Nötigste.');
    await expect(main(p)).toContainText('Sichtbar: Fütterung, Pflege, Medikamente, Notfallkarte und Praxis-Kontakt.');
    await expect(main(p)).toContainText('Nicht sichtbar: Rechnungen, Versicherung, Dokumente und persönliche Notizen.');
    await expect(main(p).getByRole('link', { name: 'Zu Familie & Mithalter:innen' })).toHaveAttribute('href', '/mehr#familie');

    await p.getByRole('button', { name: 'Sitter-Zugang erstellen' }).click();
    const form = p.getByRole('form', { name: 'Sitter-Zugang erstellen' });
    await expect(form.getByLabel('Von')).toHaveValue('2026-10-16');
    await expect(form.getByLabel('Bis')).toHaveValue('2026-10-23');
    await form.getByRole('button', { name: 'Zugang erstellen' }).click();
    await expect(form).toContainText('Bitte Name und Zeitraum angeben.');
    await expect(form.getByLabel('Name der Betreuungsperson')).toBeFocused();
    await form.getByLabel('Name der Betreuungsperson').fill('Lea');
    await form.getByLabel('Bis').fill('2026-10-15');
    await form.getByRole('button', { name: 'Zugang erstellen' }).click();
    await expect(form).toContainText('Das Enddatum muss nach dem Startdatum liegen.');
    await form.getByLabel('Bis').fill('2027-01-17');
    await form.getByRole('button', { name: 'Zugang erstellen' }).click();
    await expect(form).toContainText('Der Zeitraum darf höchstens 92 Tage lang sein.');
    expect(fake.db.sitter_access).toHaveLength(0);
    await form.getByLabel('Bis').fill('2026-10-20');
    await form.getByLabel('Fütterung und Pflege').fill('2× täglich 200 g');
    await form.getByLabel('Medikamente und Hinweise').fill('Apoquel morgens');
    await form.getByRole('button', { name: 'Zugang erstellen' }).click();
    await expect(status(p, 'Zugang für Lea erstellt.')).toHaveCount(1);
    const acc = fake.db.sitter_access![0]!;
    expect(acc).toMatchObject({ sitter_name: 'Lea', valid_from: '2026-10-16', valid_to: '2026-10-20', feeding: '2× täglich 200 g', care_notes: 'Apoquel morgens', revoked_at: null });
    const token = String(acc.token);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const card = main(p).locator('.sitter-card').filter({ hasText: 'Lea' });
    await expect(card).toContainText('Aktiv bis 20.10.2026');
    const origin = new URL(p.url()).origin;
    await expect(card.locator('.invite-url')).toHaveText(`${origin}/betreuung/${token}`);
    await expect(card.getByRole('img', { name: 'QR-Code mit dem Betreuungslink für Luna' })).toBeVisible();
    await expect(card).toContainText('Scannen für Betreuungsinfos zu Luna');
    const wa = await card.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
    expect(decodeURIComponent(wa!.replace('https://wa.me/?text=', ''))).toBe(`Ahmed bittet Sie, Luna zu betreuen (16.10.2026 – 20.10.2026). Alle Infos: ${origin}/betreuung/${token}`);
    await expect(card.getByRole('link', { name: 'E-Mail' })).toHaveAttribute('href', /^mailto:\?subject=Betreuung%20von%20Luna&body=/);
    await expect(card.getByRole('link', { name: 'Sitter-Ansicht für Lea ansehen' })).toHaveAttribute('href', `${origin}/betreuung/${token}`);
    // Karte drucken: nur die QR-Karte sichtbar
    await p.evaluate(() => { window.print = () => undefined; });
    await card.getByRole('button', { name: 'Karte drucken' }).click();

    // widerrufen
    await card.getByRole('button', { name: 'Zugang für Lea widerrufen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Zugang widerrufen?' });
    await expect(dlg).toContainText('Der Link für Lea funktioniert danach sofort nicht mehr.');
    await dlg.getByRole('button', { name: 'Widerrufen' }).click();
    await expect(status(p, 'Zugang für Lea widerrufen.')).toHaveCount(1);
    expect(fake.db.sitter_access![0]!.revoked_at).not.toBeNull();
    await expect(card).toContainText('Widerrufen');
    await expect(card.locator('.invite-url')).toHaveCount(0);
    // löschen
    await card.getByRole('button', { name: 'Zugang für Lea löschen' }).click();
    await p.getByRole('dialog', { name: 'Zugang löschen?' }).getByRole('button', { name: 'Ja, löschen' }).click();
    await expect.poll(() => fake.db.sitter_access!.length).toBe(0);
    // Der Code steht nirgends in der Konsole
    expect(errors.get(p)!.join('\n')).not.toContain(token);
  });

  test('Status in Worten für künftige, abgelaufene und widerrufene Zugänge', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    seedSitter(fake, luna, ahmed, '2026-11-01', '2026-11-05', { sitter_name: 'Zukunft' });
    seedSitter(fake, luna, ahmed, '2026-10-01', '2026-10-15', { sitter_name: 'Vorbei' });
    seedSitter(fake, luna, ahmed, '2026-10-10', '2026-10-20', { sitter_name: 'Zurückgezogen', revoked_at: '2026-10-12T10:00:00Z' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${id(luna)}/betreuung`);
    await expect(main(p).locator('.sitter-card').filter({ hasText: 'Zukunft' })).toContainText('Startet am 01.11.2026');
    await expect(main(p).locator('.sitter-card').filter({ hasText: 'Vorbei' })).toContainText('Abgelaufen');
    await expect(main(p).locator('.sitter-card').filter({ hasText: 'Zurückgezogen' })).toContainText('Widerrufen');
    await expect(main(p).locator('.sitter-card').filter({ hasText: 'Vorbei' }).locator('.invite-url')).toHaveCount(0);
    await expect(main(p).locator('.sitter-card').filter({ hasText: 'Zukunft' }).locator('.invite-url')).toHaveCount(1);
  });
});

test.describe('Öffentliche Sitter-Seite ohne Anmeldung', () => {
  test('Gültig: Betreuungsinfos sichtbar, keine Versicherung/Dokumente, keine Weiterleitung, nur sitter_view, noindex', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    Object.assign(fake.db.pets!.find((x) => x.id === luna.id)!, { owner_phone: '0170 1234567', vet_name: 'Tierarztpraxis am Park', vet_phone: '06142 123456', emergency_contact: 'Frau Kaya, 0171 7654321' });
    seedInsurance(fake, luna, ahmed);
    seedDoc(fake, luna, ahmed, 'Rechnung geheim');
    const a = seedSitter(fake, luna, ahmed, '2026-10-14', '2026-10-20');
    const p = await newPage(browser, fake);
    await p.goto(`/betreuung/${String(a.token)}`);
    await p.waitForLoadState('networkidle');
    await expect(p).toHaveURL(new RegExp(`/betreuung/${String(a.token)}$`));
    await expect(p.getByRole('heading', { name: 'Betreuung von Luna', level: 1 })).toBeVisible();
    await expect(main(p)).toContainText('Zugang für Lea, gültig bis 20.10.2026');
    for (const text of ['2× täglich 200 g Trockenfutter', 'Apoquel morgens mit Futter', 'Huhn', 'Apoquel 16 mg morgens', '276098106015337', 'Ahmed', 'Frau Kaya, 0171 7654321', 'Tierarztpraxis am Park'])
      await expect(main(p)).toContainText(text);
    await expect(main(p).getByRole('link', { name: 'Praxis anrufen' })).toHaveAttribute('href', 'tel:06142123456');
    await expect(main(p).getByRole('link', { name: '0170 1234567' })).toHaveAttribute('href', 'tel:01701234567');
    await expect(main(p)).toContainText('Diese Seite zeigt nur Betreuungsinfos – keine Gesundheitsakte, keine Rechnungen.');
    await expect(main(p)).not.toContainText('Tierkasse');
    await expect(main(p)).not.toContainText('Rechnung geheim');
    await expect(p.getByRole('button', { name: 'Anmelden' })).toHaveCount(0);
    await expect(p.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(p.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    const rest = fake.calls.filter((c) => c.path.startsWith('/rest/') || c.path.startsWith('/storage/'));
    // nur sitter_view (im Entwicklungsmodus ruft React StrictMode den Effekt zweimal auf)
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((c) => c.path === '/rest/v1/rpc/sitter_view')).toBe(true);
    // druckbar
    await p.emulateMedia({ media: 'print' });
    await expect(main(p).getByRole('link', { name: 'Praxis anrufen' })).toBeHidden();
    await expect(p.getByRole('heading', { name: 'Betreuung von Luna' })).toBeVisible();
  });

  test('Widerrufen, abgelaufen, unbekannt → derselbe Hinweis; zukünftig → „Gilt ab …“', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const revoked = seedSitter(fake, luna, ahmed, '2026-10-14', '2026-10-20', { revoked_at: '2026-10-15T10:00:00Z' });
    const expired = seedSitter(fake, luna, ahmed, '2026-10-01', '2026-10-15');
    const future = seedSitter(fake, luna, ahmed, '2026-11-01', '2026-11-05');
    const p = await newPage(browser, fake);
    for (const tok of [String(revoked.token), String(expired.token), 'f'.repeat(64), 'kurz']) {
      await p.goto(`/betreuung/${tok}`);
      await p.waitForLoadState('networkidle');
      await expect(main(p)).toContainText('Dieser Link ist nicht mehr gültig. Bitte fragen Sie nach einem neuen.');
      await expect(main(p)).not.toContainText('Luna');
      await expect(p).toHaveURL(new RegExp(`/betreuung/${tok}$`));
    }
    await p.goto(`/betreuung/${String(future.token)}`);
    await p.waitForLoadState('networkidle');
    await expect(main(p)).toContainText('Gilt ab 01.11.2026.');
    await expect(main(p)).not.toContainText('Apoquel');
    // kein Code in Konsole
    expect(errors.get(p)!.join('\n')).not.toMatch(/[0-9a-f]{64}/);
  });
});

test.describe('Gesundheitsakte', () => {
  test('Stammdaten, Impfnachweis-Tabelle, Gewicht, Versicherung nur mit Haken, Druckansicht; keine Dokumente', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    fake.db.vaccinations!.push(
      { id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, name: 'Tollwut', given_on: '2026-01-10', valid_until: '2027-01-10', source: 'practice', created_at: NOW.toISOString() },
      { id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, name: 'Leptospirose', given_on: '2025-11-01', valid_until: '2026-11-01', source: 'owner', created_at: NOW.toISOString() },
    );
    for (const [d, kg] of [['2026-09-01', 27.5], ['2026-10-01', 28.4]] as const) fake.db.weights!.push({ id: randomUUID(), pet_id: luna.id, owner_id: ahmed.id, measured_on: d, kg, created_at: `${d}T08:00:00Z` });
    seedInsurance(fake, luna, ahmed);
    seedDoc(fake, luna, ahmed, 'Rechnung geheim');
    const p = await openAs(browser, fake, 'ahmed@test.invalid', `/tier/${id(luna)}/gesundheitsakte`);
    await expect(p.getByRole('heading', { name: 'Gesundheitsakte', level: 1 })).toBeVisible();
    await expect(main(p)).toContainText('Alle Daten von Luna in einem Dokument zum Speichern, Teilen und Drucken');
    const doc = main(p).locator('article.vault');
    await expect(doc).toContainText('Gesundheitsakte von Luna');
    await expect(doc).toContainText('Labrador');
    await expect(doc).toContainText('Ahmed');
    const vacc = doc.getByRole('table', { name: 'Impfnachweis von Luna' });
    await expect(vacc.locator('tbody tr')).toHaveCount(2);
    await expect(vacc.locator('tbody tr').nth(0)).toContainText('Leptospirose01.11.202501.11.2026läuft bald abeigene Angabe');
    await expect(vacc.locator('tbody tr').nth(1)).toContainText('Tollwut10.01.202610.01.2027gültigvon der Praxis');
    const wt = doc.getByRole('table', { name: 'Gewichtsverlauf von Luna' });
    await expect(wt.locator('tbody tr').first()).toContainText('01.10.202628,4 kg');
    await expect(doc.getByRole('img', { name: 'Alle Messungen' })).toBeVisible();
    await expect(doc).toContainText('Erstellt am 16.10.2026 mit PetConnect');
    await expect(doc).toContainText('Einträge sind nach Herkunft gekennzeichnet. Eigene Einträge sind nicht von einer Praxis bestätigt.');
    await expect(doc).not.toContainText('Tierkasse');
    await expect(doc).not.toContainText('Rechnung geheim');
    await main(p).getByLabel('Versicherung einschließen').check();
    await expect(doc).toContainText('Tierkasse Muster');
    await expect(doc).toContainText('TK-123');
    await p.emulateMedia({ media: 'print' });
    await expect(p.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();
    await expect(main(p).getByRole('button', { name: 'Als PDF speichern / drucken' })).toBeHidden();
    await expect(main(p).getByLabel('Versicherung einschließen')).toBeHidden();
    await expect(doc).toBeVisible();
  });
});

test.describe('Rechte und Darstellung', () => {
  test('Nur ansehen: alles lesen, keine Bearbeitung, keine Sitter-Links; Mithalterin darf Sitter verwalten', async ({ browser }) => {
    const { fake, ahmed, kyra, oma, luna } = setup();
    fake.addMember(luna.id, oma, 'viewer');
    fake.addMember(luna.id, kyra, 'carer');
    seedInsurance(fake, luna, ahmed);
    const s = seedSitter(fake, luna, ahmed, '2026-10-14', '2026-10-20');
    const o = await openAs(browser, fake, 'oma@test.invalid', `/tier/${id(luna)}/notfallkarte`);
    await expect(o.getByRole('heading', { name: 'Notfallkarte für Luna' })).toBeVisible();
    await expect(main(o).getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(main(o).getByRole('button', { name: 'Karte drucken' })).toBeVisible();
    await o.goto(`/tier/${id(luna)}/versicherung`); await o.waitForLoadState('networkidle');
    await expect(main(o)).toContainText('Sie können die Versicherungen ansehen, aber nicht ändern.');
    await expect(main(o)).toContainText('Tierkasse Muster');
    await expect(main(o).getByRole('button', { name: /hinzufügen|ändern|entfernen|löschen/ })).toHaveCount(0);
    await o.goto(`/tier/${id(luna)}/betreuung`); await o.waitForLoadState('networkidle');
    await expect(main(o)).toContainText('Sitter-Zugänge können nur Halter:in und Mithalter:innen verwalten.');
    await expect(main(o)).not.toContainText(String(s.token));
    await expect(main(o)).not.toContainText('Lea');
    expect(fake.calls.some((c) => c.path.startsWith('/rest/v1/sitter_access'))).toBe(false);
    await o.goto(`/tier/${id(luna)}/gesundheitsakte`); await o.waitForLoadState('networkidle');
    await expect(main(o).getByRole('button', { name: 'Als PDF speichern / drucken' })).toBeEnabled();
    await expect(main(o).getByRole('table', { name: 'Impfnachweis von Luna' }).or(main(o).getByText('Noch keine Impfung eingetragen.'))).toBeVisible();

    const k = await openAs(browser, fake, 'kyra@test.invalid', `/tier/${id(luna)}/betreuung`);
    await expect(main(k).locator('.sitter-card').filter({ hasText: 'Lea' }).locator('.invite-url')).toContainText(String(s.token));
    await expect(main(k).getByRole('button', { name: 'Sitter-Zugang erstellen' })).toBeVisible();
  });

  test('320 px ohne seitliches Scrollen, Bedienelemente ≥ 24 px', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const ins = seedInsurance(fake, luna, ahmed, { insurer: 'Versicherung mit einem sehr langen Namen für die Tierkrankenversicherung' });
    fake.db.insurance_claims!.push({ id: randomUUID(), insurance_id: ins.id, pet_id: luna.id, owner_id: ahmed.id, title: 'Rechnung mit langem Titel für eine Operation', amount: 2345.67, claim_date: '2026-10-01', status: 'query', reimbursed_amount: null, document_id: null, note: null, created_at: NOW.toISOString() });
    seedSitter(fake, luna, ahmed, '2026-10-14', '2026-10-20', { sitter_name: 'Lea mit einem langen Nachnamen' });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier', 320);
    for (const sub of ['', '/notfallkarte', '/versicherung', '/betreuung', '/gesundheitsakte']) {
      const url = sub ? `/tier/${id(luna)}${sub}` : '/tier';
      await p.goto(url); await p.waitForLoadState('networkidle');
      expect(await p.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(320);
      const small = await p.evaluate(() =>
        [...document.querySelectorAll('#main button, #main a, #main select, #main input')]
          // versteckte Datei-Auswahl für das Tierfoto (sr-only) zählt nicht
          .filter((e) => (e as HTMLElement).offsetParent !== null && !e.closest('.sr-only'))
          .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 24 || r.w < 24),
      );
      expect(small, url).toEqual([]);
    }
  });
});
