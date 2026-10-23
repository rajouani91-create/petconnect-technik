import { expect, test, type Browser, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeSupabase } from './fake-supabase';

/** Familie & Mithalter:innen, Rechte-Stufen, Tierfoto – mit simuliertem Supabase und mehreren Konten. */

const NOW = new Date('2026-10-16T10:00:00+02:00'); // Freitag
const PW = 'Testpasswort-123';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const JPG = path.join(HERE, 'luna.jpg');
const PDF = path.join(HERE, 'kein-bild.pdf');

const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

async function openAs(browser: Browser, fake: FakeSupabase, email: string | null, url = '/'): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.clock.setFixedTime(NOW);
  await fake.install(page);
  if (email) {
    await page.goto('/login');
    // Einführung vor der Anmeldung überspringen (falls sichtbar)
    await page.getByRole('button', { name: 'Jetzt anmelden' }).click({ timeout: 2000 }).catch(() => {});
    await page.getByLabel('E-Mail').fill(email);
    await page.getByRole('textbox', { name: 'Passwort', exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.locator('#main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (url !== '/') { await page.goto(url); await page.waitForLoadState('networkidle'); }
  } else { await page.goto(url); await page.waitForLoadState('networkidle'); }
  return page;
}

function setup() {
  const fake = new FakeSupabase();
  const ahmed = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  const kyra = fake.seedUser('kyra@test.invalid', PW, 'Kyra');
  const oma = fake.seedUser('oma@test.invalid', PW, 'Oma Erika');
  const luna = fake.seedPet(ahmed, { name: 'Luna', species: 'dog' });
  const mio = fake.seedPet(ahmed, { name: 'Mio', species: 'cat' });
  for (const [k, t] of [['walk', '07:00:00'], ['feed', '07:30:00'], ['walk', '12:30:00'], ['walk', '18:00:00']] as const)
    fake.db.routine_items!.push({ id: `${k}-${t}`, pet_id: luna.id, owner_id: ahmed.id, kind: k, label: null, time_of_day: t, repeat: 'daily', reminder_on: true, created_at: NOW.toISOString() });
  return { fake, ahmed, kyra, oma, luna, mio };
}
/** Einladung direkt im simulierten Backend anlegen (wie create_pet_invite) */
function invite(fake: FakeSupabase, by: { id: string }, name: string, role: 'carer' | 'viewer', pets: unknown[]): string {
  const token = (Math.random().toString(16).slice(2) + Date.now().toString(16)).padEnd(64, '0').slice(0, 64);
  const id = `inv-${name}`;
  fake.db.pet_invites!.push({ id, created_by: by.id, invitee_name: name, role, token, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), accepted_by: null, accepted_at: null, created_at: NOW.toISOString() });
  for (const p of pets) fake.db.pet_invite_pets!.push({ invite_id: id, pet_id: p });
  return token;
}
const nav = (p: Page, name: string) => p.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name });
const family = (p: Page) => p.locator('#familie');

