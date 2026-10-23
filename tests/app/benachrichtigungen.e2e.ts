import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

/**
 * Benachrichtigungen (Auftrag 10). Ohne echten Push-Dienst: navigator.serviceWorker und pushManager werden im Browser
 * durch einen Stub ersetzt, der Aufrufe mitschreibt (window.__push). Die Anmeldung beim Konto läuft über das Fake-Supabase.
 */

const NOW = new Date('2026-10-16T10:00:00+02:00');
const PW = 'Testpasswort-123';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-geraet-123';
const errors = new Map<Page, string[]>();
test.setTimeout(60_000);

type Perm = 'granted' | 'denied' | 'default';

/** Stub für Service Worker + PushManager + Notification-Berechtigung. Die Anmeldung überlebt Neuladen (localStorage). */
function pushStub(perm: Perm) {
  return ({ perm, endpoint }: { perm: Perm; endpoint: string }) => {
    const state = { perm, requested: 0, subscribeCalls: [] as unknown[], shown: [] as unknown[], unsub: 0 };
    (window as unknown as { __push: typeof state }).__push = state;
    const makeSub = () => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'BPublicKeyFromTheBrowser0123456789abcdefgh', auth: 'authSecret123' } }),
      getKey: () => null,
      unsubscribe: async () => {
        localStorage.removeItem('__fakePushSub');
        state.unsub++;
        return true;
      },
    });
    const pushManager = {
      getSubscription: async () => (localStorage.getItem('__fakePushSub') ? makeSub() : null),
      subscribe: async (o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
        const k = new Uint8Array(o.applicationServerKey);
        state.subscribeCalls.push({ userVisibleOnly: o.userVisibleOnly, length: k.length, first: k[0] });
        localStorage.setItem('__fakePushSub', '1');
        return makeSub();
      },
    };
    const reg = { scope: location.origin + '/', pushManager, showNotification: async (title: string, opts: unknown) => void state.shown.push({ title, ...(opts as object) }) };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg), register: async () => reg, addEventListener() {}, controller: null },
    });
    Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => state.perm });
    window.Notification.requestPermission = (async () => {
      state.requested++;
      if (state.perm === 'default') state.perm = 'denied';
      return state.perm;
    }) as typeof Notification.requestPermission;
  };
}

async function openAs(browser: Browser, fake: FakeSupabase, email: string, url: string, o: { perm?: Perm; ctx?: BrowserContextOptions; stub?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, ...o.ctx });
  if (o.perm === 'granted') await ctx.grantPermissions(['notifications']);
  if (o.stub !== false) await ctx.addInitScript(pushStub(o.perm ?? 'default'), { perm: o.perm ?? 'default', endpoint: ENDPOINT });
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
  await page.getByLabel('Passwort').fill(PW);
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
  fake.seedPet(ahmed, { name: 'Luna', species: 'dog' });
  return { fake, ahmed };
}

const main = (p: Page) => p.locator('#main');
const pushState = <T>(p: Page) => p.evaluate(() => (window as unknown as { __push: unknown }).__push) as Promise<T>;
const status = (p: Page, text: string | RegExp) => p.getByRole('status').filter({ hasText: text });
const deviceSection = (p: Page) => main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Meine Geräte' }) });
const rpcCalls = (fake: FakeSupabase, fn: string) => fake.calls.filter((c) => c.path === `/rest/v1/rpc/${fn}`);

test.afterEach(async () => {
  for (const [page, list] of errors) expect(list.filter((e) => !/Failed to load resource/.test(e)), `keine Fehler in der Konsole (${page.url()})`).toEqual([]);
  errors.clear();
});

