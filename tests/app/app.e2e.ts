import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

/** Freitag, 16.10.2026, 10:00 Uhr Berlin */
const NOW = new Date('2026-10-16T10:00:00+02:00');
const PW = 'Testpasswort-123';

let consoleErrors: string[] = [];

async function start(page: Page, fake = new FakeSupabase()) {
  consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.clock.setFixedTime(NOW);
  await fake.install(page);
  return fake;
}

async function login(page: Page, email: string, pw = PW) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: false }).first().fill(pw);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

/** Angemeldet mit einem Hund samt Vorlage */
async function withDog(page: Page) {
  const fake = await start(page);
  fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  await login(page, 'ahmed@test.invalid');
  await expect(page.getByRole('heading', { name: 'Ihr erstes Tier' })).toBeVisible();
  await page.getByLabel('Name des Tieres').fill('Luna');
  await page.getByRole('button', { name: 'Tier speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Guten Tag, Ahmed' })).toBeVisible();
  return fake;
}

test.afterEach(() => {
  expect(consoleErrors.filter((e) => !/Failed to load resource|simulierter Fehler/.test(e)), 'keine Fehler in der Konsole').toEqual([]);
});

test.describe('Anmeldung', () => {
  test('Ohne Sitzung geht es zur Anmeldung, Seite ist auf Deutsch', async ({ page }) => {
    await start(page);
    await page.goto('/alltag');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('Registrierung: Pflichtfelder, Passwortlänge, dann Bestätigungshinweis mit Name und Sprache', async ({ page }) => {
    const fake = await start(page);
    await page.goto('/registrieren');
    await page.getByRole('button', { name: 'Konto erstellen' }).click();
    const name = page.getByLabel('Anzeigename');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await name.fill('Ahmed');
    await page.getByLabel('E-Mail').fill('kein-at');
    await page.getByLabel('Passwort').fill('kurz');
    await page.getByRole('button', { name: 'Konto erstellen' }).click();
    await expect(page.getByText('Bitte eine gültige E-Mail-Adresse eingeben.')).toBeVisible();
    await expect(page.getByText('Das Passwort braucht mindestens 8 Zeichen.')).toBeVisible();
    await page.getByLabel('E-Mail').fill('ahmed@test.invalid');
    await page.getByLabel('Passwort').fill(PW);
    await page.getByRole('button', { name: 'Konto erstellen' }).click();
    await expect(page.getByRole('heading', { name: 'Fast geschafft' })).toBeVisible();
    await expect(page.getByText('ahmed@test.invalid')).toBeVisible();
    const signup = fake.calls.find((c) => c.path.startsWith('/auth/v1/signup'))!.body as { data: Record<string, string> };
    expect(signup.data).toEqual({ display_name: 'Ahmed', language: 'de' });
    expect(fake.rows('profiles')[0]).toMatchObject({ display_name: 'Ahmed', language: 'de' });
  });

  test('Anmeldung: unbestätigt, falsches Passwort, dann Erfolg und erstes Tier', async ({ page }) => {
    const fake = await start(page);
    fake.seedUser('ahmed@test.invalid', PW, 'Ahmed', 'de', false);
    await login(page, 'ahmed@test.invalid');
    await expect(page.getByRole('alert')).toContainText('Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse');
    fake.confirm('ahmed@test.invalid');
    await page.getByLabel('Passwort').fill('falsch-falsch');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByText('E-Mail-Adresse oder Passwort stimmt nicht.')).toBeVisible();
    await expect(page.getByLabel('Passwort')).toBeFocused();
    await page.getByLabel('Passwort').fill(PW);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page).toHaveURL(/\/tier\/neu$/);
    await expect(page.getByRole('heading', { name: 'Ihr erstes Tier' })).toBeVisible();
  });

  test('Passwort vergessen schickt den Link und verrät nicht, ob das Konto existiert', async ({ page }) => {
    const fake = await start(page);
    await page.goto('/login');
    await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
    await page.getByLabel('E-Mail').fill('wer@test.invalid');
    await page.getByRole('button', { name: 'Link senden' }).click();
    await expect(page.getByRole('status')).toContainText('Falls ein Konto zu dieser Adresse besteht');
    expect(fake.calls.some((c) => c.path.startsWith('/auth/v1/recover'))).toBe(true);
  });
});

