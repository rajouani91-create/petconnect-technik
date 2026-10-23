import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

/** Praxissuche mit simuliertem Supabase. Alle Praxen hier sind Testdaten und nur in diesem Test vorhanden. */

const NOW = new Date('2026-10-16T10:00:00+02:00'); // Freitag, 10:00
const PW = 'Testpasswort-123';
// Rüsselsheim (65428) als Mittelpunkt; 0,009° Breite ≈ 1 km
const C = { lat: 49.99, lon: 8.41 };

const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string, opts: { width?: number; ctx?: BrowserContextOptions; now?: Date } = {}): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: opts.width ?? 412, height: 915 }, isMobile: true, hasTouch: true, ...opts.ctx });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.clock.setFixedTime(opts.now ?? NOW);
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

/** `extra`: zusätzliche Praxen für Auftrag 08b (Namenssuche, Radius-Vorschlag, Namens-Hinweis) */
function setup(extra = false) {
  const fake = new FakeSupabase();
  const ahmed = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog' });
  fake.seedPet(ahmed, { name: 'Rex', species: 'reptile' });
  fake.seedPostcode('65428', 'Rüsselsheim', C.lat, C.lon);
  fake.seedPostcode('65462', 'Ginsheim-Gustavsburg', 49.97, 8.34);
  fake.seedPostcode('55116', 'Mainz', 50.0, 8.27);
  const reptile = fake.seedPractice(
    { name: 'Reptilienpraxis am Main', street: 'Mainstraße', housenumber: '5', postcode: '65428', city: 'Rüsselsheim', lat: C.lat + 0.018, lon: C.lon, phone: '06142 111222', website: 'reptilien-test.invalid', opening_hours: 'Mo-Fr 08:00-18:00', registered: true },
    { species: ['reptile', 'dog'], services: ['hibernation', 'surgery'], titles: ['reptiles'], focus: ['Schildkröten'], titles_verified: true },
  );
  const small = fake.seedPractice(
    { name: 'Kleintierpraxis Süd', street: 'Südring', housenumber: '2', postcode: '65428', city: 'Rüsselsheim', lat: C.lat + 0.009, lon: C.lon, phone: '06142 333444', opening_hours: 'Mo-Fr 14:00-18:00' },
    { species: ['dog', 'cat'], services: ['surgery'], titles: ['small_animals'], titles_verified: false },
  );
  const noProfile = fake.seedPractice({ name: 'Tierarzt ohne Profil', postcode: '65428', city: 'Rüsselsheim', lat: C.lat + 0.027, lon: C.lon, phone: '06142 555666', opening_hours: null });
  const far = fake.seedPractice({ name: 'Tierklinik Weit', postcode: '55116', city: 'Mainz', lat: C.lat + 0.18, lon: C.lon, phone: '06131 777' });
  fake.seedPractice({ name: 'Geschlossene Praxis', lat: C.lat + 0.005, lon: C.lon, active: false });
  if (extra) {
    fake.seedPractice({ name: 'Tierarztpraxis Dr. Müller', postcode: '65428', city: 'Rüsselsheim', lat: C.lat - 0.027, lon: C.lon, phone: '06142 888', opening_hours: 'Mo-Fr 08:00-12:00 open "nur Notfälle"' });
    fake.seedPractice({ name: 'Exotenpraxis Bauschheim', postcode: '65428', city: 'Rüsselsheim', lat: C.lat - 0.036, lon: C.lon, phone: '06142 999' });
    fake.seedPractice({ name: 'Vogelpraxis Süd', lat: C.lat - 0.18, lon: C.lon, phone: '06151 1' }, { species: ['bird'], titles: ['birds'], titles_verified: true });
    fake.seedPractice({ name: 'Pferdeklinik Taunus', lat: C.lat + 0.27, lon: C.lon, phone: '06192 1' }, { species: ['horse'], services: ['equine_mobile'] });
  }
  return { fake, ahmed, oma, luna, reptile, small, noProfile, far };
}

const main = (p: Page) => p.locator('#main');
const counter = (p: Page) => p.locator('.result-count');
const cards = (p: Page, section?: string) => (section ? main(p).locator('section, div').filter({ has: p.getByRole('heading', { name: section }) }).first() : main(p)).locator('.practice-card');
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });
const group = (p: Page, name: string) => p.getByRole('group', { name });
const opts = (p: Page) => p.getByRole('listbox', { name: 'Vorschläge' }).getByRole('option');