test.describe('Dieses Gerät', () => {
  test('Aktivieren erst nach Klick → subscribe mit Schlüssel, register_push mit Endpoint/Keys, Status „aktiv“, Gerät in der Liste', async ({ browser }) => {
    const { fake, ahmed } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr', { perm: 'granted' });
    await main(p).getByRole('link', { name: 'Benachrichtigungen' }).click();
    await expect(p).toHaveURL(/\/mehr\/benachrichtigungen$/);
    await expect(main(p).getByRole('heading', { name: 'Benachrichtigungen', level: 1 })).toBeVisible();
    await expect(main(p)).toContainText('Noch nicht aktiviert');
    expect((await pushState<{ requested: number }>(p)).requested).toBe(0); // nie automatisch fragen
    await expect(main(p)).toContainText('Benachrichtigungen enthalten Tiername, Medikament und Uhrzeit. Sie werden verschlüsselt übertragen. Auf dem Sperrbildschirm sind sie je nach Handy-Einstellung sichtbar.');
    await main(p).getByRole('button', { name: 'Benachrichtigungen auf diesem Gerät aktivieren' }).click();
    await expect(status(p, 'Benachrichtigungen sind aktiv.')).toHaveCount(1);
    await expect(main(p)).toContainText('Auf diesem Gerät aktiv');
    const st = await pushState<{ requested: number; subscribeCalls: { userVisibleOnly: boolean; length: number; first: number }[] }>(p);
    expect(st.requested).toBe(1);
    expect(st.subscribeCalls).toEqual([{ userVisibleOnly: true, length: 65, first: 4 }]);
    expect(rpcCalls(fake, 'vapid_public_key')).toHaveLength(1);
    expect(rpcCalls(fake, 'register_push').map((c) => c.body)).toEqual([{ p_endpoint: ENDPOINT, p_p256dh: 'BPublicKeyFromTheBrowser0123456789abcdefgh', p_auth: 'authSecret123', p_label: 'Android · Chrome' }]);
    expect(fake.db.push_subscriptions).toMatchObject([{ user_id: ahmed.id, endpoint: ENDPOINT, device_label: 'Android · Chrome' }]);
    const dev = deviceSection(p).locator('li');
    await expect(dev).toHaveCount(1);
    await expect(dev).toContainText('Android · Chrome');
    await expect(dev).toContainText('dieses Gerät');
    await expect(dev).toContainText('angemeldet am 16.10.2026 · zuletzt erreicht am noch nie');
    await expect(main(p).getByRole('button', { name: 'Auf diesem Gerät ausschalten' })).toBeFocused();
    // nach Neuladen weiterhin aktiv
    await p.reload(); await p.waitForLoadState('networkidle');
    await expect(main(p)).toContainText('Auf diesem Gerät aktiv');
  });

  test('Ausschalten → abgemeldet und Gerät weg; anderes Gerät „Entfernen“', async ({ browser }) => {
    const { fake, ahmed } = setup();
    fake.db.push_subscriptions!.push({ id: 'b0000000-0000-4000-8000-000000000001', user_id: ahmed.id, endpoint: 'https://push.example/alt', p256dh: 'x'.repeat(30), auth: 'y'.repeat(10), device_label: 'Windows · Firefox', created_at: '2026-10-01T08:00:00Z', last_ok_at: '2026-10-15T07:00:00Z', failures: 0 });
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { perm: 'granted' });
    await main(p).getByRole('button', { name: 'Benachrichtigungen auf diesem Gerät aktivieren' }).click();
    await expect(deviceSection(p).locator('li')).toHaveCount(2);
    await expect(deviceSection(p).locator('li').first()).toContainText('Windows · Firefox');
    await expect(deviceSection(p).locator('li').first()).toContainText('angemeldet am 01.10.2026 · zuletzt erreicht am 15.10.2026');
    await expect(deviceSection(p).locator('li').first()).not.toContainText('dieses Gerät');
    await main(p).getByRole('button', { name: 'Auf diesem Gerät ausschalten' }).click();
    await expect(status(p, 'Benachrichtigungen auf diesem Gerät ausgeschaltet.')).toHaveCount(1);
    await expect(main(p)).toContainText('Noch nicht aktiviert');
    expect((await pushState<{ unsub: number }>(p)).unsub).toBe(1);
    expect(fake.db.push_subscriptions!.map((d) => d.device_label)).toEqual(['Windows · Firefox']);
    await deviceSection(p).getByRole('button', { name: 'Gerät Windows · Firefox entfernen' }).click();
    await expect(status(p, 'Gerät Windows · Firefox entfernt.')).toHaveCount(1);
    await expect(deviceSection(p)).toContainText('Noch kein Gerät angemeldet.');
    expect(fake.db.push_subscriptions).toHaveLength(0);
  });

  test('Berechtigung verweigert → Hinweistext und Anleitung statt Fehler', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { perm: 'default' });
    await main(p).getByRole('button', { name: 'Benachrichtigungen auf diesem Gerät aktivieren' }).click();
    await expect(status(p, 'Sie haben Benachrichtigungen nicht erlaubt. Sie können das in den Einstellungen des Handys ändern.')).toHaveCount(1);
    await expect(main(p)).toContainText('Im Browser blockiert – bitte in den Einstellungen des Handys erlauben');
    await expect(main(p)).toContainText('„Website-Einstellungen“ → „Benachrichtigungen“');
    await expect(main(p).getByRole('button', { name: /aktivieren/ })).toHaveCount(0);
    expect(rpcCalls(fake, 'register_push')).toHaveLength(0);
    expect((await pushState<{ subscribeCalls: unknown[] }>(p)).subscribeCalls).toHaveLength(0);
  });

  test('Schlüssel noch nicht eingerichtet → „bitte gleich noch einmal versuchen“', async ({ browser }) => {
    const { fake } = setup();
    fake.vapidKey = null;
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { perm: 'granted' });
    await main(p).getByRole('button', { name: 'Benachrichtigungen auf diesem Gerät aktivieren' }).click();
    await expect(status(p, 'Benachrichtigungen werden eingerichtet – bitte gleich noch einmal versuchen.')).toHaveCount(1);
    expect(fake.db.push_subscriptions).toHaveLength(0);
    fake.vapidKey = 'BOr7mQ8w0r4Yp3FQnpxV6jbh5Rz9v5Ecd8XyO6rVb6Ff8w3S0pG3CpAuZ1QnY0Zl7k9mJgN7bW3fXyH2QzJk1Lc';
    await main(p).getByRole('button', { name: 'Benachrichtigungen auf diesem Gerät aktivieren' }).click();
    await expect(main(p)).toContainText('Auf diesem Gerät aktiv');
  });

  test('iPhone im Browser: Erklärung zum Home-Bildschirm statt Knopf', async ({ browser }) => {
    const { fake } = setup();
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { ctx: { userAgent: ua } });
    await expect(main(p)).toContainText('Auf iPhone und iPad gibt es Benachrichtigungen nur, wenn PetConnect über „Zum Home-Bildschirm“ hinzugefügt wurde (ab iOS 16.4).');
    await expect(main(p)).toContainText('„Zum Home-Bildschirm“ wählen');
    await expect(main(p).getByRole('button', { name: /aktivieren/ })).toHaveCount(0);
  });

  test('Ohne Service Worker (Browser ohne Unterstützung): verständlicher Text', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { stub: false });
    await expect(main(p)).toContainText('Dieser Browser unterstützt keine Benachrichtigungen');
    await expect(main(p).getByRole('button', { name: /aktivieren/ })).toHaveCount(0);
  });
});