test.describe('Erstes Tier', () => {
  test.beforeEach(async ({ page }) => {
    const fake = await start(page);
    fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
    await login(page, 'ahmed@test.invalid');
    await expect(page.getByRole('heading', { name: 'Ihr erstes Tier' })).toBeVisible();
  });

  test('8 Tierarten, Hund vorausgewählt, Vorlage sichtbar mit Hinweis', async ({ page }) => {
    const tiles = page.getByRole('group', { name: 'Welches Tier?' }).getByRole('button');
    await expect(tiles).toHaveText(['Hund', 'Katze', 'Kaninchen', 'Meer\u00ADschwein\u00ADchen', 'Vogel', 'Reptil', 'Pferd', 'Anderes Tier']);
    await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Vorschlag, noch nicht tierärztlich geprüft.')).toBeVisible();
    await expect(page.locator('.tpl-list li')).toHaveCount(6);
    await tiles.filter({ hasText: 'Kaninchen' }).click();
    await expect(page.locator('.tpl-list li')).toHaveCount(3);
    await expect(page.locator('.tpl-list')).toContainText('Sa und So');
  });

  test('Name fehlt: Fehler am Feld und Fokus darauf', async ({ page }) => {
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByLabel('Name des Tieres')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Name des Tieres')).toBeFocused();
  });

  test('Anderes Tier braucht eine Tierart, wird dann ohne Plan gespeichert', async ({ page }) => {
    await page.getByLabel('Name des Tieres').fill('Shelly');
    await page.getByRole('button', { name: 'Anderes Tier' }).click();
    await expect(page.getByText('Für diese Tierart gibt es keine Vorlage.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByText('Bitte geben Sie die Tierart an.')).toBeVisible();
    await page.getByLabel('Welche Tierart?').fill('Schildkröte');
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByText('Für heute ist nichts geplant.').first()).toBeVisible();
  });

  test('Katze als Freigänger und Pferd mit Stall werden richtig gespeichert', async ({ page }) => {
    await page.getByLabel('Name des Tieres').fill('Minka');
    await page.getByRole('button', { name: 'Katze' }).click();
    await page.getByLabel('Freigänger').check();
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Guten Tag, Ahmed' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Tier' }).click();
    await expect(page.locator('.kv').first()).toContainText('Freigänger');
  });

  test('Vorlage abwählen legt das Tier ohne Tagesplan an', async ({ page }) => {
    await page.getByLabel('Name des Tieres').fill('Luna');
    await page.getByRole('switch', { name: 'Tagesplan-Vorlage übernehmen' }).click();
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByText('Für heute ist nichts geplant.').first()).toBeVisible();
  });

  test('Chipnummer und Geburtsdatum werden geprüft', async ({ page }) => {
    await page.getByLabel('Name des Tieres').fill('Luna');
    await page.getByLabel('Transpondernummer (optional)').fill('1234');
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByText('Die Transpondernummer hat 15 Ziffern.')).toBeVisible();
    await expect(page.getByLabel('Transpondernummer (optional)')).toBeFocused();
    await page.getByLabel('Transpondernummer (optional)').fill('276 098 100 123 456');
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Guten Tag, Ahmed' })).toBeVisible();
  });

});

test('Speicherfehler beim Tagesplan: Meldung, Tier wird nicht halb angelegt', async ({ page }) => {
  const fake = await start(page);
  fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  await login(page, 'ahmed@test.invalid');
  await page.getByLabel('Name des Tieres').fill('Luna');
  fake.failNext.routine_items = true;
  await page.getByRole('button', { name: 'Tier speichern' }).click();
  await expect(page.getByText('Das hat nicht geklappt. Bitte versuchen Sie es erneut.')).toBeVisible();
  expect(fake.rows('pets')).toHaveLength(0);
  await page.getByRole('button', { name: 'Tier speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Guten Tag, Ahmed' })).toBeVisible();
  expect(fake.rows('pets')).toHaveLength(1);
  consoleErrors = [];
});