async function searchPlz(p: Page, q = '65428') {
  const box = p.getByRole('combobox', { name: 'Ort oder PLZ' });
  await box.fill(q);
  if (/^\d{5}$/.test(q)) {
    // seit 08b: genau 5 Ziffern mit genau einem Treffer werden automatisch übernommen
    await expect(box).toHaveValue(new RegExp(`^${q} `));
  } else {
    await expect(opts(p).first()).toBeVisible();
    await opts(p).first().click();
  }
  await expect(counter(p)).not.toBeEmpty();
}

test.afterEach(async () => {
  for (const [page, list] of errors) {
    const real = list.filter((e) => !/Failed to load resource/.test(e));
    expect(real, `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  }
  errors.clear();
});

test.describe('Suche', () => {
  test('PLZ → Vorschlag → Ergebnisse nach Entfernung; Fokus auf Zähler; URL; OSM-Quellenangabe', async ({ browser }) => {
    const { fake, reptile } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/');
    await p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Praxen' }).click();
    await expect(p.getByRole('heading', { name: 'Praxen in der Nähe', level: 1 })).toBeVisible();
    await expect(main(p)).toContainText('Geben Sie einen Ort oder eine PLZ ein oder nutzen Sie Ihren Standort.');
    const box = p.getByRole('combobox', { name: 'Ort oder PLZ' });
    await box.fill('Rüss');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await expect(p.getByRole('listbox', { name: 'Vorschläge' }).getByRole('option')).toHaveText(['65428 Rüsselsheim']);
    await p.getByRole('option', { name: '65428 Rüsselsheim' }).click();
    await expect(counter(p)).toHaveText('3 Praxen passen · 65428 Rüsselsheim');
    await expect(counter(p)).toBeFocused();
    await expect(p).toHaveURL(/\/praxen\?plz=65428$/);
    // „Empfohlen (Entfernung)“: bei PetConnect zuerst (seit 08b), dann Entfernung
    await expect(cards(p).locator('h3')).toHaveText(['Reptilienpraxis am Main', 'Kleintierpraxis Süd', 'Tierarzt ohne Profil']);
    await expect(cards(p).filter({ hasText: 'Kleintierpraxis Süd' })).toContainText('1,0 km');
    await expect(main(p)).not.toContainText('Geschlossene Praxis');
    await expect(main(p)).not.toContainText('Tierklinik Weit');
    // Karte einer Praxis mit Profil
    const r = cards(p).filter({ hasText: 'Reptilienpraxis am Main' });
    await expect(r).toContainText('Mainstraße 5, 65428 Rüsselsheim');
    await expect(r).toContainText('bei PetConnect');
    await expect(r).toContainText('Jetzt geöffnet – bis 18:00');
    await expect(r).toContainText('heute 08:00–18:00');
    await expect(r).toContainText('Behandelt: Reptil, Hund');
    await expect(r).toContainText('Angebot: Überwinterung (Winterstarre-Betreuung), Operationen');
    await expect(r).toContainText('Schwerpunkt: Schildkröten');
    await expect(r).toContainText('Fachtierarzt für Reptilien geprüft');
    await expect(r.getByRole('link', { name: 'Reptilienpraxis am Main anrufen' })).toHaveAttribute('href', 'tel:06142111222');
    await expect(r.getByRole('link', { name: 'Route zu Reptilienpraxis am Main (OpenStreetMap)' })).toHaveAttribute('href', `https://www.openstreetmap.org/directions?to=${Number(reptile.lat)},${C.lon}`);
    await expect(r.getByRole('link', { name: 'Route zu Reptilienpraxis am Main (Google Maps)' })).toHaveAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${Number(reptile.lat)},${C.lon}`);
    await expect(r.getByRole('link', { name: 'Webseite von Reptilienpraxis am Main' })).toHaveAttribute('href', 'https://reptilien-test.invalid/');
    await expect(r.getByRole('link', { name: 'Fehler zu Reptilienpraxis am Main bei OpenStreetMap melden' })).toHaveAttribute('href', `https://www.openstreetmap.org/note/new#map=18/${Number(reptile.lat)}/${C.lon}`);
    // Praxis ohne Profil: nie als Partner dargestellt
    const n = cards(p).filter({ hasText: 'Tierarzt ohne Profil' });
    await expect(n).toContainText('noch nicht bei PetConnect');
    await expect(n).toContainText('Angebot unbekannt, bitte anrufen');
    await expect(cards(p).filter({ hasText: 'Kleintierpraxis Süd' })).toContainText('Fachtierarzt für Kleintiere Angabe der Praxis');
    // Pflichtangaben
    await expect(main(p)).toContainText('Praxisdaten:');
    await expect(main(p).getByRole('link', { name: '© OpenStreetMap-Mitwirkende' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    await expect(main(p)).toContainText('Fehlt eine Praxis oder stimmt etwas nicht? Sie können es bei OpenStreetMap ergänzen.');
    await expect(main(p)).toContainText('Fachtierarzt-Bezeichnungen mit dem Zeichen „geprüft“ haben wir mit der Tierärztekammer abgeglichen.');
    // Ortswahl gemerkt (nur PLZ, keine Koordinaten)
    const stored = await p.evaluate(() => ({ ...localStorage }));
    expect(stored['pc-practice-place']).toBe('65428');
    expect(JSON.stringify(stored)).not.toContain('49.99');
    // Sortieren nach Name
    await main(p).getByLabel('Sortieren nach').selectOption({ label: 'Name' });
    await expect(cards(p).locator('h3')).toHaveText(['Kleintierpraxis Süd', 'Reptilienpraxis am Main', 'Tierarzt ohne Profil']);
    await expect(p).toHaveURL(/sort=name/);
  });

  test('„Mein Standort“: erlaubt → Suche ohne gespeicherte Koordinaten; abgelehnt → freundlicher Hinweis', async ({ browser }) => {
    const { fake } = setup();
    const ok = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen', { ctx: { geolocation: { latitude: C.lat, longitude: C.lon }, permissions: ['geolocation'] } });
    expect(fake.calls.some((c) => c.path === '/rest/v1/rpc/search_practices')).toBe(false); // nie automatisch
    await ok.getByRole('button', { name: 'Mein Standort' }).click();
    await expect(counter(ok)).toHaveText('3 Praxen passen · Mein Standort');
    await expect(counter(ok)).toBeFocused();
    await expect(ok).not.toHaveURL(/plz=|lat|lon/);
    expect(JSON.stringify(await ok.evaluate(() => ({ ...localStorage })))).not.toContain('8.41');
    await expect(main(ok)).toContainText('Ihr Standort wird nur für diese Suche verwendet und nicht gespeichert.');

    const no = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen', { ctx: { permissions: [] } });
    await no.evaluate(() => {
      Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number; PERMISSION_DENIED: number }) => void) => fail({ code: 1, PERMISSION_DENIED: 1 }) }, configurable: true });
    });
    await no.getByRole('button', { name: 'Mein Standort' }).click();
    await expect(main(no)).toContainText('Der Standort ist nicht freigegeben. Sie können stattdessen einen Ort oder eine PLZ eingeben.');
    await searchPlz(no);
    await expect(counter(no)).toContainText('3 Praxen passen');
  });

  test('Reptil + Überwinterung + Fachtierarzt für Reptilien → nur der passende Treffer, Praxen ohne Profil darunter', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen');
    await searchPlz(p);
    await group(p, 'Für welches Tier?').getByRole('button', { name: 'Reptil', exact: true }).click();
    await group(p, 'Was brauchen Sie?').getByRole('button', { name: 'Überwinterung (Winterstarre-Betreuung)' }).click();
    await group(p, 'Fachtierarzt-Bezeichnung').getByRole('button', { name: 'Fachtierarzt für Reptilien' }).click();
    await expect(group(p, 'Für welches Tier?').getByRole('button', { name: 'Reptil', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(counter(p)).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
    await expect(p).toHaveURL(/plz=65428&tier=reptile&l=hibernation&t=reptiles$/);
    const lists = main(p).locator('.practice-list');
    await expect(lists.nth(0).locator('h3')).toHaveText(['Reptilienpraxis am Main']);
    const unknown = main(p).locator('div.stack').filter({ has: p.getByRole('heading', { name: 'Noch nicht bei PetConnect – Angebot unbekannt, bitte anrufen' }) });
    await expect(unknown.locator('.practice-card h3')).toHaveText(['Tierarzt ohne Profil']);
    await expect(main(p)).not.toContainText('Kleintierpraxis Süd');
    // Parameter an die Datenbank
    const call = [...fake.calls].reverse().find((c) => c.path === '/rest/v1/rpc/search_practices')!;
    expect(call.body).toMatchObject({ p_radius_km: 10, p_species: 'reptile', p_services: ['hibernation'], p_titles: ['reptiles'], p_q: null });
    // Chip „Rex · Reptil“ aus den eigenen Tieren
    await expect(group(p, 'Für welches Tier?').getByRole('button', { name: 'Reptil · Rex' })).toBeVisible();
    await expect(group(p, 'Für welches Tier?').getByRole('button', { name: 'Hund · Luna' })).toBeVisible();
  });

  test('Keine Treffer → Hinweis und „Filter zurücksetzen“', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428&t=birds');
    await expect(counter(p)).toHaveText('Keine Praxis passt · 65428 Rüsselsheim');
    await expect(main(p)).toContainText('Keine Praxis bei PetConnect passt zu Ihrer Auswahl. Nehmen Sie einen Filter heraus oder fragen Sie bei einer Praxis ohne Angaben nach.');
    // Praxen mit Angaben gibt es, aber auch in größerem Umkreis passt keine → kein Radius-Knopf (08b)
    await expect(main(p).getByRole('button', { name: /Suchradius/ })).toHaveCount(0);
    await main(p).getByRole('button', { name: 'Filter zurücksetzen' }).last().click();
    await expect(counter(p)).toHaveText('3 Praxen passen · 65428 Rüsselsheim');
    await expect(p).toHaveURL(/\/praxen\?plz=65428$/);
  });

  test('Umkreis, Namenssuche und Wiederherstellen aus der URL (Neu laden)', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen');
    await searchPlz(p);
    await main(p).getByLabel('Umkreis').selectOption({ label: '25 km' });
    await expect(counter(p)).toHaveText('4 Praxen passen · 65428 Rüsselsheim');
    await expect(cards(p).last()).toContainText('Tierklinik Weit');
    await main(p).getByLabel('Praxisname (optional)').fill('klinik');
    await expect(counter(p)).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
    await expect(p).toHaveURL(/plz=65428&r=25&q=klinik/);
    await p.reload();
    await p.waitForLoadState('networkidle');
    await expect(counter(p)).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
    await expect(main(p).getByLabel('Umkreis')).toHaveValue('25');
    await expect(main(p).getByLabel('Praxisname (optional)')).toHaveValue('klinik');
    await expect(p.getByRole('combobox', { name: 'Ort oder PLZ' })).toHaveValue('65428 Rüsselsheim');
  });

  test('„Jetzt geöffnet“ um Freitag 10:00: geschlossene ausgeblendet, ohne Zeiten unten', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428');
    await expect(counter(p)).toContainText('3 Praxen passen');
    await expect(cards(p).filter({ hasText: 'Kleintierpraxis Süd' })).toContainText('Geschlossen – öffnet heute um 14:00');
    await expect(cards(p).filter({ hasText: 'Kleintierpraxis Süd' })).toContainText('heute 14:00–18:00');
    await main(p).getByRole('switch', { name: 'Jetzt geöffnet' }).click();
    await expect(p).toHaveURL(/offen=1/);
    await expect(main(p)).not.toContainText('Kleintierpraxis Süd');
    await expect(main(p).locator('.practice-list').first().locator('h3')).toHaveText(['Reptilienpraxis am Main']);
    const unknown = main(p).getByRole('heading', { name: 'Öffnungszeiten unbekannt' });
    await expect(unknown).toBeVisible();
    await expect(main(p).locator('.practice-list').nth(1)).toContainText('Tierarzt ohne Profil');
    await expect(main(p).locator('.practice-list').nth(1)).toContainText('Öffnungszeiten unbekannt');
    await expect(counter(p)).toContainText('2 Praxen passen');
  });
});