test.describe('Einstellungen und Testnachricht', () => {
  test('Schalter und Uhrzeit: erst insert, danach update; „Gespeichert.“', async ({ browser }) => {
    const { fake, ahmed } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { perm: 'granted' });
    const med = main(p).getByRole('switch', { name: 'Medikamente' });
    await expect(med).toHaveAttribute('aria-checked', 'true');
    await expect(main(p).getByRole('switch', { name: 'Termine (1 Stunde vorher)' })).toHaveAttribute('aria-checked', 'true');
    await expect(main(p).getByLabel('Uhrzeit für Erinnerungen')).toHaveValue('09:00');
    await med.click();
    await expect(med).toHaveAttribute('aria-checked', 'false');
    await expect(main(p).getByText('Gespeichert.')).toBeVisible();
    expect(fake.db.notification_prefs).toMatchObject([{ user_id: ahmed.id, medication: false, reminders: true, appointments: true, reminder_time: '09:00:00' }]);
    await main(p).getByLabel('Uhrzeit für Erinnerungen').fill('07:30');
    await expect.poll(() => fake.db.notification_prefs![0]!.reminder_time).toBe('07:30:00');
    const writes = fake.calls.filter((c) => c.path.startsWith('/rest/v1/notification_prefs') && c.method !== 'GET').map((c) => c.method);
    expect(writes[0]).toBe('POST');
    expect(writes.slice(1).every((m) => m === 'PATCH')).toBe(true);
    expect(fake.db.notification_prefs).toHaveLength(1);
    // nach Neuladen gelesen
    await p.reload(); await p.waitForLoadState('networkidle');
    await expect(main(p).getByRole('switch', { name: 'Medikamente' })).toHaveAttribute('aria-checked', 'false');
    await expect(main(p).getByLabel('Uhrzeit für Erinnerungen')).toHaveValue('07:30');
    // Erinnerungen aus → Uhrzeit gesperrt
    await main(p).getByRole('switch', { name: 'Erinnerungen' }).click();
    await expect(main(p).getByLabel('Uhrzeit für Erinnerungen')).toBeDisabled();
    await expect.poll(() => fake.db.notification_prefs![0]!.reminders).toBe(false);
  });

  test('„Testnachricht anzeigen“ zeigt lokal eine Benachrichtigung (kein Serveraufruf)', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr/benachrichtigungen', { perm: 'granted' });
    const before = fake.calls.length;
    await main(p).getByRole('button', { name: 'Testnachricht anzeigen' }).click();
    await expect(status(p, 'Testnachricht angezeigt.')).toHaveCount(1);
    const shown = (await pushState<{ shown: Record<string, unknown>[] }>(p)).shown;
    expect(shown).toEqual([{ title: 'Luna: Meloxicam', body: 'Beispiel: Medikament um 08:00 Uhr · 0,5 ml · mit Futter. So sehen Benachrichtigungen aus.', tag: 'petconnect-test', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: '/erinnerungen' } }]);
    expect(fake.calls.slice(before).filter((c) => !c.path.startsWith('/auth/'))).toEqual([]);
  });
});