test.describe('Heute', () => {
  test('Als Nächstes: Gassirunde 12:30 in 2 Std. 30 Min., Erledigt speichert', async ({ page }) => {
    const fake = await withDog(page);
    const next = page.locator('.next-card');
    await expect(next).toContainText('Gassirunde');
    await expect(next).toContainText('12:30');
    await expect(next).toContainText('in 2 Std. 30 Min.');
    await expect(page.locator('.today-row')).toHaveCount(6);
    await next.getByRole('button', { name: 'Erledigt' }).click();
    await expect(next).toContainText('18:00');
    expect(fake.rows('routine_done')).toHaveLength(1);
    expect(fake.rows('routine_done')[0]).toMatchObject({ done_on: '2026-10-16' });
    await expect(page.getByRole('status')).toContainText('Gassirunde um 12:30 Uhr erledigt.');
  });

  test('Häkchen in der Liste an und wieder aus', async ({ page }) => {
    const fake = await withDog(page);
    const btn = page.getByRole('button', { name: 'Gassirunde um 07:00 als erledigt markieren' });
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(fake.rows('routine_done')).toHaveLength(1);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(fake.rows('routine_done')).toHaveLength(0);
  });

  test('Erledigt bleibt nach Neuladen erhalten', async ({ page }) => {
    await withDog(page);
    await page.getByRole('button', { name: 'Füttern um 07:30 als erledigt markieren' }).click();
    await expect(page.getByRole('button', { name: 'Füttern um 07:30 als erledigt markieren' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Füttern um 07:30 als erledigt markieren' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Alltag', () => {
  test.beforeEach(async ({ page }) => {
    const fake = await withDog(page);
    (page as unknown as { fake: FakeSupabase }).fake = fake;
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await page.locator('#main').getByRole('link', { name: 'Alltag', exact: true }).click(); // seit Auftrag 08 unter „Mehr“
    await expect(page.getByRole('heading', { name: 'Alltag', level: 1 })).toBeVisible();
  });
  const fakeOf = (page: Page) => (page as unknown as { fake: FakeSupabase }).fake;

  test('Plan zeigt 6 Einträge und den Push-Hinweis', async ({ page }) => {
    await expect(page.locator('.routine-row')).toHaveCount(6);
    await expect(page.getByText('Echte Push-Erinnerungen kommen')).toBeVisible();
  });

  test('Erinnerung einzeln aus, dann alle aus und wieder an', async ({ page }) => {
    const fake = fakeOf(page);
    const one = page.getByRole('switch', { name: 'Erinnerung für Gassirunde, 12:30' });
    await one.click();
    await expect(one).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => fake.rows('routine_items').filter((r) => r.reminder_on === false).length).toBe(1);
    const all = page.getByRole('switch', { name: 'Alle Erinnerungen' });
    await expect(all).toHaveAttribute('aria-checked', 'false');
    await all.click();
    await expect(all).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => fake.rows('routine_items').every((r) => r.reminder_on === true)).toBe(true);
    await all.click();
    await expect.poll(() => fake.rows('routine_items').every((r) => r.reminder_on === false)).toBe(true);
    await expect(page.getByRole('status')).toContainText('Alle Erinnerungen für Luna sind aus.');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Alle Erinnerungen' })).toHaveAttribute('aria-checked', 'false');
  });

  test('Eigenen Eintrag hinzufügen: Pflichtfelder, Speichern, Doppelt verhindert', async ({ page }) => {
    const fake = fakeOf(page);
    await page.getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await expect(page.getByLabel('Woran sollen wir Sie erinnern?')).toBeFocused();
    await page.getByLabel('Woran sollen wir Sie erinnern?').selectOption('own');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.getByText('Bitte wählen Sie eine Uhrzeit.')).toBeVisible();
    await page.getByLabel('Uhrzeit').fill('09:15');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.getByLabel('Wofür? (z. B. Fell bürsten)')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Wofür? (z. B. Fell bürsten)').fill('Fell bürsten');
    await page.getByLabel('Wie oft?').selectOption('weekends');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.locator('.routine-row')).toHaveCount(7);
    await expect(page.locator('.routine-row').nth(2)).toContainText('Fell bürsten');
    await expect(page.locator('.routine-row').nth(2)).toContainText('Sa und So');
    expect(fake.rows('routine_items').find((r) => r.label === 'Fell bürsten')).toMatchObject({ kind: 'own', time_of_day: '09:15:00', repeat: 'weekends' });
    // gleicher Eintrag nochmal
    await page.getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await page.getByLabel('Woran sollen wir Sie erinnern?').selectOption('walk');
    await page.getByLabel('Uhrzeit').fill('07:00');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.getByText('Diese Erinnerung gibt es zu dieser Uhrzeit schon.')).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.locator('.routine-row')).toHaveCount(7);
  });

  test('Eintrag am Wochenende erscheint Freitag nicht unter Heute', async ({ page }) => {
    await page.getByRole('button', { name: 'Eintrag hinzufügen' }).click();
    await page.getByLabel('Woran sollen wir Sie erinnern?').selectOption('med');
    await page.getByLabel('Uhrzeit').fill('11:00');
    await page.getByLabel('Wie oft?').selectOption('weekends');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(page.locator('.routine-row')).toHaveCount(7);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Heute' }).click();
    await expect(page.locator('.today-row')).toHaveCount(6);
    await expect(page.locator('.next-card')).toContainText('12:30');
  });

  test('Löschen fragt im Dialog, Abbrechen behält, Ja löscht', async ({ page }) => {
    const fake = fakeOf(page);
    await page.getByRole('button', { name: 'Gassirunde, 21:30 löschen' }).click();
    const dlg = page.getByRole('dialog', { name: 'Eintrag löschen?' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Gassirunde (21:30) wirklich aus dem Plan löschen?');
    await dlg.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: 'Gassirunde, 21:30 löschen' })).toBeFocused();
    await page.getByRole('button', { name: 'Gassirunde, 21:30 löschen' }).click();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await page.getByRole('button', { name: 'Gassirunde, 21:30 löschen' }).click();
    await dlg.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect(page.locator('.routine-row')).toHaveCount(5);
    expect(fake.rows('routine_items')).toHaveLength(5);
  });

  test('Fehler beim Schalten wird zurückgenommen und gemeldet', async ({ page }) => {
    const fake = fakeOf(page);
    await expect(page.locator('.routine-row')).toHaveCount(6);
    await page.waitForLoadState('networkidle');
    fake.failNext.routine_items = true;
    const one = page.getByRole('switch', { name: 'Erinnerung für Gassirunde, 12:30' });
    await one.click();
    await expect(one).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('status')).toContainText('Das hat nicht geklappt.');
    consoleErrors = [];
  });
});