test.describe('Aktionen', () => {
  test('Favorit setzen und entfernen, erscheint unter „Meine Favoriten“', async ({ browser }) => {
    const { fake, reptile } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428');
    await expect(main(p)).not.toContainText('Meine Favoriten');
    const star = cards(p).filter({ hasText: 'Reptilienpraxis am Main' }).getByRole('button', { name: 'Reptilienpraxis am Main als Favorit' });
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await star.click();
    await expect(status(p, 'Reptilienpraxis am Main ist jetzt ein Favorit.')).toHaveCount(1);
    expect(fake.db.practice_favorites).toMatchObject([{ practice_id: reptile.id }]);
    const favs = main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Meine Favoriten' }) });
    await expect(favs.locator('.practice-card h3')).toHaveText(['Reptilienpraxis am Main']);
    await expect(favs.getByRole('button', { name: 'Reptilienpraxis am Main als Favorit' })).toHaveAttribute('aria-pressed', 'true');
    // nach Neu laden weiterhin da, auch ohne Suche
    await p.goto('/praxen'); await p.waitForLoadState('networkidle');
    await expect(main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Meine Favoriten' }) })).toContainText('Reptilienpraxis am Main');
    await main(p).getByRole('button', { name: 'Reptilienpraxis am Main als Favorit' }).first().click();
    await expect.poll(() => fake.db.practice_favorites!.length).toBe(0);
    await expect(main(p)).not.toContainText('Meine Favoriten');
  });

  test('„Als Stammpraxis übernehmen“ → Notfallkarte zeigt Praxis und Telefon; Links „Praxis suchen“', async ({ browser }) => {
    const { fake, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428');
    await cards(p).filter({ hasText: 'Kleintierpraxis Süd' }).getByRole('button', { name: 'Kleintierpraxis Süd als Stammpraxis übernehmen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Als Stammpraxis übernehmen' });
    await expect(dlg).toContainText('Für welches Tier soll Kleintierpraxis Süd die Stammpraxis sein?');
    await dlg.getByLabel('Luna').check();
    await dlg.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(status(p, 'Kleintierpraxis Süd ist jetzt Stammpraxis von Luna.')).toHaveCount(1);
    expect(fake.db.pets!.find((x) => x.id === luna.id)).toMatchObject({ vet_name: 'Kleintierpraxis Süd', vet_phone: '06142 333444' });
    await p.goto(`/tier/${String(luna.id)}/notfallkarte`); await p.waitForLoadState('networkidle');
    await expect(main(p)).toContainText('Kleintierpraxis Süd');
    await expect(main(p).getByRole('link', { name: 'Stammpraxis anrufen' })).toHaveAttribute('href', 'tel:06142333444');
    await expect(main(p).getByRole('link', { name: 'Praxis suchen' })).toHaveAttribute('href', '/praxen');
    await p.goto('/termine'); await p.waitForLoadState('networkidle');
    await p.getByRole('button', { name: 'Termin eintragen' }).click();
    await expect(p.getByRole('form', { name: 'Termin eintragen' }).getByRole('link', { name: 'Praxis suchen' })).toHaveAttribute('href', '/praxen');
  });

  test('„Praxis einladen“ → Dialog, Wunsch gespeichert (nichts versendet), Knopf zeigt „Einladung vorgemerkt“', async ({ browser }) => {
    const { fake, noProfile } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428');
    // registrierte Praxis hat keinen Einladen-Knopf
    await expect(cards(p).filter({ hasText: 'Reptilienpraxis am Main' }).getByRole('button', { name: /einladen/ })).toHaveCount(0);
    await cards(p).filter({ hasText: 'Tierarzt ohne Profil' }).getByRole('button', { name: 'Tierarzt ohne Profil einladen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Praxis einladen' });
    await expect(dlg).toContainText('Wir merken uns Ihren Wunsch und laden Tierarzt ohne Profil zu PetConnect ein. Es wird nichts in Ihrem Namen gesendet.');
    await dlg.getByRole('button', { name: 'Wunsch vormerken' }).click();
    await expect(status(p, 'Einladungswunsch für Tierarzt ohne Profil vorgemerkt.')).toHaveCount(1);
    expect(fake.db.practice_invite_requests).toMatchObject([{ practice_id: noProfile.id }]);
    const btn = cards(p).filter({ hasText: 'Tierarzt ohne Profil' }).getByRole('button', { name: 'Einladung für Tierarzt ohne Profil vorgemerkt' });
    await expect(btn).toHaveText('Einladung vorgemerkt');
    await expect(btn).toBeDisabled();
    // Es gibt keinen Versand: keine anderen Aufrufe außer der Tabelle
    expect(fake.calls.filter((c) => /invite|mail|send/i.test(c.path) && !c.path.startsWith('/rest/v1/practice_invite_requests'))).toEqual([]);
  });

  test('Nur ansehen: keine Stammpraxis-Übernahme, Suche und Favoriten gehen', async ({ browser }) => {
    const { fake, luna, oma } = setup();
    fake.addMember(luna.id, oma, 'viewer');
    const p = await openAs(browser, fake, 'oma@test.invalid', '/praxen?plz=65428');
    await expect(counter(p)).toContainText('3 Praxen passen');
    await expect(main(p).getByRole('button', { name: /als Stammpraxis übernehmen/ })).toHaveCount(0);
    await main(p).getByRole('button', { name: 'Tierarzt ohne Profil als Favorit' }).click();
    await expect.poll(() => fake.db.practice_favorites!.length).toBe(1);
  });
});

test.describe('Tastatur und Darstellung', () => {
  test('Combobox, Chips und Dialog nur mit der Tastatur', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen');
    const box = p.getByRole('combobox', { name: 'Ort oder PLZ' });
    await box.focus();
    await p.keyboard.type('Ma');
    await expect(opts(p)).toHaveText(['55116 Mainz']);
    await p.keyboard.press('Escape');
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await box.fill('');
    await p.keyboard.type('Gins');
    await expect(opts(p)).toHaveCount(1);
    await p.keyboard.press('ArrowDown');
    await expect(box).toHaveAttribute('aria-activedescendant', /opt-0$/);
    await expect(p.getByRole('option', { name: '65462 Ginsheim-Gustavsburg' })).toHaveAttribute('aria-selected', 'true');
    await p.keyboard.press('Enter');
    await expect(counter(p)).toBeFocused();
    await expect(counter(p)).toContainText('Ginsheim-Gustavsburg');
    // PLZ eintippen und direkt Enter (ohne Vorschlag wählen)
    await box.fill('65428');
    await box.press('Enter');
    await expect(counter(p)).toHaveText('3 Praxen passen · 65428 Rüsselsheim');
    // Chip per Tastatur
    const chip = group(p, 'Was brauchen Sie?').getByRole('button', { name: 'Operationen' });
    await chip.focus();
    await p.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(counter(p)).toHaveText('2 Praxen passen · 65428 Rüsselsheim');
    await expect(chip).toBeFocused();
    await p.keyboard.press('Space');
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    // Dialog: Escape schließt, Fokus zurück
    const inv = main(p).getByRole('button', { name: 'Tierarzt ohne Profil einladen' });
    await inv.focus();
    await p.keyboard.press('Enter');
    const dlg = p.getByRole('dialog', { name: 'Praxis einladen' });
    await expect(dlg.getByRole('button', { name: 'Abbrechen' })).toBeFocused();
    await p.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(inv).toBeFocused();
    expect(fake.db.practice_invite_requests).toHaveLength(0);
  });

  test('320 px: untere Leiste mit 5 Punkten und „Mehr“, ohne seitliches Scrollen; Erinnerungen und Alltag unter „Mehr“', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428&l=surgery', { width: 320 });
    const navLinks = p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link');
    await expect(navLinks).toHaveText(['Heute', 'Termine', 'Tier', 'Praxen', 'Mehr']);
    for (const url of ['/praxen?plz=65428&l=surgery', '/mehr', '/erinnerungen']) {
      await p.goto(url); await p.waitForLoadState('networkidle');
      expect(await p.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(320);
      const small = await p.evaluate(() =>
        [...document.querySelectorAll('#main button, #main a, #main select, #main input:not([type=radio]):not([type=checkbox]), nav a')] // Auswahlknöpfe: Ziel ist das ganze Label
          .filter((e) => (e as HTMLElement).offsetParent !== null && !e.closest('.sr-only'))
          .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 24 || r.w < 24),
      );
      expect(small, url).toEqual([]);
    }
    // „Mehr“ ist hervorgehoben, wenn man in einem Unterbereich ist
    await expect(navLinks.filter({ hasText: 'Mehr' })).toHaveClass(/parent-active/);
    await p.goto('/mehr'); await p.waitForLoadState('networkidle');
    await expect(main(p).getByRole('link', { name: 'Erinnerungen', exact: true })).toHaveAttribute('href', '/erinnerungen');
    await expect(main(p).getByRole('link', { name: 'Alltag', exact: true })).toHaveAttribute('href', '/alltag');
    // Desktop: alle Bereiche in der Seitenleiste
    await p.setViewportSize({ width: 1200, height: 900 });
    await expect(navLinks).toHaveText(['Heute', 'Termine', 'Tier', 'Praxen', 'Erinnerungen', 'Alltag', 'Mehr']);
  });

  test('Suche nicht erreichbar → verständlicher Fehlertext', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen');
    await p.route('**/rest/v1/rpc/search_practices', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"down"}' }));
    errors.get(p)!.length = 0;
    await searchPlz(p).catch(() => undefined);
    await expect(main(p).getByRole('alert')).toHaveText('Die Suche ist gerade nicht erreichbar. Bitte versuchen Sie es gleich noch einmal.');
    errors.get(p)!.length = 0; // erwarteter Fehler in der Konsole
  });
});