test.afterEach(async () => {
  for (const [page, list] of errors) {
    const real = list.filter((e) => !/Failed to load resource/.test(e));
    expect(real, `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  }
  errors.clear();
});

test.describe('Einladen (Haupthalter:in)', () => {
  test('Kyra als Mithalterin für beide Tiere einladen: Link, Eintrag mit Stufe und Tieren', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    await expect(family(p)).toContainText('Familie & Mithalter:innen');
    await expect(family(p)).toContainText('Sie · Haupthalter:in');
    await family(p).getByLabel('Name').fill('Kyra');
    await family(p).getByLabel('Mithalter:in').check();
    await expect(family(p).getByRole('button', { name: 'Luna' })).toHaveAttribute('aria-pressed', 'true');
    await expect(family(p).getByRole('button', { name: 'Mio' })).toHaveAttribute('aria-pressed', 'true');
    await family(p).getByRole('button', { name: 'Einladung erstellen' }).click();
    await expect(family(p).locator('.invite-url')).toContainText('/einladung/');
    const token = fake.db.pet_invites![0]!.token as string;
    await expect(family(p).locator('.invite-url')).toContainText(token);
    await expect(family(p).getByRole('button', { name: 'Link kopieren' })).toBeVisible();
    await expect(family(p)).toContainText('Der Link gilt 7 Tage und nur für eine Person.');
    const row = family(p).locator('.member-row').filter({ hasText: 'Kyra' });
    await expect(row).toContainText('Mithalter:in · Luna');
    await expect(row).toContainText('Mio');
    await expect(row).toContainText('Eingeladen, gültig bis');
    expect(fake.db.pet_invites![0]).toMatchObject({ invitee_name: 'Kyra', role: 'carer' });
    expect(fake.db.pet_invite_pets).toHaveLength(2);
    expect(errors.get(p)!.concat().join(' ')).not.toContain(token);
  });

  test('Nur ansehen für ein Tier; Pflichtfelder, doppelte Einladung, Grenze von 5 Personen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    const f = family(p);
    await f.getByRole('button', { name: 'Einladung erstellen' }).click();
    await expect(f).toContainText('Bitte einen Namen angeben.');
    await expect(f.getByLabel('Name')).toBeFocused();
    await f.getByLabel('Name').fill('Oma Erika');
    await f.getByRole('button', { name: 'Luna' }).click();
    await f.getByRole('button', { name: 'Mio' }).click();
    await f.getByRole('button', { name: 'Einladung erstellen' }).click();
    await expect(f).toContainText('Bitte mindestens ein Tier auswählen.');
    await f.getByRole('button', { name: 'Luna' }).click();
    await f.getByLabel('Nur ansehen').check();
    await f.getByRole('button', { name: 'Einladung erstellen' }).click();
    await expect(f.locator('.member-row').filter({ hasText: 'Oma Erika' })).toContainText('Nur ansehen · Luna');
    expect(fake.db.pet_invites![0]).toMatchObject({ invitee_name: 'Oma Erika', role: 'viewer' });
    // gleicher Name nochmal
    await p.reload(); await p.waitForLoadState('networkidle');
    await f.getByLabel('Name').fill('oma erika');
    await f.getByRole('button', { name: 'Einladung erstellen' }).click();
    await expect(f).toContainText('Diese Person ist schon eingeladen.');
    // Grenze: 4 weitere offene + Oma = 5
    for (const n of ['P2', 'P3', 'P4', 'P5']) invite(fake, ahmed, n, 'viewer', [luna.id]);
    await p.reload(); await p.waitForLoadState('networkidle');
    await f.getByLabel('Name').fill('P6');
    await f.getByRole('button', { name: 'Einladung erstellen' }).click();
    await expect(f).toContainText('Es können höchstens 5 weitere Personen eingeladen werden.');
  });

  test('Einladung zurückziehen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    invite(fake, ahmed, 'Kyra', 'carer', [luna.id]);
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    await family(p).getByRole('button', { name: 'Einladung für Kyra zurückziehen' }).click();
    await expect(family(p).locator('.member-row').filter({ hasText: 'Kyra' })).toHaveCount(0);
    expect(fake.db.pet_invites).toHaveLength(0);
  });
});

test.describe('Annehmen (eingeladene Person)', () => {
  test('Link ohne Anmeldung → Anmeldung mit Hinweis → Einladung annehmen → beide Tiere da', async ({ browser }) => {
    const { fake, ahmed, luna, mio, kyra } = setup();
    const token = invite(fake, ahmed, 'Kyra', 'carer', [luna.id, mio.id]);
    const p = await openAs(browser, fake, null, `/einladung/${token}`);
    await expect(p).toHaveURL(/\/login/);
    await expect(p.getByText('Melden Sie sich an oder registrieren Sie sich, um die Einladung anzunehmen.')).toBeVisible();
    await p.getByLabel('E-Mail').fill('kyra@test.invalid');
    await p.getByRole('textbox', { name: 'Passwort', exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Anmelden' }).click();
    await expect(p).toHaveURL(new RegExp(`/einladung/${token}`));
    await expect(p.locator('#main')).toContainText('Ahmed lädt Sie ein,');
    await expect(p.locator('#main')).toContainText('Luna');
    await expect(p.locator('#main')).toContainText('Mio');
    await expect(p.locator('#main')).toContainText('Mithalter:in');
    await p.getByRole('button', { name: 'Annehmen' }).click();
    await expect(p.getByRole('heading', { name: 'Guten Tag, Kyra' })).toBeVisible();
    await expect(p.getByRole('group', { name: 'Tier wählen' }).getByRole('button')).toHaveCount(2);
    expect(fake.db.pet_members!.filter((m) => m.user_id === kyra.id).map((m) => m.role)).toEqual(['carer', 'carer']);
    expect(await p.evaluate(() => localStorage.getItem('pc-pending-invite'))).toBeNull();
  });

  test('Benutzte, abgelaufene, ungültige und eigene Einladungen', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const used = invite(fake, ahmed, 'X', 'carer', [luna.id]);
    fake.db.pet_invites!.find((i) => i.token === used)!.accepted_at = NOW.toISOString();
    fake.db.pet_invites!.find((i) => i.token === used)!.accepted_by = 'jemand';
    const old = invite(fake, ahmed, 'Y', 'carer', [luna.id]);
    fake.db.pet_invites!.find((i) => i.token === old)!.expires_at = '2026-10-01T00:00:00Z';
    const own = invite(fake, ahmed, 'Z', 'carer', [luna.id]);
    const k = await openAs(browser, fake, 'kyra@test.invalid', `/einladung/${used}`);
    await expect(k.locator('#main')).toContainText('Diese Einladung wurde schon verwendet.');
    await k.goto(`/einladung/${old}`);
    await expect(k.locator('#main')).toContainText('Diese Einladung ist abgelaufen.');
    await k.goto(`/einladung/${'f'.repeat(64)}`);
    await expect(k.locator('#main')).toContainText('Dieser Einladungslink ist ungültig.');
    const a = await openAs(browser, fake, 'ahmed@test.invalid', `/einladung/${own}`);
    await expect(a.locator('#main')).toContainText(/eigene Einladung|bereits/);
  });

  test('Abmelden löscht eine gemerkte Einladung', async ({ browser }) => {
    const { fake, ahmed, luna } = setup();
    const token = invite(fake, ahmed, 'Kyra', 'carer', [luna.id]);
    const p = await openAs(browser, fake, null, `/einladung/${token}`);
    await expect.poll(() => p.evaluate(() => localStorage.getItem('pc-pending-invite'))).toBe(token);
    await p.getByLabel('E-Mail').fill('oma@test.invalid');
    await p.getByRole('textbox', { name: 'Passwort', exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Anmelden' }).click();
    await expect(p).toHaveURL(/\/einladung\//);
    await expect(p.getByRole('button', { name: 'Annehmen' })).toBeVisible();
    await expect.poll(() => p.evaluate(() => localStorage.getItem('pc-pending-invite')), { message: 'Einladungsseite löscht den gemerkten Code' }).toBeNull();
    await p.goto('/mehr');
    await expect(p).toHaveURL(/\/mehr$/);
    await p.getByRole('button', { name: 'Abmelden' }).click();
    await expect(p).toHaveURL(/\/login/);
    expect(await p.evaluate(() => localStorage.getItem('pc-pending-invite'))).toBeNull();
  });
});

test.describe('Gemeinsamer Alltag und Rechte', () => {
  test('Kyra hakt ab → Ahmed sieht „erledigt von Kyra“', async ({ browser }) => {
    const { fake, kyra, luna } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    const k = await openAs(browser, fake, 'kyra@test.invalid');
    await k.getByRole('button', { name: 'Gassirunde um 07:00 als erledigt markieren' }).click();
    await expect(k.getByRole('button', { name: 'Gassirunde um 07:00 als erledigt markieren' })).toHaveAttribute('aria-pressed', 'true');
    const a = await openAs(browser, fake, 'ahmed@test.invalid');
    await expect(a.locator('.today-row').filter({ hasText: '07:00' })).toContainText('erledigt von Kyra');
    await expect(k.locator('.today-row').filter({ hasText: '07:00' })).not.toContainText('erledigt von');
  });

  test('Nur ansehen: kein Abhaken, kein Ändern, kein Foto; Haupthalter stuft hoch → Abhaken geht', async ({ browser }) => {
    const { fake, oma, luna } = setup();
    fake.addMember(luna.id, oma, 'viewer');
    const o = await openAs(browser, fake, 'oma@test.invalid');
    await expect(o.locator('#main')).toContainText('Nur ansehen: Abhaken ist für Sie nicht freigeschaltet.');
    const check = o.getByRole('button', { name: 'Gassirunde um 07:00 als erledigt markieren' });
    await expect(check).toHaveAttribute('aria-disabled', 'true');
    await check.click({ force: true });
    expect(fake.db.routine_done).toHaveLength(0);
    await o.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await o.locator('#main').getByRole('link', { name: 'Alltag', exact: true }).click(); // seit Auftrag 08 unter „Mehr“
    await expect(o.locator('.routine-row')).toHaveCount(4);
    await expect(o.getByRole('switch')).toHaveCount(0);
    await expect(o.getByRole('button', { name: 'Eintrag hinzufügen' })).toHaveCount(0);
    await expect(o.getByRole('button', { name: /löschen$/ })).toHaveCount(0);
    await nav(o, 'Tier').click();
    await expect(o.locator('#main')).toContainText('Haupthalter:in: Ahmed');
    await expect(o.locator('#main')).toContainText('Ihre Rechte: Nur ansehen');
    await expect(o.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(o.getByText('Foto hinzufügen')).toHaveCount(0);
    await expect(o.getByRole('button', { name: 'Tier löschen' })).toHaveCount(0);
    // Ahmed ändert die Rechte
    const a = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    await family(a).getByRole('button', { name: 'Rechte von Oma Erika ändern' }).click();
    const dlg = a.getByRole('dialog', { name: 'Rechte von Oma Erika ändern' });
    await dlg.getByLabel('Mithalter:in').check();
    await dlg.getByRole('button', { name: 'Speichern' }).click();
    await expect(family(a).locator('.member-row').filter({ hasText: 'Oma Erika' })).toContainText('Mithalter:in');
    expect(fake.db.pet_members!.find((m) => m.user_id === oma.id)!.role).toBe('carer');
    await o.goto('/'); await o.waitForLoadState('networkidle');
    await o.getByRole('button', { name: 'Gassirunde um 07:00 als erledigt markieren' }).click();
    await expect.poll(() => fake.db.routine_done!.length).toBe(1);
  });

  test('Mithalterin darf ändern, aber nicht einladen und nicht löschen', async ({ browser }) => {
    const { fake, kyra, luna } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    const k = await openAs(browser, fake, 'kyra@test.invalid', '/tier');
    await expect(k.getByRole('button', { name: 'Bearbeiten' })).toBeVisible();
    await expect(k.getByRole('button', { name: 'Tier löschen' })).toHaveCount(0);
    await nav(k, 'Mehr').click();
    await expect(family(k)).toContainText('Mit Ihnen geteilt');
    await expect(family(k)).toContainText('Luna');
    await expect(family(k).getByRole('button', { name: 'Einladung erstellen' })).toHaveCount(0);
  });

  test('Ahmed entfernt Kyra → Kyra hat danach keinen Zugriff mehr', async ({ browser }) => {
    const { fake, kyra, luna, mio } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    fake.addMember(mio.id, kyra, 'viewer');
    const a = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    const row = family(a).locator('.member-row').filter({ hasText: 'Kyra' });
    await expect(row).toContainText('Luna: Mithalter:in');
    await expect(row).toContainText('Mio: Nur ansehen');
    await row.getByRole('button', { name: 'Kyra entfernen' }).click();
    const dlg = a.getByRole('dialog');
    await expect(dlg).toContainText('Kyra wirklich entfernen?');
    await dlg.getByRole('button', { name: 'Abbrechen' }).click();
    expect(fake.db.pet_members!.filter((m) => m.user_id === kyra.id)).toHaveLength(2);
    await row.getByRole('button', { name: 'Kyra entfernen' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Ja, entfernen' }).click();
    await expect(family(a).locator('.member-row').filter({ hasText: 'Kyra' })).toHaveCount(0);
    expect(fake.db.pet_members!.filter((m) => m.user_id === kyra.id)).toHaveLength(0);
    const k = await openAs(browser, fake, 'kyra@test.invalid');
    await expect(k).toHaveURL(/\/tier\/neu/);
  });

  test('Kyra beendet die Betreuung selbst', async ({ browser }) => {
    const { fake, kyra, luna } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    const k = await openAs(browser, fake, 'kyra@test.invalid', '/mehr');
    await family(k).getByRole('button', { name: 'Betreuung von Luna beenden' }).click();
    await k.getByRole('dialog').getByRole('button', { name: 'Betreuung beenden' }).click();
    await expect.poll(() => fake.db.pet_members!.filter((m) => m.user_id === kyra.id).length).toBe(0);
  });

  test('Haupthalter löscht ein geteiltes Tier → für alle weg', async ({ browser }) => {
    const { fake, kyra, luna } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    const a = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    await a.getByRole('group', { name: 'Tier wählen' }).getByRole('button', { name: 'Luna' }).click();
    await a.getByRole('button', { name: 'Tier löschen' }).click();
    const dlg = a.getByRole('dialog');
    await expect(dlg).toContainText('Luna und alle Einträge werden für alle Betreuer gelöscht.');
    await dlg.getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect.poll(() => fake.db.pets!.some((p) => p.id === luna.id)).toBe(false);
    expect(fake.db.pet_members!.filter((m) => m.pet_id === luna.id)).toHaveLength(0);
    expect(fake.db.routine_items!.filter((r) => r.pet_id === luna.id)).toHaveLength(0);
  });
});

test.describe('Tierfoto', () => {
  test('Foto hochladen, überall sichtbar, für Nur-ansehen nur sichtbar, dann entfernen', async ({ browser }) => {
    const { fake, oma, luna } = setup();
    fake.addMember(luna.id, oma, 'viewer');
    const a = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    await a.getByRole('group', { name: 'Tier wählen' }).getByRole('button', { name: 'Luna' }).click();
    await a.locator('input[type="file"]').setInputFiles(JPG);
    await expect(a.getByRole('status').filter({ hasText: 'Foto von Luna gespeichert.' })).toHaveCount(1);
    const pet = fake.db.pets!.find((p) => p.id === luna.id)!;
    expect(String(pet.photo_path)).toMatch(new RegExp(`^${luna.id}/[0-9a-f-]+\\.jpg$`));
    expect(fake.files.has(`pet-photos/${pet.photo_path}`)).toBe(true);
    const upload = fake.calls.find((c) => c.path.startsWith('/storage/v1/object/pet-photos/'));
    expect(upload).toBeTruthy();
    await expect(a.getByRole('img', { name: 'Foto von Luna' }).first()).toBeVisible();
    await expect(a.getByRole('button', { name: 'Foto ändern' }).or(a.getByText('Foto ändern'))).toHaveCount(1);
    // zweites Foto ersetzt das erste, alte Datei wird gelöscht
    const first = String(pet.photo_path);
    await a.locator('input[type="file"]').setInputFiles(JPG);
    await expect.poll(() => fake.db.pets!.find((p) => p.id === luna.id)!.photo_path).not.toBe(first);
    expect(fake.files.has(`pet-photos/${first}`)).toBe(false);
    expect(fake.files.size).toBe(1);
    // Oma sieht das Foto, darf es aber nicht ändern
    const o = await openAs(browser, fake, 'oma@test.invalid', '/tier');
    await expect(o.getByRole('img', { name: 'Foto von Luna' }).first()).toBeVisible();
    await expect(o.locator('input[type="file"]')).toHaveCount(0);
    // entfernen
    await a.getByRole('button', { name: 'Foto entfernen' }).click();
    await expect.poll(() => fake.db.pets!.find((p) => p.id === luna.id)!.photo_path).toBeNull();
    await expect.poll(() => fake.files.size).toBe(0);
  });

  test('Kein Bild wird abgewiesen, ohne etwas hochzuladen', async ({ browser }) => {
    const { fake } = setup();
    const a = await openAs(browser, fake, 'ahmed@test.invalid', '/tier');
    await a.locator('input[type="file"]').setInputFiles(PDF);
    await expect(a.locator('#main')).toContainText('Das ist kein Bild.');
    expect(fake.files.size).toBe(0);
  });
});

test.describe('Darstellung', () => {
  test('320 px: Mehr mit Familie-Karte und Einladungsseite ohne seitliches Scrollen', async ({ browser }) => {
    const { fake, ahmed, kyra, luna, mio } = setup();
    fake.addMember(luna.id, kyra, 'carer');
    invite(fake, ahmed, 'Oma Erika mit sehr langem Namen', 'viewer', [luna.id, mio.id]);
    const a = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    await a.setViewportSize({ width: 320, height: 800 });
    await expect(family(a).locator('.member-row')).toHaveCount(3);
    expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const tok = invite(fake, ahmed, 'Kyra2', 'carer', [luna.id, mio.id]);
    const o = await openAs(browser, fake, 'oma@test.invalid', `/einladung/${tok}`);
    await o.setViewportSize({ width: 320, height: 800 });
    await expect(o.getByRole('button', { name: 'Annehmen' })).toBeVisible();
    expect(await o.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