test.describe('Hinweis und öffentliche Seiten', () => {
  test('Erinnerungen: Hinweis nur ohne aktives Gerät, „Nicht mehr anzeigen“ merkt es sich', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen', { perm: 'granted' });
    const hint = main(p).getByRole('complementary', { name: 'Hinweis zu Benachrichtigungen' });
    await expect(hint).toContainText('Möchten Sie zur Uhrzeit erinnert werden? Benachrichtigungen aktivieren');
    await expect(hint.getByRole('link', { name: 'Benachrichtigungen aktivieren' })).toHaveAttribute('href', '/mehr/benachrichtigungen');
    // aktivieren → Hinweis weg
    await hint.getByRole('link', { name: 'Benachrichtigungen aktivieren' }).click();
    await main(p).getByRole('button', { name: 'Benachrichtigungen auf diesem Gerät aktivieren' }).click();
    await expect(main(p)).toContainText('Auf diesem Gerät aktiv');
    await p.goto('/erinnerungen'); await p.waitForLoadState('networkidle');
    await expect(main(p).getByRole('heading', { name: 'Erinnerungen', level: 1 })).toBeVisible();
    await expect(hint).toHaveCount(0);
    // anderes Gerät ohne Anmeldung: Hinweis da, „Nicht mehr anzeigen“
    const q = await openAs(browser, fake, 'ahmed@test.invalid', '/erinnerungen', { perm: 'granted' });
    const h2 = main(q).getByRole('complementary', { name: 'Hinweis zu Benachrichtigungen' });
    await expect(h2).toBeVisible();
    await h2.getByRole('button', { name: 'Nicht mehr anzeigen' }).click();
    await expect(h2).toHaveCount(0);
    await q.reload(); await q.waitForLoadState('networkidle');
    await expect(main(q).getByRole('heading', { name: 'Erinnerungen', level: 1 })).toBeVisible();
    await q.waitForTimeout(300);
    await expect(h2).toHaveCount(0);
  });

  test('Nach dem ersten gespeicherten Medikament erscheint der Hinweis', async ({ browser }) => {
    const { fake } = setup();
    const p = await openAs(browser, fake, 'ahmed@test.invalid', '/tier', { perm: 'granted' });
    const card = main(p).locator('section').filter({ has: p.getByRole('heading', { name: 'Medikation', level: 2, exact: true }) });
    await expect(card.getByRole('complementary', { name: 'Hinweis zu Benachrichtigungen' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Medikament eintragen' }).click();
    await card.getByRole('textbox', { name: /^Präparat/ }).fill('Apoquel');
    await card.getByRole('textbox', { name: /^Menge pro Gabe/ }).fill('1');
    await card.getByRole('button', { name: 'Speichern' }).click();
    await expect(card.getByRole('complementary', { name: 'Hinweis zu Benachrichtigungen' })).toBeVisible();
  });

  test('/datenschutz und /impressum ohne Anmeldung; Links auf der Anmeldeseite und unter „Mehr“; Konto löschen', async ({ browser }) => {
    const { fake } = setup();
    const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    await fake.installContext(ctx);
    const p = await ctx.newPage();
    const list: string[] = [];
    errors.set(p, list);
    p.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
    await p.goto('/login');
    // Einführung vor der Anmeldung überspringen (falls sichtbar)
    await p.getByRole('button', { name: 'Jetzt anmelden' }).click({ timeout: 2000 }).catch(() => {});
    await p.getByRole('link', { name: 'Datenschutz' }).click();
    await expect(p).toHaveURL(/\/datenschutz$/);
    await expect(p.getByRole('heading', { name: 'Datenschutz', level: 1 })).toBeVisible();
    // seit 10b ausgefüllt: keine Platzhalter mehr
    for (const text of ['Ahmed Rajouani', 'Hessenring 104', '65428 Rüsselsheim am Main', 'info@petconnect24.com', 'Stand: Oktober 2026', 'Der Hessische Beauftragte für Datenschutz und Informationsfreiheit', 'Art. 6 Abs. 1 lit. b DSGVO', 'Alle Schriftarten sind lokal eingebunden; es wird keine Verbindung zu Google Fonts aufgebaut.', 'Namecheap, Inc. (USA)', '§ 25 Abs. 2 Nr. 2 TDDDG']) await expect(p.locator('#main'), text).toContainText(text);
    await expect(p.locator('#main')).not.toContainText('BITTE ERGÄNZEN');
    await expect(p.locator('#main').getByRole('heading', { level: 2 })).toHaveCount(14);
    await expect(p.locator('#main').getByRole('link', { name: 'info@petconnect24.com' }).first()).toHaveAttribute('href', 'mailto:info@petconnect24.com');
    await expect(p.locator('#main')).toContainText('Region eu-central-1 (Frankfurt am Main, Deutschland)');
    await expect(p.locator('#main')).toContainText('Google Firebase Cloud Messaging');
    await expect(p.locator('#main')).toContainText('Es gibt keine Werbung, kein Tracking, keine Analyse-Dienste und keine Cookies zu Werbe- oder Analysezwecken.');
    await expect(p.locator('#main')).toContainText('© OpenStreetMap-Mitwirkende');
    await p.goto('/impressum');
    await expect(p.getByRole('heading', { name: 'Impressum', level: 1 })).toBeVisible();
    for (const text of ['Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)', 'Ahmed Rajouani', 'Hessenring 104', '65428 Rüsselsheim am Main', 'Deutschland', 'Verbraucherstreitbeilegung', 'Haftung für Links']) await expect(p.locator('#main'), text).toContainText(text);
    await expect(p.locator('#main')).not.toContainText('BITTE ERGÄNZEN');
    await expect(p.locator('#main')).not.toContainText('Telefon');
    await expect(p.locator('#main')).not.toContainText('Prototyp');
    await expect(p.locator('#main').getByRole('link', { name: 'info@petconnect24.com' })).toHaveAttribute('href', 'mailto:info@petconnect24.com');
    await p.getByRole('link', { name: 'Zur Anmeldung' }).click();
    await expect(p).toHaveURL(/\/login$/);
    // unter „Mehr“ (angemeldet) und Konto löschen
    const m = await openAs(browser, fake, 'ahmed@test.invalid', '/mehr');
    await expect(main(m).getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
    await expect(main(m).getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    await main(m).getByRole('button', { name: 'Konto löschen' }).click();
    const dlg = m.getByRole('dialog', { name: 'Konto löschen' });
    await expect(dlg).toContainText('Gelöscht werden Ihr Konto und alle Tiere, deren Besitzer:in Sie sind');
    const href = await dlg.getByRole('link', { name: 'E-Mail vorbereiten' }).getAttribute('href');
    expect(href).toBe(`mailto:info@petconnect24.com?subject=${encodeURIComponent('PetConnect: Konto löschen')}&body=${encodeURIComponent('Bitte löschen Sie mein PetConnect-Konto (ahmed@test.invalid) mit allen zugehörigen Daten.')}`);
    await dlg.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dlg).toBeHidden();
    expect(fake.db.pets).toHaveLength(1); // nichts automatisch gelöscht
  });
});