test.describe('Verbesserungen (08b)', () => {
  test('Namenssuche fehlertolerant: „Mueller“, „muller“, „Tierarztpraxis Dr. Müller“, „Pferdklinik“; Text nur getrimmt', async ({ browser }) => {
    const { fake } = setup(true);
    for (const q of ['Mueller', 'muller', 'Tierarztpraxis Dr. Müller']) {
      const p = await openAs(browser, fake, 'ahmed@test.invalid', `/praxen?plz=65428&q=${encodeURIComponent(q)}`);
      await expect(counter(p), q).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
      await expect(cards(p).locator('h3'), q).toHaveText(['Tierarztpraxis Dr. Müller']);
      await p.context().close();
    }
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428&r=50');
    await expect(counter(p)).toContainText('Praxen passen');
    await main(p).getByLabel('Praxisname (optional)').fill('  Pferdklinik ');
    await expect(counter(p)).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
    await expect(cards(p).locator('h3')).toHaveText(['Pferdeklinik Taunus']);
    const call = [...fake.calls].reverse().find((c) => c.path === '/rest/v1/rpc/search_practices')!;
    expect((call.body as { p_q: string }).p_q).toBe('Pferdklinik'); // nicht umgewandelt, nur getrimmt
    await expect(p).toHaveURL(/q=Pferdklinik/);
  });

  test('Ort tolerant („Ruesselsheim“, „Rüselsheim“), Treffer fett; 5-stellige PLZ automatisch übernommen und angesagt', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen');
    const box = p.getByRole('combobox', { name: 'Ort oder PLZ' });
    for (const q of ['Ruesselsheim', 'Rüselsheim']) {
      await box.fill(q);
      await expect(opts(p), q).toHaveText(['65428 Rüsselsheim']);
    }
    await box.fill('Rüss');
    await expect(opts(p).first().locator('mark')).toHaveText('Rüss');
    // ein Zeichen: keine Abfrage
    const before = fake.calls.filter((c) => c.path === '/rest/v1/rpc/geocode_place').length;
    await box.fill('R');
    await p.waitForTimeout(500);
    expect(fake.calls.filter((c) => c.path === '/rest/v1/rpc/geocode_place').length).toBe(before);
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    // kein Treffer
    await box.fill('Xyzabc');
    await expect(main(p)).toContainText('Ort nicht gefunden – bitte PLZ oder anderen Ortsnamen versuchen.');
    // PLZ: automatisch, Fokus bleibt im Feld
    await box.fill('65428');
    await expect(box).toHaveValue('65428 Rüsselsheim');
    await expect(status(p, 'Rüsselsheim, 65428 ausgewählt')).toHaveCount(1);
    await expect(counter(p)).toHaveText('3 Praxen passen · 65428 Rüsselsheim');
    await expect(box).toBeFocused();
    await expect(p).toHaveURL(/plz=65428/);
  });

  test('Radius-Knopf nur bei echten Treffern im größeren Umkreis; Klick erweitert Radius und URL', async ({ browser }) => {
    const { fake } = setup(true);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428&t=birds');
    await expect(counter(p)).toHaveText('Keine Praxis passt · 65428 Rüsselsheim');
    const more = main(p).getByRole('button', { name: 'Suchradius auf 25 km erweitern' });
    await expect(more).toBeVisible();
    await expect(main(p)).toContainText('1 passende Praxis im Umkreis von 25 km');
    expect(fake.calls.some((c) => c.path === '/rest/v1/rpc/count_practices_by_radius')).toBe(true);
    await more.click();
    await expect(p).toHaveURL(/plz=65428&r=25&t=birds/);
    await expect(counter(p)).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
    await expect(counter(p)).toBeFocused();
    await expect(main(p).locator('.practice-list').first().locator('h3')).toHaveText(['Vogelpraxis Süd']);
    await expect(main(p).getByRole('button', { name: /Suchradius/ })).toHaveCount(0);
  });

  test('Ohne jedes Praxisprofil: Hinweis statt Radius-Knopf; bis 50 km nichts: Link zu OpenStreetMap', async ({ browser }) => {
    const fake = new FakeSupabase();
    fake.seedPet(fake.seedUser('ahmed@test.invalid', PW, 'Ahmed'), { name: 'Luna', species: 'dog' });
    fake.seedPostcode('65428', 'Rüsselsheim', C.lat, C.lon);
    fake.seedPostcode('10115', 'Berlin', 52.53, 13.38);
    fake.seedPractice({ name: 'Tierarzt Nord', lat: C.lat + 0.009, lon: C.lon });
    fake.seedPractice({ name: 'Tierarzt Fern', lat: C.lat + 0.27, lon: C.lon });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428&tier=reptile');
    await expect(counter(p)).toHaveText('Keine Praxis passt · 65428 Rüsselsheim');
    await expect(main(p)).toContainText('Noch keine Praxis in Ihrer Nähe hat Angaben zu Leistungen gemacht. Diese Praxen könnten passen – bitte anrufen und nachfragen.');
    await expect(main(p).getByRole('button', { name: /Suchradius/ })).toHaveCount(0);
    const unknown = main(p).locator('div.stack').filter({ has: p.getByRole('heading', { name: 'Noch nicht bei PetConnect – Angebot unbekannt, bitte anrufen' }) });
    await expect(unknown.locator('.practice-card h3')).toHaveText(['Tierarzt Nord']);

    await p.goto('/praxen?plz=10115'); await p.waitForLoadState('networkidle');
    await expect(main(p)).toContainText('Im Umkreis von 50 km haben wir keine Praxis gefunden.');
    await expect(main(p).getByRole('link', { name: 'Praxis bei OpenStreetMap eintragen' })).toHaveAttribute('href', 'https://www.openstreetmap.org/note/new#map=18/52.53/13.38');
    await expect(main(p).getByRole('button', { name: /Suchradius/ })).toHaveCount(0);
  });

  test('Öffnungsstatus mit Uhr: geöffnet bis, schließt bald, geschlossen/öffnet, unbekannt, Kommentar', async ({ browser }) => {
    const { fake } = setup(true);
    const card = (p: Page, name: string) => cards(p).filter({ hasText: name });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428'); // Freitag 10:00
    await expect(card(p, 'Reptilienpraxis am Main').locator('.pill.oh-open')).toHaveText('Jetzt geöffnet – bis 18:00');
    await expect(card(p, 'Kleintierpraxis Süd').locator('.pill.oh-closed')).toHaveText('Geschlossen – öffnet heute um 14:00');
    await expect(card(p, 'Tierarzt ohne Profil').locator('.pill.oh-unknown')).toHaveText('Öffnungszeiten unbekannt');
    await expect(card(p, 'Tierarztpraxis Dr. Müller')).toContainText('Hinweis: nur Notfälle');

    await p.clock.setFixedTime(new Date('2026-10-16T17:30:00+02:00'));
    await p.reload(); await p.waitForLoadState('networkidle');
    await expect(card(p, 'Reptilienpraxis am Main').locator('.pill.oh-closing')).toHaveText('Schließt bald – um 18:00');
    await main(p).getByRole('switch', { name: 'Jetzt geöffnet' }).click();
    await expect(main(p).locator('.practice-list').first()).toContainText('Kleintierpraxis Süd'); // schließt bald = geöffnet
    await main(p).getByRole('switch', { name: 'Jetzt geöffnet' }).click();

    await p.clock.setFixedTime(new Date('2026-10-16T19:00:00+02:00'));
    await p.reload(); await p.waitForLoadState('networkidle');
    await expect(card(p, 'Reptilienpraxis am Main').locator('.pill.oh-closed')).toHaveText('Geschlossen – öffnet Montag um 08:00');
  });

  test('„Exotenpraxis“ bei Tierart Reptil: nur Hinweis im Abschnitt „Angebot unbekannt“, kein Treffer', async ({ browser }) => {
    const { fake } = setup(true);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/praxen?plz=65428&tier=reptile');
    await expect(counter(p)).toHaveText('1 Praxis passt · 65428 Rüsselsheim');
    await expect(main(p).locator('.practice-list').first().locator('h3')).toHaveText(['Reptilienpraxis am Main']);
    const unknown = main(p).locator('div.stack').filter({ has: p.getByRole('heading', { name: 'Noch nicht bei PetConnect – Angebot unbekannt, bitte anrufen' }) });
    // weiter oben trotz größerer Entfernung, mit Hinweis
    await expect(unknown.locator('.practice-card h3')).toHaveText(['Exotenpraxis Bauschheim', 'Tierarzt ohne Profil', 'Tierarztpraxis Dr. Müller']);
    const exo = unknown.locator('.practice-card').filter({ hasText: 'Exotenpraxis Bauschheim' });
    await expect(exo).toContainText('Name deutet auf Reptil hin – bitte anrufen und nachfragen');
    await expect(exo).toContainText('noch nicht bei PetConnect');
    await expect(unknown.locator('.practice-card').filter({ hasText: 'Tierarzt ohne Profil' })).not.toContainText('Name deutet');
  });
});