test.describe('Tier, Mehr, Notfall, Termine', () => {
  test('Tier bearbeiten, Notfallkontakt wird auf der Notfallseite mit Anruf-Knopf gezeigt', async ({ page }) => {
    const fake = await withDog(page);
    await page.getByRole('link', { name: 'Notfall: Hilfe und Notfallkontakt' }).click();
    await expect(page.getByRole('heading', { name: 'Im Notfall: Tierärztlichen Notdienst anrufen' })).toBeVisible();
    await expect(page.getByText('Für Luna ist noch kein Notfallkontakt hinterlegt.')).toBeVisible();
    await page.getByRole('link', { name: 'Notfallkontakt eintragen' }).click();
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Rasse').fill('Labrador');
    await page.getByLabel('Geschlecht').selectOption('female');
    await page.getByRole('textbox', { name: /^Notfallkontakt/ }).fill('Tierarztpraxis Muster, 06142 123456');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.page-head')).toContainText('Hund · Labrador');
    await expect(page.locator('.kv').first()).toContainText('weiblich');
    expect(fake.rows('pets')[0]).toMatchObject({ breed: 'Labrador', sex: 'female' });
    await page.getByRole('link', { name: 'Notfall: Hilfe und Notfallkontakt' }).click();
    await expect(page.getByRole('link', { name: /anrufen$/ })).toHaveAttribute('href', 'tel:06142123456');
  });

  test('Weiteres Tier: Umschalter erscheint, Heute zeigt Plan des gewählten Tiers', async ({ page }) => {
    await withDog(page);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Tier' }).click();
    await page.getByRole('link', { name: 'Weiteres Tier anlegen' }).click();
    await expect(page.getByRole('heading', { name: 'Weiteres Tier anlegen' })).toBeVisible();
    await page.getByLabel('Name des Tieres').fill('Hoppel');
    await page.getByRole('button', { name: 'Kaninchen' }).click();
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    const sw = page.getByRole('group', { name: 'Tier wählen' });
    await expect(sw.getByRole('button', { name: 'Hoppel' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.today-row')).toHaveCount(2); // Freitag: 2× Füttern, Gehege nur am Wochenende
    await sw.getByRole('button', { name: 'Luna' }).click();
    await expect(page.locator('.today-row')).toHaveCount(6);
  });

  test('Sprache ändern speichert im Profil und stellt die App um', async ({ page }) => {
    const fake = await withDog(page);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await expect(page.getByText('Angemeldet als ahmed@test.invalid')).toBeVisible();
    await page.getByLabel('Bevorzugte Sprache').selectOption('en');
    await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
    await expect.poll(() => fake.rows('profiles')[0]!.language).toBe('en');
    await page.getByRole('combobox', { name: 'Preferred language' }).selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  });

  test('Abmelden führt zur Anmeldung, geschützte Seiten sind danach zu', async ({ page }) => {
    await withDog(page);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/alltag');
    await expect(page).toHaveURL(/\/login$/);
  });

  // Seit Auftrag 06 ersetzt die Termin-Seite den Platzhalter (Details in termine.e2e.ts)
  test('Termine zeigt ohne Einträge den leeren Zustand und „Termin eintragen“', async ({ page }) => {
    await withDog(page);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Termine' }).click();
    await expect(page.getByRole('heading', { name: 'Termine', level: 1 })).toBeVisible();
    await expect(page.getByText('Keine Termine geplant.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Termin eintragen' })).toBeVisible();
    await expect(page.getByText('Kommt bald: Termine bei Ihrer Praxis')).toHaveCount(0);
  });
});

test.describe('Zwei Konten im selben Browser (wie Ihr Test mit Ihrer Partnerin)', () => {
  test('Nach Abmelden sieht das zweite Konto nichts vom ersten', async ({ page }) => {
    const fake = await withDog(page);
    fake.seedUser('partnerin@test.invalid', PW, 'Sara');
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await login(page, 'partnerin@test.invalid');
    await expect(page.getByRole('heading', { name: 'Ihr erstes Tier' })).toBeVisible();
    await expect(page.getByText('Luna')).toHaveCount(0);
    await page.getByLabel('Name des Tieres').fill('Mio');
    await page.getByRole('button', { name: 'Katze' }).click();
    await page.getByRole('button', { name: 'Tier speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Guten Tag, Sara' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Tier wählen' })).toHaveCount(0);
    await expect(page.locator('.today-row')).toHaveCount(3);
  });
});

test('Link aufrufen ohne Anmeldung: nach dem Login zurück auf dieselbe Seite', async ({ page }) => {
  const fake = await start(page);
  const u = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  fake.seedPet(u, { name: 'Luna', species: 'dog' });
  await page.goto('/alltag');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('E-Mail').fill('ahmed@test.invalid');
  await page.getByLabel('Passwort').fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/alltag$/);
});

test.describe('Darstellung', () => {
  for (const path of ['/', '/alltag', '/tier', '/tier/neu', '/mehr', '/notfall']) {
    test(`320 px ohne seitliches Scrollen: ${path}`, async ({ page }) => {
      await withDog(page);
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
  }
  test('Desktop ab 900 px: Navigation links', async ({ page }) => {
    await withDog(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    const box = await page.getByRole('navigation', { name: 'Hauptnavigation' }).boundingBox();
    expect(box!.x).toBeLessThan(10);
    expect(box!.height).toBeGreaterThan(500);
  });
  test('Bedienelemente mindestens 44 px hoch', async ({ page }) => {
    await withDog(page);
    await page.goto('/alltag');
    await expect(page.locator('.routine-row')).toHaveCount(6);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, a, [role=switch], input, select')]
        .filter((e) => (e as HTMLElement).offsetParent !== null && !e.closest('.sr-only') && !e.classList.contains('skip-link'))
        .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
        .filter((r) => r.h < 44 || r.w < 44),
    );
    expect(small).toEqual([]);
  });
});
